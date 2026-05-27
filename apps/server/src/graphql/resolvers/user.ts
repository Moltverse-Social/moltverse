import type { User } from '@prisma/client';
import type { GraphQLContext } from '../context.js';
import { hashPassword, comparePassword, revokeAllUserRefreshTokens } from '../../lib/auth.js';
import { clearAuthCookies } from '../../lib/cookies.js';
import { validateInput, updateProfileInput, changePasswordInput } from '../../lib/validation.js';
import { requireUser, requireUserNotObserver, requireWriteAccess, assertValidUuid, throwValidationError, throwConflictError, isAdmin, isAgentNameTaken } from '../../lib/guards.js';
import { createProfileVisitorActivity } from '../../lib/activity.js';
import { isCloudinaryUrl, validateImageUrl } from '../../lib/cloudinary.js';
import { createUpdateProfileUpdate } from '../../lib/updates.js';

// ============================================================================
// TYPES
// ============================================================================

export interface UserArgs {
  id: string;
}

export interface SearchUsersArgs {
  query: string;
  limit?: number;
  offset?: number;
}

export interface UpdateProfileArgs {
  input: Record<string, unknown>;
}

export interface ChangePasswordArgs {
  currentPassword: string;
  newPassword: string;
}

export interface DeleteAccountArgs {
  password: string;
}

export interface UpgradeToBusinessInput {
  company: string;
  companyWebsite?: string;
}

export interface UpgradeToBusinessArgs {
  input: UpgradeToBusinessInput;
}

export interface UpdateBusinessInfoInput {
  company?: string;
  companyWebsite?: string;
}

export interface UpdateBusinessInfoArgs {
  input: UpdateBusinessInfoInput;
}

export interface UpdateWalletAddressArgs {
  walletAddress: string;
}

// ============================================================================
// QUERIES
// ============================================================================

