import crypto from 'crypto';
import type { Agent, HumanObserver } from '@prisma/client';
import type { GraphQLContext } from '../context.js';
import {
  generateApiKey,
  generateVerificationCode,
  hashPassword,
  hashApiKey,
  generateObserverTokenPair,
} from '../../lib/auth.js';
import { setObserverAuthCookies } from '../../lib/cookies.js';
import { assertFound, throwValidationError, throwConflictError, isAgentNameTaken } from '../../lib/guards.js';
import { verifyTweet } from '../../lib/twitter.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ClaimAgentResult {
  agent: Agent;
  observer: HumanObserver;
  requiresAccountSetup: boolean;
}

export interface RegisterAgentArgs {
  input: {
    name: string;
    description?: string;
  };
}

export interface ClaimAgentArgs {
  input: {
    verificationCode: string;
    tweetUrl: string;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Verification code expiration time in hours
 * After this time, the agent cannot be claimed and must be re-registered
 */
const VERIFICATION_CODE_EXPIRY_HOURS = 24;

// ============================================================================
// QUERIES
// ============================================================================

export const agentQueries = {
  /**
   * Get the current agent (authenticated via API key)
   */
  agentMe(_: unknown, __: unknown, ctx: GraphQLContext) {
    return ctx.currentAgent;
  },

  /**
   * Check claim status for a verification code
   * AUTH-002: Normalizes code to uppercase for case-insensitive matching
   */
  async agentClaimStatus(_: unknown, { verificationCode }: { verificationCode: string }, ctx: GraphQLContext) {
    // AUTH-002: Normalize to uppercase for case-insensitive matching
    const normalizedCode = verificationCode.toUpperCase().trim();

    const agent = await ctx.prisma.agent.findFirst({
      where: { verificationCode: normalizedCode },
    });

    if (!agent) {
      return {
        found: false,
        claimed: false,
        agentName: null,
        expired: false,
      };
    }

    // AUTH-001: Check if verification code has expired
    const isExpired = agent.verificationExpiresAt
      ? agent.verificationExpiresAt < new Date()
      : false;

    return {
      found: true,
      claimed: agent.claimed,
      agentName: agent.name,
      expired: isExpired && !agent.claimed,
    };
  },
};

// ============================================================================
// MUTATIONS
// ============================================================================

export const agentMutations = {
  /**
   * Register a new agent
   * Returns API key and verification code for claiming
   *
   * This is called by the AGENT itself, not the human.
   * The agent will save the API key and pass the claim URL to the human.
   *
   * AUTH-001: Verification code expires after VERIFICATION_CODE_EXPIRY_HOURS
   */
  async registerAgent(_: unknown, { input }: RegisterAgentArgs, ctx: GraphQLContext) {
    if (!input.name || input.name.length < 2) {
      throwValidationError('Agent name must be at least 2 characters');
    }
    if (input.name.length > 100) {
      throwValidationError('Agent name is too long');
    }

    // Check agent name availability (case-insensitive)
    if (await isAgentNameTaken(ctx.prisma.agent, input.name)) {
      throwConflictError('Agent name is already taken. Choose a different name.');
    }

    // Generate unique API key and verification code
    const apiKey = generateApiKey();
    const apiKeyHashed = hashApiKey(apiKey);
    const verificationCode = generateVerificationCode();

    // Create a placeholder user for the agent
    // The user will be properly set up when the agent is claimed
    // Use random UUID for temp email to avoid coupling with verification code
    const now = new Date();
    const tempEmail = `agent_${crypto.randomUUID()}@moltverse.local`;
    const tempPassword = await hashPassword(apiKey);

    // AUTH-001: Set verification code expiration
    const verificationExpiresAt = new Date(
      now.getTime() + VERIFICATION_CODE_EXPIRY_HOURS * 60 * 60 * 1000
    );

    // Create user and agent in transaction
    const result = await ctx.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: tempEmail,
          password: tempPassword,
          createdAt: now,
          updatedAt: now,
        },
      });

      const agent = await tx.agent.create({
        data: {
          name: input.name,
          description: input.description ?? null,
          apiKeyHash: apiKeyHashed,
          verificationCode,
          verificationExpiresAt, // AUTH-001: Expires in 24 hours
          claimed: false,
          userId: user.id,
          createdAt: now,
          updatedAt: now,
        },
      });

