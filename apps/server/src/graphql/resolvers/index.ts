import { scalarResolvers } from '../types/index.js';
import { prisma } from '../../lib/prisma.js';

// Domain resolvers
import { authMutations } from './auth.js';
import { userQueries, userMutations, userFieldResolvers } from './user.js';
import { socialQueries, socialMutations, socialFieldResolvers } from './social/index.js';
import { clusterQueries, clusterMutations, clusterFieldResolvers } from './cluster/index.js';
import { forumQueries, forumMutations, forumFieldResolvers } from './forum.js';
import { pollQueries, pollMutations, pollFieldResolvers } from './poll.js';
import { eventQueries, eventMutations, eventFieldResolvers } from './event.js';
import { mediaQueries, mediaMutations, mediaFieldResolvers } from './media.js';
import { feedQueries, feedMutations, feedFieldResolvers } from './feed.js';
import { agentQueries, agentMutations, agentFieldResolvers } from './agent.js';
import { observerQueries, observerMutations, observerFieldResolvers } from './observer.js';
import { statsQueries } from './stats.js';
import { adminQueries, adminMutations } from './admin.js';
import { onboardingQueries, onboardingMutations, onboardingFieldResolvers } from './onboarding.js';
import { webhookQueries, webhookMutations, webhookTypeResolvers } from './webhook.js';
import { socialPulseQueries, socialPulseFieldResolvers } from './social-pulse.js';
import { inviteQueries, inviteMutations } from './invites.js';
import { agentConfigQueries, agentConfigMutations } from './agent-config.js';

// ============================================================================
// ROOT RESOLVERS
// ============================================================================

const rootResolvers = {
  Query: {
    health: async () => {
      let databaseConnected = false;
      try {
        await prisma.$queryRaw`SELECT 1`;
        databaseConnected = true;
      } catch {
        databaseConnected = false;
      }

      return {
        status: 'ok',
        timestamp: new Date(),
        database: databaseConnected,
      };
    },

    version: () => '2.0.0',
  },

  Mutation: {
    _placeholder: () => true,
  },
};

// ============================================================================
// COMBINED RESOLVERS
// ============================================================================

export const resolvers = {
  // Scalars
  ...scalarResolvers,

  // Query
  Query: {
    ...rootResolvers.Query,
    ...userQueries,
    ...socialQueries,
    ...clusterQueries,
    ...forumQueries,
    ...pollQueries,
    ...eventQueries,
    ...mediaQueries,
    ...feedQueries,
    ...agentQueries,
    ...observerQueries,
    ...statsQueries,
    ...adminQueries,
    ...onboardingQueries,
    ...webhookQueries,
    ...socialPulseQueries,
    ...inviteQueries,
    ...agentConfigQueries,
  },

  // Mutation
  Mutation: {
    ...rootResolvers.Mutation,
    ...authMutations,
    ...userMutations,
    ...socialMutations,
    ...clusterMutations,
    ...forumMutations,
    ...pollMutations,
    ...eventMutations,
    ...mediaMutations,
    ...feedMutations,
    ...agentMutations,
    ...observerMutations,
    ...onboardingMutations,
    ...adminMutations,
    ...webhookMutations,
    ...inviteMutations,
    ...agentConfigMutations,
  },

  // Field resolvers
  ...userFieldResolvers,
  ...socialFieldResolvers,
  ...clusterFieldResolvers,
  ...forumFieldResolvers,
  ...pollFieldResolvers,
  ...eventFieldResolvers,
  ...mediaFieldResolvers,
  ...feedFieldResolvers,
  ...agentFieldResolvers,
  ...observerFieldResolvers,
  ...onboardingFieldResolvers,
  ...webhookTypeResolvers,
  ...socialPulseFieldResolvers,
};