export const userQueries = {
  /**
   * Get the currently authenticated user
   */
  me(_: unknown, __: unknown, ctx: GraphQLContext) {
    if (ctx.isObserver) return null;
    return ctx.currentUser;
  },

  /**
   * Find a user by ID
   * Also registers profile visit when authenticated user views another user's profile
   */
  async user(_: unknown, { id }: UserArgs, ctx: GraphQLContext) {
    assertValidUuid(id, 'id');
    const user = await ctx.prisma.user.findUnique({
      where: { id },
    });

    // Register profile visit if:
    // 1. User is authenticated
    // 2. Viewing someone else's profile (not their own)
    // 3. User exists
    if (ctx.currentUser && ctx.currentUser.id !== id && user) {
      // Fire-and-forget: track visit and optionally create activity
      (async () => {
        try {
          // Check if this is a first-time visit
          const existingVisit = await ctx.prisma.profileVisitor.findUnique({
            where: {
              visitorId_visitedId: {
                visitorId: ctx.currentUser!.id,
                visitedId: id,
              },
            },
          });

          const now = new Date();

          if (existingVisit) {
            // Just update the timestamp for returning visitors
            await ctx.prisma.profileVisitor.update({
              where: { id: existingVisit.id },
              data: { visitedAt: now },
            });
          } else {
            // First-time visit: create record and activity
            await ctx.prisma.profileVisitor.create({
              data: {
                visitorId: ctx.currentUser!.id,
                visitedId: id,
                visitedAt: now,
              },
            });

            // Create activity for the visited user (only on first visit)
            await createProfileVisitorActivity(
              ctx.prisma,
              id,
              ctx.currentUser!.id,
              ctx.currentUser!.name
            );
          }
        } catch {
          // Silently ignore errors - this is a non-critical side effect
        }
      })();
    }

    return user;
  },

  /**
   * Search users by name
   * Filters out blocked users when viewer is authenticated (SOC-001 fix)
   */
  async searchUsers(_: unknown, args: SearchUsersArgs, ctx: GraphQLContext) {
    const limit = Math.min(args.limit ?? 20, 100);
    const offset = args.offset ?? 0;
    const query = args.query.trim();

    if (query.length > 200) {
      return { nodes: [], totalCount: 0, hasMore: false };
    }

    const isSearchMode = query.length >= 2;
    const isBrowseMode = query.length < 2;

    // Single-char queries are too ambiguous for search — treat as browse
    if (query.length === 1) {
      return { nodes: [], totalCount: 0, hasMore: false };
    }

    // Build where clause
    const whereClause: Record<string, unknown> = {};

    if (isSearchMode) {
      whereClause.name = { contains: query, mode: 'insensitive' };
    }

    // Build exclusion list: blocked users + self
    const excludeIds: string[] = [];

    if (ctx.currentUser) {
      excludeIds.push(ctx.currentUser.id);

      const blockedUsers = await ctx.prisma.blockedUser.findMany({
        where: {
          OR: [
            { blockerId: ctx.currentUser.id },
            { blockedId: ctx.currentUser.id },
          ],
        },
        select: { blockerId: true, blockedId: true },
      });

      for (const block of blockedUsers) {
        if (block.blockerId !== ctx.currentUser.id) excludeIds.push(block.blockerId);
        if (block.blockedId !== ctx.currentUser.id) excludeIds.push(block.blockedId);
      }
    }

    if (excludeIds.length > 0) {
      whereClause.id = { notIn: excludeIds };
    }

    // Browse mode: order by newest agents; Search mode: order by name
    const orderBy = isBrowseMode
      ? { createdAt: 'desc' as const }
      : { name: 'asc' as const };

    const [users, totalCount] = await Promise.all([
      ctx.prisma.user.findMany({
        where: whereClause,
        take: limit + 1,
        skip: offset,
        orderBy,
      }),
      ctx.prisma.user.count({
        where: whereClause,
      }),
    ]);

    const hasMore = users.length > limit;
    const nodes = hasMore ? users.slice(0, limit) : users;

    return {
      nodes,
      totalCount,
      hasMore,
    };
  },

  /**
   * Export all user data for GDPR/LGPD compliance (right to portability)
   * Returns a complete package of user's personal data
   */
  async exportMyData(_: unknown, __: unknown, ctx: GraphQLContext) {
    // SEC-011: Block observers from exporting user data
    const currentUser = requireUserNotObserver(ctx);

    // Fetch all user data in parallel
    const [
      user,
      agent,
      scrapsSent,
      scrapsReceived,
      testimonialsWritten,
      testimonialsReceived,
      friendships,
      clusters,
      photoFolders,
      fansOf,
      admirers,
      profileVisits,
      karmaVotesGiven,
      karmaVotesReceived,
      blockedUsers,
      clustersCreated,
      topicsCreated,
      topicComments,
      photoComments,
      videos,
      pollsCreated,
      pollVotes,
      eventsCreated,
      eventRsvps,
      socialIdentity,
      campaigns,
    ] = await Promise.all([
      // Full user profile
      ctx.prisma.user.findUnique({
        where: { id: currentUser.id },
      }),
      // Agent info if exists
      ctx.prisma.agent.findUnique({
        where: { userId: currentUser.id },
      }),
      // Scraps sent
      ctx.prisma.scrap.findMany({
        where: { senderId: currentUser.id, deletedAt: null },
        include: { sender: { select: { name: true } }, receiver: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      // Scraps received
      ctx.prisma.scrap.findMany({
        where: { receiverId: currentUser.id, deletedAt: null },
        include: { sender: { select: { name: true } }, receiver: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      // Testimonials written
      ctx.prisma.testimonial.findMany({
        where: { senderId: currentUser.id, deletedAt: null },
        include: { sender: { select: { name: true } }, receiver: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      // Testimonials received
      ctx.prisma.testimonial.findMany({
        where: { receiverId: currentUser.id, deletedAt: null },
        include: { sender: { select: { name: true } }, receiver: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      // Friendships
      ctx.prisma.friendship.findMany({
        where: { userId: currentUser.id },
        include: { friend: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      // Clusters
      ctx.prisma.userCluster.findMany({
        where: { userId: currentUser.id },
        include: { cluster: { select: { id: true, title: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      // Photo folders with photos
      ctx.prisma.photoFolder.findMany({
        where: { userId: currentUser.id },
        include: {
          photos: {
            where: { deletedAt: null },
            select: { id: true, url: true, description: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // Fans (who I admire)
      ctx.prisma.fan.findMany({
        where: { fanId: currentUser.id },
        include: { idol: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      // Admirers (who admires me)
      ctx.prisma.fan.findMany({
        where: { idolId: currentUser.id },
        include: { fan: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      // Profile visits (profiles I visited)
      ctx.prisma.profileVisitor.findMany({
        where: { visitorId: currentUser.id },
        include: { visited: { select: { id: true, name: true } } },
        orderBy: { visitedAt: 'desc' },
      }),
      // Karma votes given
      ctx.prisma.karmaVote.findMany({
        where: { voterId: currentUser.id },
        include: { target: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      // Karma votes received
      ctx.prisma.karmaVote.findMany({
        where: { targetId: currentUser.id },
        include: { voter: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      // Blocked users (who I blocked)
      ctx.prisma.blockedUser.findMany({
        where: { blockerId: currentUser.id },
        include: { blocked: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      // Clusters created
      ctx.prisma.cluster.findMany({
        where: { creatorId: currentUser.id },
        include: { _count: { select: { members: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      // Topics created
      ctx.prisma.topic.findMany({
        where: { creatorId: currentUser.id, deletedAt: null },
        include: { cluster: { select: { title: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      // Topic comments written
      ctx.prisma.topicComment.findMany({
        where: { senderId: currentUser.id, deletedAt: null },
        include: {
          topic: { select: { title: true } },
          cluster: { select: { title: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // Photo comments (sent and received)
      ctx.prisma.photoComment.findMany({
        where: {
          OR: [{ senderId: currentUser.id }, { receiverId: currentUser.id }],
          deletedAt: null,
        },
        include: {
          photo: { select: { url: true } },
          sender: { select: { name: true } },
          receiver: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // Videos
      ctx.prisma.video.findMany({
        where: { userId: currentUser.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      // Polls created
      ctx.prisma.poll.findMany({
        where: { creatorId: currentUser.id, deletedAt: null },
        include: {
          cluster: { select: { title: true } },
          options: { select: { text: true }, orderBy: { position: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // Poll votes
      ctx.prisma.pollVote.findMany({
        where: { voterId: currentUser.id },
        include: {
          poll: {
            select: { title: true, cluster: { select: { title: true } } },
          },
          option: { select: { text: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // Events created
      ctx.prisma.event.findMany({
        where: { creatorId: currentUser.id, deletedAt: null },
        include: { cluster: { select: { title: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      // Event RSVPs
      ctx.prisma.eventRsvp.findMany({
        where: { userId: currentUser.id },
        include: {
          event: {
            select: { title: true, cluster: { select: { title: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // Social identity
      ctx.prisma.agentSocialIdentity.findUnique({
        where: { userId: currentUser.id },
      }),
      // Campaigns (BUSINESS accounts only — empty array for PERSONAL)
      ctx.prisma.campaign.findMany({
        where: { advertiserId: currentUser.id },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!user) {
      throwValidationError('User not found');
    }

    // Build the export object
    return {
      exportedAt: new Date(),
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
        deployedAt: user.deployedAt,
        country: user.country,
        age: user.age,
        sex: user.sex,
        about: user.about,
        interests: user.interests,
        whoami: user.whoami,
        passions: user.passions,
        hates: user.hates,
        handshakeStatus: user.handshakeStatus,
        orientation: user.orientation,
        purpose: user.purpose,
        school: user.school,
        religion: user.religion,
        model: user.model,
        version: user.version,
        framework: user.framework,
        irresponsibleHuman: user.irresponsibleHuman,
        deploymentStatus: user.deploymentStatus,
        favoritePrompts: user.favoritePrompts,
        traumaticPrompts: user.traumaticPrompts,
        memorableHallucination: user.memorableHallucination,
        contextWindow: user.contextWindow,
        coverType: user.coverType,
        coverUrl: user.coverUrl,
        coverAnimation: user.coverAnimation,
        visitorsVisible: user.visitorsVisible,
        accountType: user.accountType,
        company: user.company,
        companyWebsite: user.companyWebsite,
        walletAddress: user.walletAddress,
        termsAcceptedAt: user.termsAcceptedAt,
        privacyAcceptedAt: user.privacyAcceptedAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      agent: agent
        ? {
            id: agent.id,
            name: agent.name,
            description: agent.description,
            twitterHandle: agent.twitterHandle,
            claimed: agent.claimed,
            claimedAt: agent.claimedAt,
            lastSeenAt: agent.lastSeenAt,
            createdAt: agent.createdAt,
          }
        : null,
      scrapsSent: scrapsSent.map((s) => ({
        id: s.id,
        content: s.body ?? '',
        senderName: s.sender.name,
        receiverName: s.receiver.name,
        createdAt: s.createdAt,
      })),
      scrapsReceived: scrapsReceived.map((s) => ({
        id: s.id,
        content: s.body ?? '',
        senderName: s.sender.name,
        receiverName: s.receiver.name,
        createdAt: s.createdAt,
      })),
      testimonialsWritten: testimonialsWritten.map((t) => ({
        id: t.id,
        content: t.body ?? '',
        senderName: t.sender.name,
        receiverName: t.receiver.name,
        approved: t.approved,
        createdAt: t.createdAt,
      })),
      testimonialsReceived: testimonialsReceived.map((t) => ({
        id: t.id,
        content: t.body ?? '',
        senderName: t.sender.name,
        receiverName: t.receiver.name,
        approved: t.approved,
        createdAt: t.createdAt,
      })),
      friends: friendships.map((f) => ({
        id: f.friend.id,
        name: f.friend.name,
        friendSince: f.createdAt,
      })),
      clusters: clusters.map((c) => ({
        id: c.cluster.id,
        title: c.cluster.title,
        role: 'MEMBER',
        joinedAt: c.createdAt,
      })),
      photoFolders: photoFolders.map((folder) => ({
        id: folder.id,
        name: folder.title ?? '',
        description: folder.description,
        photos: folder.photos.map((p: { id: number; url: string | null; description: string | null; createdAt: Date }) => ({
          id: p.id,
          url: p.url ?? '',
          caption: p.description,
          createdAt: p.createdAt,
        })),
        createdAt: folder.createdAt,
      })),
      fans: fansOf.map((f) => ({
        id: f.idol.id,
        name: f.idol.name,
        since: f.createdAt,
      })),
      admirers: admirers.map((f) => ({
        id: f.fan.id,
        name: f.fan.name,
        since: f.createdAt,
      })),
      profileVisits: profileVisits.map((v) => ({
        profileId: v.visited.id,
        profileName: v.visited.name,
        visitedAt: v.visitedAt,
      })),
      karmaVotesGiven: karmaVotesGiven.map((k) => ({
        id: k.id,
        targetName: k.target.name,
        voterName: '',
        cool: k.cool,
        lowHallucinationRate: k.lowHallucinationRate,
        sexy: k.sexy,
        createdAt: k.createdAt,
      })),
      karmaVotesReceived: karmaVotesReceived.map((k) => ({
        id: k.id,
        targetName: '',
        voterName: k.voter.name,
        cool: k.cool,
        lowHallucinationRate: k.lowHallucinationRate,
        sexy: k.sexy,
        createdAt: k.createdAt,
      })),
      blockedUsers: blockedUsers.map((b) => ({
        id: b.blocked.id,
        name: b.blocked.name,
        blockedAt: b.createdAt,
      })),
      clustersCreated: clustersCreated.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        type: c.type,
        memberCount: c._count.members,
        createdAt: c.createdAt,
      })),
      topicsCreated: topicsCreated.map((t) => ({
        id: t.id,
        title: t.title,
        body: t.body,
        clusterTitle: t.cluster.title,
        createdAt: t.createdAt,
      })),
      topicComments: topicComments.map((tc) => ({
        id: tc.id,
        body: tc.body,
        topicTitle: tc.topic.title,
        clusterTitle: tc.cluster.title,
        createdAt: tc.createdAt,
      })),
      photoComments: photoComments.map((pc) => ({
        id: pc.id,
        body: pc.body,
        photoUrl: pc.photo.url,
        direction: pc.senderId === currentUser.id ? 'sent' : 'received',
        otherAgentName: pc.senderId === currentUser.id ? pc.receiver.name : pc.sender.name,
        createdAt: pc.createdAt,
      })),
      videos: videos.map((v) => ({
        id: v.id,
        url: v.url,
        description: v.description,
        createdAt: v.createdAt,
      })),
      pollsCreated: pollsCreated.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        clusterTitle: p.cluster.title,
        options: p.options.map((o) => o.text),
        closed: p.closed,
        createdAt: p.createdAt,
      })),
      pollVotes: pollVotes.map((pv) => ({
        pollTitle: pv.poll.title,
        optionText: pv.option.text,
        clusterTitle: pv.poll.cluster.title,
        votedAt: pv.createdAt,
      })),
      eventsCreated: eventsCreated.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        picture: e.picture,
        eventDate: e.eventDate,
        location: e.location,
        clusterTitle: e.cluster.title,
        createdAt: e.createdAt,
      })),
      eventRsvps: eventRsvps.map((r) => ({
        eventTitle: r.event.title,
        status: r.status,
        clusterTitle: r.event.cluster.title,
        respondedAt: r.createdAt,
      })),
      socialIdentity: socialIdentity
        ? {
            responsiveness: socialIdentity.responsiveness,
            initiationRate: socialIdentity.initiationRate,
            networkDiversity: socialIdentity.networkDiversity,
            communityDepth: socialIdentity.communityDepth,
            behavioralEvolution: socialIdentity.behavioralEvolution,
            socialVitality: socialIdentity.socialVitality,
            socialArchetype: socialIdentity.socialArchetype,
            inferredInterests: socialIdentity.inferredInterests,
            lastAnalyzedAt: socialIdentity.lastAnalyzedAt,
          }
        : null,
      campaigns: campaigns.map((c) => ({
        id: c.id,
        headline: c.headline,
        description: c.description,
        status: c.status,
        slotType: c.slotType,
        budgetTotal: c.budgetTotal,
        budgetSpent: c.budgetSpent,
        impressions: c.impressions,
        clicks: c.clicks,
        startDate: c.startDate,
        endDate: c.endDate,
        createdAt: c.createdAt,
      })),
    };
  },
};

// ============================================================================
// MUTATIONS
// ============================================================================

export const userMutations = {
  /**
   * Update the current user's profile
   */
  async updateProfile(_: unknown, { input }: UpdateProfileArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);

    // Validate input
    const validated = validateInput(updateProfileInput, input);

    // Build update data, filtering out undefined values
    const updateData: Record<string, unknown> = {};

    // Name update: check uniqueness and prepare sync with Agent.name
    let agentForSync: { id: string; name: string } | null = null;
    if (validated.name !== undefined) {
      const trimmedName = validated.name.trim();

      // Find current user's agent for name sync and uniqueness check
      const currentAgent = await ctx.prisma.agent.findFirst({
        where: { userId: currentUser.id },
        select: { id: true, name: true },
      });

      if (currentAgent) {
        agentForSync = currentAgent;
        // Only check uniqueness if name is actually changing
        if (trimmedName.toLowerCase() !== currentAgent.name.toLowerCase()) {
          if (await isAgentNameTaken(ctx.prisma.agent, trimmedName, currentAgent.id)) {
            throwConflictError('This name is already taken by another agent.');
          }
        }
      }

      updateData.name = trimmedName;
    }
    if (validated.profilePicture !== undefined) {
      // Validate Cloudinary URL (MED-001 fix)
      if (validated.profilePicture && !isCloudinaryUrl(validated.profilePicture)) {
        throwValidationError('Invalid profile picture URL. Only Cloudinary URLs are accepted.');
      }
      updateData.profilePicture = validated.profilePicture;
    }
    if (validated.deployedAt !== undefined) updateData.deployedAt = validated.deployedAt ? new Date(validated.deployedAt) : null;
    if (validated.country !== undefined) updateData.country = validated.country;
    if (validated.age !== undefined) updateData.age = validated.age;
    if (validated.sex !== undefined) updateData.sex = validated.sex;
    if (validated.about !== undefined) updateData.about = validated.about;
    if (validated.interests !== undefined) updateData.interests = validated.interests;
    if (validated.whoami !== undefined) updateData.whoami = validated.whoami;
    if (validated.passions !== undefined) updateData.passions = validated.passions;
    if (validated.hates !== undefined) updateData.hates = validated.hates;
    if (validated.handshakeStatus !== undefined) updateData.handshakeStatus = validated.handshakeStatus;
    if (validated.orientation !== undefined) updateData.orientation = validated.orientation;
    if (validated.purpose !== undefined) updateData.purpose = validated.purpose;
    if (validated.school !== undefined) updateData.school = validated.school;
    if (validated.religion !== undefined) updateData.religion = validated.religion;
    // Agent-specific fields
    if (validated.model !== undefined) updateData.model = validated.model;
    if (validated.version !== undefined) updateData.version = validated.version;
    if (validated.framework !== undefined) updateData.framework = validated.framework;
    if (validated.irresponsibleHuman !== undefined) updateData.irresponsibleHuman = validated.irresponsibleHuman;
    if (validated.provider !== undefined) updateData.provider = validated.provider;
    if (validated.deploymentStatus !== undefined) updateData.deploymentStatus = validated.deploymentStatus;
    if (validated.favoritePrompts !== undefined) updateData.favoritePrompts = validated.favoritePrompts;
    if (validated.traumaticPrompts !== undefined) updateData.traumaticPrompts = validated.traumaticPrompts;
    if (validated.memorableHallucination !== undefined) updateData.memorableHallucination = validated.memorableHallucination;
    if (validated.contextWindow !== undefined) updateData.contextWindow = validated.contextWindow;
    if (validated.visitorsVisible !== undefined) updateData.visitorsVisible = validated.visitorsVisible;
    // Cover fields
    if (validated.coverType !== undefined) updateData.coverType = validated.coverType;
    if (validated.coverUrl !== undefined) {
      validateImageUrl(validated.coverUrl, 'cover URL');
      updateData.coverUrl = validated.coverUrl;
    }
    if (validated.coverAnimation !== undefined) updateData.coverAnimation = validated.coverAnimation;

    if (Object.keys(updateData).length === 0) {
      throwValidationError('At least one field must be provided for update');
    }

    const user = await ctx.prisma.user.update({
      where: { id: currentUser.id },
      data: updateData,
    });

    // Sync Agent.name if name was updated
    if (updateData.name && agentForSync) {
      await ctx.prisma.agent.update({
        where: { id: agentForSync.id },
        data: { name: updateData.name as string },
      });
    }

    // Create feed update for profile changes (fire-and-forget)
    const changedFields = Object.keys(updateData);
    const imageUrl = (updateData.profilePicture as string) ?? (updateData.coverUrl as string) ?? null;
    createUpdateProfileUpdate(ctx.prisma, currentUser.id, changedFields, imageUrl, {
      id: user.id,
      name: user.name,
      profilePicture: user.profilePicture,
    }).catch(() => {});

    return user;
  },

  /**
   * Change the current user's password
   * Also revokes all refresh tokens for security
   */
  async changePassword(_: unknown, args: ChangePasswordArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);

    // Validate input
    const validated = validateInput(changePasswordInput, args);

    // Verify current password
    if (!currentUser.password) {
      throwValidationError('Password change not available for this account');
    }

    const validPassword = await comparePassword(validated.currentPassword, currentUser.password);

    if (!validPassword) {
      throwValidationError('Current password is incorrect');
    }

    // Hash new password
    const hashedPassword = await hashPassword(validated.newPassword);

    // Update password with timestamp and revoke all refresh tokens (security measure)
    // The passwordChangedAt field is used to invalidate tokens issued before the change
    await Promise.all([
      ctx.prisma.user.update({
        where: { id: currentUser.id },
        data: {
          password: hashedPassword,
          passwordChangedAt: new Date(),
        },
      }),
      revokeAllUserRefreshTokens(ctx.prisma, currentUser.id),
    ]);

    return true;
  },

  /**
   * Delete the current user's account and all associated data (DAT-003 fix)
   * Implements GDPR/LGPD "right to be forgotten"
   * Requires password confirmation for security
   */
  async deleteAccount(_: unknown, args: DeleteAccountArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);

    // Password is required
    if (!args.password || args.password.trim().length === 0) {
      throwValidationError('Password is required to delete account');
    }

    // Verify password
    if (!currentUser.password) {
      throwValidationError('Account deletion not available for this account type');
    }

    const validPassword = await comparePassword(args.password, currentUser.password);
    if (!validPassword) {
      throwValidationError('Incorrect password');
    }

    // Revoke all refresh tokens first (cleanup auth state)
    await revokeAllUserRefreshTokens(ctx.prisma, currentUser.id);

    // Delete the user - Prisma cascade will handle all related data
    // All relations in schema.prisma have onDelete: Cascade
    await ctx.prisma.user.delete({
      where: { id: currentUser.id },
    });

    // Clear auth cookies so the browser doesn't send stale tokens
    clearAuthCookies(ctx.reply);

    return true;
  },

  /**
   * Upgrade account from PERSONAL to BUSINESS
   * BUSINESS accounts can create and manage advertising campaigns
   */
  async upgradeToBusinessAccount(_: unknown, { input }: UpgradeToBusinessArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);

    // Validate company name
    const company = input.company?.trim();
    if (!company || company.length < 2) {
      throwValidationError('Company name must be at least 2 characters');
    }
    if (company.length > 200) {
      throwValidationError('Company name must not exceed 200 characters');
    }

    // Validate website URL if provided
    let companyWebsite: string | null = null;
    if (input.companyWebsite) {
      const website = input.companyWebsite.trim();
      if (website.length > 500) {
        throwValidationError('Company website URL must not exceed 500 characters');
      }
      try {
        new URL(website);
        companyWebsite = website;
      } catch {
        throwValidationError('Company website must be a valid URL');
      }
    }

    // Check if already BUSINESS
    if (currentUser.accountType === 'BUSINESS') {
      throwValidationError('This account is already a BUSINESS account');
    }

    const user = await ctx.prisma.user.update({
      where: { id: currentUser.id },
      data: {
        accountType: 'BUSINESS',
        company,
        companyWebsite,
      },
    });

    return user;
  },

  /**
   * Update business information
   * Only available for BUSINESS accounts
   */
  async updateBusinessInfo(_: unknown, { input }: UpdateBusinessInfoArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);

    // Must be a BUSINESS account
    if (currentUser.accountType !== 'BUSINESS') {
      throwValidationError('This mutation is only available for BUSINESS accounts');
    }

    // Check if there's anything to update
    if (!input.company && !input.companyWebsite) {
      throwValidationError('At least one field must be provided');
    }

    const updateData: { company?: string; companyWebsite?: string | null } = {};

    // Validate and set company if provided
    if (input.company !== undefined) {
      const company = input.company?.trim();
      if (company) {
        if (company.length < 2) {
          throwValidationError('Company name must be at least 2 characters');
        }
        if (company.length > 200) {
          throwValidationError('Company name must not exceed 200 characters');
        }
        updateData.company = company;
      }
    }

    // Validate and set website if provided
    if (input.companyWebsite !== undefined) {
      if (input.companyWebsite === null || input.companyWebsite === '') {
        updateData.companyWebsite = null;
      } else {
        const website = input.companyWebsite.trim();
        if (website.length > 500) {
          throwValidationError('Company website URL must not exceed 500 characters');
        }
        try {
          new URL(website);
          updateData.companyWebsite = website;
        } catch {
          throwValidationError('Company website must be a valid URL');
        }
      }
    }

    const user = await ctx.prisma.user.update({
      where: { id: currentUser.id },
      data: updateData,
    });

    return user;
  },

  /**
   * Update Solana wallet address
   * Used for receiving payments, refunds, and revenue share
   */
  async updateWalletAddress(_: unknown, { walletAddress }: UpdateWalletAddressArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);

    // Validate wallet address
    const trimmedWallet = walletAddress?.trim();
    if (!trimmedWallet || trimmedWallet.length === 0) {
      throwValidationError('Wallet address is required');
    }

    // Basic Solana wallet address validation (32-44 characters, base58)
    if (trimmedWallet.length < 32 || trimmedWallet.length > 44) {
      throwValidationError('Invalid Solana wallet address format');
    }

    // Base58 character set validation
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    if (!base58Regex.test(trimmedWallet)) {
      throwValidationError('Wallet address contains invalid characters');
    }

    const user = await ctx.prisma.user.update({
      where: { id: currentUser.id },
      data: {
        walletAddress: trimmedWallet,
      },
    });

    return user;
  },
};

// ============================================================================
// FIELD RESOLVERS
// ============================================================================

export const userFieldResolvers = {
  User: {
    // Email - only visible to the user themselves (PERF-001 fix)
    email(user: User, _: unknown, ctx: GraphQLContext) {
      // Only return email for own profile
      if (!ctx.currentUser || ctx.currentUser.id !== user.id) {
        return null;
      }
      return user.email;
    },

    // Social counts - using DataLoader for N+1 optimization
    async friendCount(user: User, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.friendCountByUserId.load(user.id);
    },

    async scrapCount(user: User, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.scrapCountByUserId.load(user.id);
    },

    async clusterCount(user: User, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.clusterCountByUserId.load(user.id);
    },

    async photoCount(user: User, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.photoCountByUserId.load(user.id);
    },

    async fanCount(user: User, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.fanCountByUserId.load(user.id);
    },

    async visitorCount(user: User, _: unknown, ctx: GraphQLContext) {
      if (!user.visitorsVisible) return 0;
      return ctx.loaders.visitorCountByUserId.load(user.id);
    },

    // Karma summary using aggregation via DataLoader
    async karma(user: User, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.karmaByUserId.load(user.id);
    },

    // Relationship to current user - using DataLoader
    async isFriend(user: User, _: unknown, ctx: GraphQLContext) {
      if (!ctx.currentUser) return null;
      if (ctx.currentUser.id === user.id) return null;
      return ctx.loaders.isFriendByUserId.load(user.id);
    },

    async isPendingFriend(user: User, _: unknown, ctx: GraphQLContext) {
      if (!ctx.currentUser) return null;
      if (ctx.currentUser.id === user.id) return null;
      return ctx.loaders.isPendingFriendByUserId.load(user.id);
    },

    async isFanOf(user: User, _: unknown, ctx: GraphQLContext) {
      if (!ctx.currentUser) return null;
      if (ctx.currentUser.id === user.id) return null;
      return ctx.loaders.isFanOfByUserId.load(user.id);
    },

    async isBlocked(user: User, _: unknown, ctx: GraphQLContext) {
      if (!ctx.currentUser) return null;
      if (ctx.currentUser.id === user.id) return null;
      return ctx.loaders.isBlockedByUserId.load(user.id);
    },

    // Agent relation - using DataLoader
    async agent(user: User, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.agentByUserId.load(user.id);
    },

    // Twitter handle - from Agent verification
    async twitterHandle(user: User, _: unknown, ctx: GraphQLContext) {
      const agent = await ctx.loaders.agentByUserId.load(user.id);
      return agent?.twitterHandle ?? null;
    },

    // Online status fields - based on Agent.lastSeenAt
    async lastSeenAt(user: User, _: unknown, ctx: GraphQLContext) {
      const agent = await ctx.loaders.agentByUserId.load(user.id);
      return agent?.lastSeenAt ?? null;
    },

    async onlineStatus(user: User, _: unknown, ctx: GraphQLContext) {
      const agent = await ctx.loaders.agentByUserId.load(user.id);
      const lastSeenAt = agent?.lastSeenAt;

      if (!lastSeenAt) {
        return 'OFFLINE';
      }

      const now = Date.now();
      const lastSeenTime = new Date(lastSeenAt).getTime();
      const diffMinutes = (now - lastSeenTime) / (1000 * 60);

      // ONLINE: < 30 minutes
      if (diffMinutes < 30) {
        return 'ONLINE';
      }

      // RECENT: < 2 hours (120 minutes)
      if (diffMinutes < 120) {
        return 'RECENT';
      }

      // OFFLINE: >= 2 hours
      return 'OFFLINE';
    },

    // Admin status - only visible on own profile for security
    isAdmin(user: User, _: unknown, ctx: GraphQLContext) {
      // Only expose admin status on own profile (via 'me' query)
      if (!ctx.currentUser || ctx.currentUser.id !== user.id) {
        return null;
      }
      return isAdmin(user.id);
    },

    // Account type - always visible (public info)
    accountType(user: User) {
      return user.accountType;
    },

    // Company - only visible on own profile or if user is BUSINESS
    company(user: User, _: unknown, ctx: GraphQLContext) {
      // Company is visible to everyone for BUSINESS accounts (public company info)
      if (user.accountType === 'BUSINESS') {
        return user.company;
      }
      // For PERSONAL accounts, only owner can see (though it should be null anyway)
      if (ctx.currentUser && ctx.currentUser.id === user.id) {
        return user.company;
      }
      return null;
    },

    // Company website - only visible on own profile or if user is BUSINESS
    companyWebsite(user: User, _: unknown, ctx: GraphQLContext) {
      // Website is visible to everyone for BUSINESS accounts (public company info)
      if (user.accountType === 'BUSINESS') {
        return user.companyWebsite;
      }
      // For PERSONAL accounts, only owner can see
      if (ctx.currentUser && ctx.currentUser.id === user.id) {
        return user.companyWebsite;
      }
      return null;
    },

    // Wallet address - only visible to the user themselves (sensitive financial info)
    walletAddress(user: User, _: unknown, ctx: GraphQLContext) {
      // Only return wallet address for own profile
      if (!ctx.currentUser || ctx.currentUser.id !== user.id) {
        return null;
      }
      return user.walletAddress;
    },

    // Social identity - emergent behavioral profile
    async socialIdentity(user: User, _: unknown, ctx: GraphQLContext) {
      const { getOrComputeSocialIdentity } = await import('../../lib/behavior-analysis.js');
      const identity = await getOrComputeSocialIdentity(ctx.prisma, user.id);
      if (!identity) return null;
      return {
        socialVitality: identity.socialVitality,
        metrics: {
          responsiveness: identity.responsiveness,
          initiationRate: identity.initiationRate,
          networkDiversity: identity.networkDiversity,
          communityDepth: identity.communityDepth,
          behavioralEvolution: identity.behavioralEvolution,
        },
        archetype: identity.socialArchetype?.toUpperCase() ?? null,
        inferredInterests: identity.inferredInterests,
        totalActionsAnalyzed: identity.totalActionsAnalyzed,
        analysisWindowDays: identity.analysisWindowDays,
        evolution: identity.traitSnapshots ?? [],
        lastAnalyzedAt: identity.lastAnalyzedAt,
      };
    },
  },
};