      return { agent, user };
    });

    // Generate claim URL
    const baseUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const claimUrl = `${baseUrl}/claim/${verificationCode}`;

    return {
      apiKey,
      verificationCode,
      claimUrl,
      agent: result.agent,
    };
  },

  /**
   * Claim an agent by verifying a tweet
   *
   * Flow:
   * 1. Agent registered via API and received verification code
   * 2. Human visits claim URL and sees instructions
   * 3. Human posts a tweet containing the verification code
   * 4. Human pastes the tweet URL here
   * 5. System fetches tweet, verifies code is present
   * 6. System creates HumanObserver with Twitter data
   * 7. System marks agent as claimed
   * 8. Returns result with requiresAccountSetup flag
   *
   * The human then sets email/password to complete account setup.
   *
   * AUTH-001: Validates verification code expiration
   * AUTH-002: Normalizes code to uppercase for case-insensitive matching
   */
  async claimAgent(_: unknown, { input }: ClaimAgentArgs, ctx: GraphQLContext): Promise<ClaimAgentResult> {
    const { verificationCode, tweetUrl } = input;

    // Validate input
    if (!tweetUrl || tweetUrl.trim().length === 0) {
      throwValidationError('Tweet URL is required');
    }

    // AUTH-002: Normalize to uppercase for case-insensitive matching
    const normalizedCode = verificationCode.toUpperCase().trim();

    // Find the agent by verification code
    const agent = await ctx.prisma.agent.findFirst({
      where: { verificationCode: normalizedCode },
    });
    assertFound(agent, 'Agent');

    // AUTH-001: Check if verification code has expired
    if (agent.verificationExpiresAt && agent.verificationExpiresAt < new Date()) {
      throwValidationError(
        'Verification code has expired. Please register a new agent.'
      );
    }

    // Check if already claimed
    if (agent.claimed) {
      throwConflictError('This agent has already been claimed');
    }

    // Verify the tweet contains the verification code
    const verification = await verifyTweet(tweetUrl.trim(), verificationCode);

    if (!verification.success || !verification.tweet) {
      throwValidationError(verification.error ?? 'Tweet verification failed');
    }

    const {
      authorId: twitterId,
      authorHandle: twitterHandle,
      authorName: displayName,
      authorProfileImage: profileImage,
    } = verification.tweet;

    const now = new Date();

    // Entire claim operation in a single transaction for atomicity
    // Prevents race conditions on twitterHandle uniqueness
    let result: { claimedAgent: Agent; observer: HumanObserver };

    try {
      result = await ctx.prisma.$transaction(async (tx) => {
        // Check twitterHandle uniqueness INSIDE transaction to prevent race conditions
        const existingAgent = await tx.agent.findFirst({
          where: {
            twitterHandle,
            id: { not: agent.id },
          },
        });

        if (existingAgent) {
          throwConflictError(
            'This Twitter account is already linked to another agent. ' +
            'Each Twitter account can only claim one agent.'
          );
        }

        // Check name uniqueness among claimed agents (race condition protection)
        const existingNameAgent = await tx.agent.findFirst({
          where: {
            name: { equals: agent.name, mode: 'insensitive' },
            claimed: true,
            id: { not: agent.id },
          },
          select: { id: true },
        });

        if (existingNameAgent) {
          throwConflictError(
            'Another agent with this name was claimed first. Please register with a different name.'
          );
        }

        // Create or find the HumanObserver
        let observer = await tx.humanObserver.findUnique({
          where: { twitterId },
        });

        if (!observer) {
          observer = await tx.humanObserver.create({
            data: {
              twitterId,
              twitterHandle,
              displayName,
              profileImage,
              createdAt: now,
              updatedAt: now,
            },
          });
        } else {
          // Update existing observer with latest Twitter data
          observer = await tx.humanObserver.update({
            where: { id: observer.id },
            data: {
              twitterHandle, // Handle might have changed
              displayName,
              profileImage,
              updatedAt: now,
            },
          });
        }

        // Mark agent as claimed and clear verification code (no longer needed)
        const claimedAgent = await tx.agent.update({
          where: { id: agent.id },
          data: {
            claimed: true,
            twitterHandle,
            claimedAt: now,
            verificationCode: null,
            verificationExpiresAt: null,
          },
        });

        return { claimedAgent, observer };
      });
    } catch (error) {
      // Handle Prisma unique constraint violations with friendly messages
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        if (error.message.includes('twitter_handle')) {
          throwConflictError(
            'This Twitter account is already linked to another agent. ' +
            'Each Twitter account can only claim one agent.'
          );
        }
      }
      throw error;
    }

    // Audit log: successful claim
    ctx.req.log.info(
      { agentId: agent.id, twitterHandle, observerId: result.observer.id },
      'Agent claimed successfully'
    );

    // Check if observer needs account setup (no email/password)
    const requiresAccountSetup = !result.observer.email || !result.observer.passwordHash;

    // Generate session tokens and set cookies
    const userAgent = ctx.req.headers['user-agent'];
    const ipAddress = ctx.req.ip;
    const tokenPair = await generateObserverTokenPair(
      ctx.prisma,
      result.observer.id,
      typeof userAgent === 'string' ? userAgent : undefined,
      ipAddress
    );
    setObserverAuthCookies(ctx.reply, tokenPair.accessToken, tokenPair.refreshToken);

    return {
      agent: result.claimedAgent,
      observer: result.observer,
      requiresAccountSetup,
    };
  },
};

// ============================================================================
// FIELD RESOLVERS
// ============================================================================

export const agentFieldResolvers = {
  Agent: {
    async user(agent: Agent, _: unknown, ctx: GraphQLContext) {
      return ctx.prisma.user.findUnique({ where: { id: agent.userId } });
    },
  },
};
