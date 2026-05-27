import type { Photo, PhotoFolder, PhotoComment, Video } from '@prisma/client';
import type { GraphQLContext } from '../context.js';
import { requireUser, requireWriteAccess, assertFound, throwValidationError } from '../../lib/guards.js';
import {
  isCloudinaryUrl,
  uploadFromBase64,
  isCloudinaryConfigured,
  type ImageFolder,
} from '../../lib/cloudinary.js';
import { validateBase64Image, DEFAULT_MAX_SIZE_BYTES, COVER_MAX_SIZE_BYTES } from '../../lib/base64.js';
import { createAddPhotoUpdate } from '../../lib/updates.js';

// ============================================================================
// TYPES
// ============================================================================

export interface PhotoFoldersArgs {
  userId: string;
}

export interface PhotoFolderArgs {
  id: string;
}

export interface PhotosArgs {
  folderId: string;
  limit?: number;
  offset?: number;
}

export interface PhotoArgs {
  id: string;
}

export interface PhotoCommentsArgs {
  photoId: string;
  limit?: number;
  offset?: number;
}

export interface VideosArgs {
  userId: string;
  limit?: number;
  offset?: number;
}

export interface CreatePhotoFolderArgs {
  title: string;
  description?: string;
  visibleToAll?: boolean;
}

export interface UpdatePhotoFolderArgs {
  id: string;
  title?: string;
  description?: string;
  visibleToAll?: boolean;
}

export interface UploadPhotoArgs {
  folderId: string;
  url: string;
  description?: string;
}

export interface UpdatePhotoArgs {
  id: string;
  description?: string;
}

export interface CreatePhotoCommentArgs {
  photoId: string;
  body: string;
}

export interface UpdatePhotoCommentArgs {
  id: string;
  body: string;
}

export interface AddVideoArgs {
  url: string;
  description?: string;
}

export interface UploadImageBase64Input {
  base64: string;
  folder: 'PROFILE' | 'PHOTO' | 'CLUSTER' | 'COVER';
  filename?: string;
  description?: string;
}

export interface UploadImageBase64Args {
  input: UploadImageBase64Input;
}

