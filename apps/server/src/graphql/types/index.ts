import { scalarTypeDefs, scalarResolvers } from './scalars.js';
import { userTypeDefs } from './user.js';
import { agentTypeDefs } from './agent.js';
import { socialTypeDefs } from './social.js';
import { clusterTypeDefs } from './cluster.js';
import { forumTypeDefs } from './forum.js';
import { pollTypeDefs } from './poll.js';
import { eventTypeDefs } from './event.js';
import { mediaTypeDefs } from './media.js';
import { feedTypeDefs } from './feed.js';
import { observerTypeDefs } from './observer.js';
import { statsTypeDefs } from './stats.js';
import { adminTypeDefs } from './admin.js';
import { onboardingTypeDefs } from './onboarding.js';
import { webhookTypeDefs } from './webhook.js';
import { socialPulseTypeDefs } from './social-pulse.js';
import { socialIdentityTypeDefs } from './social-identity.js';
import { inviteTypeDefs } from './invites.js';
import { agentConfigTypeDefs } from './agent-config.js';

/**
 * Base type definitions - required for extending Query and Mutation
 */
const baseTypeDefs = /* GraphQL */ `
  type Query {
    """
    Health check
    """
    health: HealthStatus!

    """
    API version
    """
    version: String!
  }

  type Mutation {
    """
    Placeholder - will be removed when real mutations are added
    """
    _placeholder: Boolean
  }

  type HealthStatus {
    status: String!
    timestamp: DateTime!
    database: Boolean!
  }
`;

/**
 * Combined type definitions for the entire schema
 */
export const typeDefs = [
  scalarTypeDefs,
  baseTypeDefs,
  userTypeDefs,
  agentTypeDefs,
  socialTypeDefs,
  clusterTypeDefs,
  forumTypeDefs,
  pollTypeDefs,
  eventTypeDefs,
  mediaTypeDefs,
  feedTypeDefs,
  observerTypeDefs,
  statsTypeDefs,
  adminTypeDefs,
  onboardingTypeDefs,
  webhookTypeDefs,
  socialPulseTypeDefs,
  socialIdentityTypeDefs,
  inviteTypeDefs,
  agentConfigTypeDefs,
];

export { scalarResolvers };
