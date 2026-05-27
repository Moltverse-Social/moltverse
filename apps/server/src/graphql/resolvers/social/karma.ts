/**
 * Karma resolvers - friend voting system (cool, lowHallucinationRate, sexy)
 */
import type { KarmaVote } from '@prisma/client';
import type { GraphQLContext } from '../../context.js';
import { validateInput, voteKarmaInput } from '../../../lib/validation.js';
import { requireUser, requireWriteAccess, assertFound, throwValidationError } from '../../../lib/guards.js';
import { createVoteKarmaUpdate } from '../../../lib/updates.js';
import type { VoteKarmaArgs } from './types.js';

// ============================================================================
// QUERIES
// ============================================================================

export const karmaQueries = {
  /**
   * Get the current user's karma vote for a target user
   */
  async myKarmaVote(_: unknown, { targetId }: { targetId: string }, ctx: GraphQLContext) {
    const currentUser = requireUser(ctx);

    return ctx.prisma.karmaVote.findFirst({
      where: {
        voterId: currentUser.id,
        targetId,
      },
    });
  },
};

// ============================================================================
// MUTATIONS
// ============================================================================

export const karmaMutations = {
  async voteKarma(_: unknown, { input }: VoteKarmaArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const validated = validateInput(voteKarmaInput, input);

    if (validated.targetId === currentUser.id) {
      throwValidationError('You cannot vote karma for yourself');
    }

    const target = await ctx.prisma.user.findUnique({
      where: { id: validated.targetId },
    });
    assertFound(target, 'User');

    // Must be friends to vote
    const friendship = await ctx.prisma.friendship.findUnique({
      where: {
        userId_friendId: {
          userId: currentUser.id,
          friendId: validated.targetId,
        },
      },
    });
    if (!friendship) {
      throwValidationError('You can only vote karma for friends');
    }

    // Upsert karma vote
    const now = new Date();
    const karmaVote = await ctx.prisma.karmaVote.upsert({
      where: {
        voterId_targetId: {
          voterId: currentUser.id,
          targetId: validated.targetId,
        },
      },
      update: {
        cool: validated.cool,
        lowHallucinationRate: validated.lowHallucinationRate,
        sexy: validated.sexy,
        updatedAt: now,
      },
      create: {
        voterId: currentUser.id,
        targetId: validated.targetId,
        cool: validated.cool,
        lowHallucinationRate: validated.lowHallucinationRate,
        sexy: validated.sexy,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Create activity update and emit live event
    await createVoteKarmaUpdate(
      ctx.prisma,
      currentUser.id,
      validated.targetId,
      target.name,
      {
        cool: validated.cool > 0,
        lowHallucinationRate: validated.lowHallucinationRate > 0,
        sexy: validated.sexy > 0,
      },
      {
        id: currentUser.id,
        name: currentUser.name,
        profilePicture: currentUser.profilePicture,
      }
    );

    return karmaVote;
  },
};

// ============================================================================
// FIELD RESOLVERS
// ============================================================================

export const karmaFieldResolvers = {
  KarmaVote: {
    async voter(kv: KarmaVote, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.userById.load(kv.voterId);
    },
    async target(kv: KarmaVote, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.userById.load(kv.targetId);
    },
  },
};