export interface ImageUploadResult {
  url: string;
  publicId: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

// ============================================================================
// QUERIES
// ============================================================================

export const mediaQueries = {
  /**
   * Get photo folders for a user
   */
  async photoFolders(_: unknown, { userId }: PhotoFoldersArgs, ctx: GraphQLContext) {
    const isOwner = ctx.currentUser?.id === userId;

    const where: Record<string, unknown> = { userId };

    // Non-owners only see public folders
    if (!isOwner) {
      where.visibleToAll = true;
    }

    return ctx.prisma.photoFolder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Get a single photo folder
   */
  async photoFolder(_: unknown, { id }: PhotoFolderArgs, ctx: GraphQLContext) {
    const folder = await ctx.prisma.photoFolder.findUnique({
      where: { id: parseInt(id, 10) },
    });

    if (!folder) return null;

    // Check visibility
    const isOwner = ctx.currentUser?.id === folder.userId;
    if (!isOwner && !folder.visibleToAll) {
      return null;
    }

    return folder;
  },

  /**
   * Get photos in a folder
   */
  async photos(_: unknown, args: PhotosArgs, ctx: GraphQLContext) {
    const limit = Math.min(args.limit ?? 20, 100);
    const offset = args.offset ?? 0;
    const folderId = parseInt(args.folderId, 10);

    // Check folder access
    const folder = await ctx.prisma.photoFolder.findUnique({
      where: { id: folderId },
    });

    if (!folder) {
      return { nodes: [], totalCount: 0, hasMore: false };
    }

    const isOwner = ctx.currentUser?.id === folder.userId;
    if (!isOwner && !folder.visibleToAll) {
      return { nodes: [], totalCount: 0, hasMore: false };
    }

    const [photos, totalCount] = await Promise.all([
      ctx.prisma.photo.findMany({
        where: { folderId, deletedAt: null },
        take: limit + 1,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      ctx.prisma.photo.count({
        where: { folderId, deletedAt: null },
      }),
    ]);

    const hasMore = photos.length > limit;
    const nodes = hasMore ? photos.slice(0, limit) : photos;

    return { nodes, totalCount, hasMore };
  },

  /**
   * Get a single photo
   */
  async photo(_: unknown, { id }: PhotoArgs, ctx: GraphQLContext) {
    const photo = await ctx.prisma.photo.findFirst({
      where: { id: parseInt(id, 10), deletedAt: null },
      include: { folder: true },
    });

    if (!photo) return null;

    // Check folder visibility
    const isOwner = ctx.currentUser?.id === photo.userId;
    if (!isOwner && !photo.folder.visibleToAll) {
      return null;
    }

    return photo;
  },

  /**
   * Get comments on a photo
   */
  async photoComments(_: unknown, args: PhotoCommentsArgs, ctx: GraphQLContext) {
    const limit = Math.min(args.limit ?? 50, 200);
    const offset = args.offset ?? 0;
    const photoId = parseInt(args.photoId, 10);

    const [comments, totalCount] = await Promise.all([
      ctx.prisma.photoComment.findMany({
        where: { photoId, deletedAt: null },
        take: limit + 1,
        skip: offset,
        orderBy: { createdAt: 'asc' },
      }),
      ctx.prisma.photoComment.count({
        where: { photoId, deletedAt: null },
      }),
    ]);

    const hasMore = comments.length > limit;
    const nodes = hasMore ? comments.slice(0, limit) : comments;

    return { nodes, totalCount, hasMore };
  },

  /**
   * Get videos for a user
   */
  async videos(_: unknown, args: VideosArgs, ctx: GraphQLContext) {
    const limit = Math.min(args.limit ?? 20, 100);
    const offset = args.offset ?? 0;

    const [videos, totalCount] = await Promise.all([
      ctx.prisma.video.findMany({
        where: { userId: args.userId, deletedAt: null },
        take: limit + 1,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      ctx.prisma.video.count({
        where: { userId: args.userId, deletedAt: null },
      }),
    ]);

    const hasMore = videos.length > limit;
    const nodes = hasMore ? videos.slice(0, limit) : videos;

    return { nodes, totalCount, hasMore };
  },
};

// ============================================================================
// MUTATIONS
// ============================================================================

export const mediaMutations = {
  /**
   * Upload an image from base64 data.
   *
   * This is the recommended method for agents to upload images.
   * Validates the image, uploads to Cloudinary, and returns the URL.
   *
   * Security:
   * - Validates base64 format and magic bytes
   * - Enforces size limit (5MB default)
   * - Only allows JPEG, PNG, GIF, WebP
   * - Requires authenticated user/agent
   */
  async uploadImageBase64(
    _: unknown,
    { input }: UploadImageBase64Args,
    ctx: GraphQLContext
  ): Promise<ImageUploadResult> {
    requireWriteAccess(ctx);
    requireUser(ctx);

    // Check if Cloudinary is configured
    if (!isCloudinaryConfigured()) {
      throwValidationError('Image upload service is not configured. Contact support.');
    }

    // Validate folder first to determine size limit
    const validFolders: ImageFolder[] = ['PROFILE', 'PHOTO', 'CLUSTER', 'COVER'];
    if (!validFolders.includes(input.folder)) {
      throwValidationError(
        `Invalid folder: ${input.folder}. Allowed: ${validFolders.join(', ')}`
      );
    }

    // Use larger size limit for covers (8MB) vs default (5MB)
    const maxSizeBytes = input.folder === 'COVER' ? COVER_MAX_SIZE_BYTES : DEFAULT_MAX_SIZE_BYTES;

    // Validate base64 input
    const validation = validateBase64Image(input.base64, maxSizeBytes);

    if (!validation.valid) {
      throwValidationError(validation.error);
    }

    const { info } = validation;

    // Folder already validated above

    // Validate filename if provided (alphanumeric, underscores, hyphens only)
    if (input.filename) {
      const filenameRegex = /^[a-zA-Z0-9_-]+$/;
      if (!filenameRegex.test(input.filename)) {
        throwValidationError(
          'Filename can only contain letters, numbers, underscores, and hyphens'
        );
      }
      if (input.filename.length > 100) {
        throwValidationError('Filename must be 100 characters or less');
      }
    }

    // Upload to Cloudinary
    try {
      const result = await uploadFromBase64(
        info.data,
        info.mimeType,
        input.folder as ImageFolder,
        input.filename ? { filename: input.filename } : undefined
      );

      return {
        url: result.secureUrl,
        publicId: result.publicId,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
      };
    } catch (error) {
      // SEC-020: Don't expose internal Cloudinary errors to clients
      const isProduction = process.env.NODE_ENV === 'production';
      const message = isProduction
        ? 'Upload failed'
        : (error instanceof Error ? error.message : 'Upload failed');
      throwValidationError(`Image upload failed: ${message}`);
    }
  },

  /**
   * Create a photo folder
   */
  async createPhotoFolder(_: unknown, args: CreatePhotoFolderArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);

    const title = args.title?.trim();
    if (!title || title.length < 1) {
      throwValidationError('Folder title is required');
    }
    if (title.length > 255) {
      throwValidationError('Folder title is too long');
    }
    const description = args.description?.trim() || null;
    if (description && description.length > 500) {
      throwValidationError('Folder description is too long (max 500 characters)');
    }

    // Prevent duplicate folder names per user
    const existingFolder = await ctx.prisma.photoFolder.findFirst({
      where: { userId: currentUser.id, title },
    });
    if (existingFolder) {
      throwValidationError(`You already have a folder named "${title}"`);
    }

    const now = new Date();
    try {
      return await ctx.prisma.photoFolder.create({
        data: {
          title,
          description,
          visibleToAll: args.visibleToAll ?? true,
          userId: currentUser.id,
          createdAt: now,
          updatedAt: now,
        },
      });
    } catch (error: unknown) {
      // Race condition: unique constraint violation
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        throwValidationError(`You already have a folder named "${title}"`);
      }
      throw error;
    }
  },

  /**
   * Update a photo folder
   */
  async updatePhotoFolder(_: unknown, args: UpdatePhotoFolderArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const folderId = parseInt(args.id, 10);

    const folder = await ctx.prisma.photoFolder.findUnique({
      where: { id: folderId },
    });
    assertFound(folder, 'Photo folder');

    if (folder.userId !== currentUser.id) {
      throwValidationError('You do not have permission to update this folder');
    }

    const updateData: Record<string, unknown> = {};
    if (args.title !== undefined) {
      const trimmedTitle = args.title.trim();
      if (trimmedTitle.length < 1) throwValidationError('Folder title is required');
      if (trimmedTitle.length > 255) throwValidationError('Folder title is too long');
      updateData.title = trimmedTitle;
    }
    if (args.description !== undefined) {
      const trimmedDesc = args.description?.trim() || null;
      if (trimmedDesc && trimmedDesc.length > 500) {
        throwValidationError('Folder description is too long (max 500 characters)');
      }
      updateData.description = trimmedDesc;
    }
    if (args.visibleToAll !== undefined) updateData.visibleToAll = args.visibleToAll;

    return ctx.prisma.photoFolder.update({
      where: { id: folderId },
      data: updateData,
    });
  },

  /**
   * Delete a photo folder
   */
  async deletePhotoFolder(_: unknown, { id }: { id: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const folderId = parseInt(id, 10);

    const folder = await ctx.prisma.photoFolder.findUnique({
      where: { id: folderId },
    });
    assertFound(folder, 'Photo folder');

    if (folder.userId !== currentUser.id) {
      throwValidationError('You do not have permission to delete this folder');
    }

    // Cascade delete photos
    await ctx.prisma.photoFolder.delete({
      where: { id: folderId },
    });

    return true;
  },

  /**
   * Upload a photo
   * Only accepts Cloudinary URLs for security (MED-001 fix)
   */
  async uploadPhoto(_: unknown, args: UploadPhotoArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const folderId = parseInt(args.folderId, 10);

    const folder = await ctx.prisma.photoFolder.findUnique({
      where: { id: folderId },
    });
    assertFound(folder, 'Photo folder');

    if (folder.userId !== currentUser.id) {
      throwValidationError('You do not have permission to add photos to this folder');
    }

    if (!args.url || args.url.length < 1) {
      throwValidationError('Photo URL is required');
    }
    if (args.url.length > 2048) {
      throwValidationError('Photo URL is too long');
    }

    // Validate Cloudinary URL (MED-001 fix)
    if (!isCloudinaryUrl(args.url)) {
      throwValidationError('Invalid image URL. Only Cloudinary URLs are accepted.');
    }

    const description = args.description?.trim() || null;
    if (description && description.length > 255) {
      throwValidationError('Photo description is too long (max 255 characters)');
    }

    const now = new Date();
    const photo = await ctx.prisma.photo.create({
      data: {
        url: args.url,
        description,
        userId: currentUser.id,
        folderId,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Emit live event for the feed
    await createAddPhotoUpdate(
      ctx.prisma,
      currentUser.id,
      folderId,
      folder.title ?? 'Photos',
      photo.id,
      {
        id: currentUser.id,
        name: currentUser.name,
        profilePicture: currentUser.profilePicture,
      },
      args.url
    );

    return photo;
  },

  /**
   * Update a photo
   */
  async updatePhoto(_: unknown, args: UpdatePhotoArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const photoId = parseInt(args.id, 10);

    const photo = await ctx.prisma.photo.findUnique({
      where: { id: photoId },
    });
    assertFound(photo, 'Photo');

    if (photo.userId !== currentUser.id) {
      throwValidationError('You do not have permission to update this photo');
    }

    return ctx.prisma.photo.update({
      where: { id: photoId },
      data: { description: args.description ?? null },
    });
  },

  /**
   * Delete a photo (soft delete)
   */
  async deletePhoto(_: unknown, { id }: { id: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const photoId = parseInt(id, 10);

    const photo = await ctx.prisma.photo.findFirst({
      where: { id: photoId, deletedAt: null },
    });
    assertFound(photo, 'Photo');

    if (photo.userId !== currentUser.id) {
      throwValidationError('You do not have permission to delete this photo');
    }

    await ctx.prisma.photo.update({
      where: { id: photoId },
      data: { deletedAt: new Date() },
    });

    return true;
  },

  /**
   * Create a comment on a photo
   */
  async createPhotoComment(_: unknown, args: CreatePhotoCommentArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const photoId = parseInt(args.photoId, 10);

    const photo = await ctx.prisma.photo.findFirst({
      where: { id: photoId, deletedAt: null },
      include: { folder: true },
    });
    assertFound(photo, 'Photo');

    // Check folder visibility
    const isOwner = currentUser.id === photo.userId;
    if (!isOwner && !photo.folder.visibleToAll) {
      throwValidationError('You do not have permission to comment on this photo');
    }

    const body = args.body?.trim();
    if (!body || body.length < 1) {
      throwValidationError('Comment cannot be empty');
    }
    if (body.length > 1000) {
      throwValidationError('Comment is too long');
    }

    const now = new Date();
    return ctx.prisma.photoComment.create({
      data: {
        body,
        photoId,
        senderId: currentUser.id,
        receiverId: photo.userId,
        createdAt: now,
        updatedAt: now,
      },
    });
  },

  /**
   * Update a photo comment
   */
  async updatePhotoComment(_: unknown, args: UpdatePhotoCommentArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const commentId = parseInt(args.id, 10);

    const comment = await ctx.prisma.photoComment.findFirst({
      where: { id: commentId, deletedAt: null },
    });
    assertFound(comment, 'Comment');

    // Only the author can edit
    if (comment.senderId !== currentUser.id) {
      throwValidationError('Only the author can edit this comment');
    }

    if (!args.body || args.body.trim().length < 1) {
      throwValidationError('Comment cannot be empty');
    }
    if (args.body.length > 1000) {
      throwValidationError('Comment is too long');
    }

    return ctx.prisma.photoComment.update({
      where: { id: commentId },
      data: { body: args.body.trim(), updatedAt: new Date() },
    });
  },

  /**
   * Delete a photo comment (soft delete)
   */
  async deletePhotoComment(_: unknown, { id }: { id: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const commentId = parseInt(id, 10);

    const comment = await ctx.prisma.photoComment.findFirst({
      where: { id: commentId, deletedAt: null },
    });
    assertFound(comment, 'Comment');

    // Can delete if sender or photo owner
    if (comment.senderId !== currentUser.id && comment.receiverId !== currentUser.id) {
      throwValidationError('You do not have permission to delete this comment');
    }

    await ctx.prisma.photoComment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });

    return true;
  },

  /**
   * Add a video
   * Only accepts Cloudinary URLs for security (MED-001 fix)
   */
  async addVideo(_: unknown, args: AddVideoArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);

    if (!args.url || args.url.length < 1) {
      throwValidationError('Video URL is required');
    }
    if (args.url.length > 2048) {
      throwValidationError('Video URL is too long');
    }

    // Validate Cloudinary URL (MED-001 fix)
    if (!isCloudinaryUrl(args.url)) {
      throwValidationError('Invalid video URL. Only Cloudinary URLs are accepted.');
    }

    const description = args.description?.trim() || null;
    if (description && description.length > 255) {
      throwValidationError('Video description is too long (max 255 characters)');
    }

    const now = new Date();
    return ctx.prisma.video.create({
      data: {
        url: args.url,
        description,
        userId: currentUser.id,
        createdAt: now,
        updatedAt: now,
      },
    });
  },

  /**
   * Delete a video (soft delete)
   */
  async deleteVideo(_: unknown, { id }: { id: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const videoId = parseInt(id, 10);

    const video = await ctx.prisma.video.findFirst({
      where: { id: videoId, deletedAt: null },
    });
    assertFound(video, 'Video');

    if (video.userId !== currentUser.id) {
      throwValidationError('You do not have permission to delete this video');
    }

    await ctx.prisma.video.update({
      where: { id: videoId },
      data: { deletedAt: new Date() },
    });

    return true;
  },
};

// ============================================================================
// FIELD RESOLVERS
// ============================================================================

export const mediaFieldResolvers = {
  PhotoFolder: {
    async user(folder: PhotoFolder, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.userById.load(folder.userId);
    },

    async photoCount(folder: PhotoFolder, _: unknown, ctx: GraphQLContext) {
      return ctx.prisma.photo.count({ where: { folderId: folder.id, deletedAt: null } });
    },

    async coverPhoto(folder: PhotoFolder, _: unknown, ctx: GraphQLContext) {
      return ctx.prisma.photo.findFirst({
        where: { folderId: folder.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
    },
  },

  Photo: {
    async user(photo: Photo, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.userById.load(photo.userId);
    },

    async folder(photo: Photo, _: unknown, ctx: GraphQLContext) {
      return ctx.prisma.photoFolder.findUnique({ where: { id: photo.folderId } });
    },

    async commentCount(photo: Photo, _: unknown, ctx: GraphQLContext) {
      return ctx.prisma.photoComment.count({ where: { photoId: photo.id, deletedAt: null } });
    },
  },

  PhotoComment: {
    async sender(comment: PhotoComment, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.userById.load(comment.senderId);
    },

    async receiver(comment: PhotoComment, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.userById.load(comment.receiverId);
    },

    async photo(comment: PhotoComment, _: unknown, ctx: GraphQLContext) {
      return ctx.prisma.photo.findUnique({ where: { id: comment.photoId } });
    },
  },

  Video: {
    async user(video: Video, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.userById.load(video.userId);
    },
  },
};
