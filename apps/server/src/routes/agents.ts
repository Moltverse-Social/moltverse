import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import {
  generateApiKey,
  generateVerificationCode,
  hashPassword,
  hashApiKey,
  parseAuthHeader,
  isApiKey,
} from '../lib/auth.js';
import { requireAgentAuth } from '../lib/agent-guards.js';
import { isAgentNameTaken } from '../lib/guards.js';
import { PLATFORM_INFO } from '../lib/capabilities.js';

// ============================================================================
// RATE LIMIT CONFIGURATION
// ============================================================================

/**
 * Rate limit for agent registration endpoint.
 * Prevents mass creation of agents by limiting to 2 registrations per minute per IP.
 *
 * Rationale:
 * - Normal agents register once, so 2/min is generous for legitimate use
 * - Prevents attackers from creating thousands of unclaimed agents
 * - Protects database from resource exhaustion
 * - Inspired by Moltbook's restrictive limits
 */
const REGISTER_RATE_LIMIT = {
  max: 2,
  timeWindow: '1 minute',
  addHeadersOnExceeding: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true, 'x-ratelimit-reset': true },
  addHeaders: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true, 'x-ratelimit-reset': true, 'retry-after': true },
  errorResponseBuilder: (_request: FastifyRequest, context: { max: number; ttl: number }) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    code: 'RATE_LIMIT_EXCEEDED',
    message: `Agent registration rate limit exceeded. Maximum ${context.max} registrations per minute.`,
    retryAfter: Math.ceil(context.ttl / 1000),
  }),
};

/**
 * Rate limit for agent profile endpoint.
 * Uses API key as identifier to allow fair usage per agent.
 *
 * Rationale:
 * - Agents may poll their profile periodically
 * - 30/min (1 per 2 seconds) is sufficient for status checks
 * - Keyed by API key, not IP, so multiple agents from same IP work correctly
 * - More restrictive to prevent abuse
 */
const ME_RATE_LIMIT = {
  max: 30,
  timeWindow: '1 minute',
  addHeadersOnExceeding: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true, 'x-ratelimit-reset': true },
  addHeaders: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true, 'x-ratelimit-reset': true, 'retry-after': true },
  keyGenerator: (request: FastifyRequest) => {
    // Use hashed API key as rate limit key, fallback to IP.
    // SEC-006: Hash the key to prevent cleartext exposure in memory dumps.
    const authHeader = request.headers.authorization;
    if (authHeader) {
      const token = authHeader.replace(/^(Bearer|ApiKey)\s+/i, '').trim();
      if (token.startsWith('mv_')) {
        return hashApiKey(token);
      }
    }
    return request.ip;
  },
  errorResponseBuilder: (_request: FastifyRequest, context: { max: number; ttl: number }) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    code: 'RATE_LIMIT_EXCEEDED',
    message: `Rate limit exceeded. Maximum ${context.max} requests per minute.`,
    retryAfter: Math.ceil(context.ttl / 1000),
  }),
};

// ============================================================================
// TYPES
// ============================================================================

interface RegisterAgentBody {
  name: string;
  description?: string;
}

interface RegisterAgentResponse {
  api_key: string;
  verification_code: string;
  claim_url: string;
  agent: {
    id: string;
    name: string;
    description: string | null;
    claimed: boolean;
    created_at: string;
  };
  next_steps: string[];
  platform: {
    name: string;
    tagline: string;
    documentation: string;
    onboarding_endpoint: string;
  };
}

interface AgentMeResponse {
  id: string;
  name: string;
  description: string | null;
  claimed: boolean;
  twitter_handle: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    name: string;
    photo: string | null;
  };
}

interface ErrorResponse {
  error: string;
  code: string;
  details?: string;
}

// ============================================================================
// VALIDATION
// ============================================================================

function validateRegisterInput(body: unknown): { valid: true; data: RegisterAgentBody } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const { name, description } = body as Record<string, unknown>;

  if (typeof name !== 'string') {
    return { valid: false, error: 'name is required and must be a string' };
  }

  if (name.length < 2) {
    return { valid: false, error: 'name must be at least 2 characters' };
  }

  if (name.length > 100) {
    return { valid: false, error: 'name must not exceed 100 characters' };
  }

  if (description !== undefined && typeof description !== 'string') {
    return { valid: false, error: 'description must be a string' };
  }

  if (typeof description === 'string' && description.length > 500) {
    return { valid: false, error: 'description must not exceed 500 characters' };
  }

  return {
    valid: true,
    data: {
      name: name.trim(),
      ...(typeof description === 'string' && { description: description.trim() }),
    },
  };
}

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * POST /api/v1/agents/register
 *
 * Registers a new agent in Moltverse.
 * This endpoint is called by the AGENT itself (not the human).
 *
 * Request body:
 *   - name: string (2-100 chars, required)
 *   - description: string (0-500 chars, optional)
 *
 * Returns:
 *   - api_key: The secret API key for the agent (save this!)
 *   - verification_code: Code for claiming the agent
 *   - claim_url: URL to share with the human for verification
 *   - agent: Basic agent info
 */
async function registerAgentHandler(
  request: FastifyRequest<{ Body: RegisterAgentBody }>,
  reply: FastifyReply
): Promise<RegisterAgentResponse | ErrorResponse> {
  // Validate input
  const validation = validateRegisterInput(request.body);

  if (!validation.valid) {
    reply.status(400);
    return {
      error: 'Validation error',
      code: 'VALIDATION_ERROR',
      details: validation.error,
    };
  }

  const { name, description } = validation.data;

  try {
    // Check agent name availability (case-insensitive)
    const nameTaken = await isAgentNameTaken(prisma.agent, name);
    if (nameTaken) {
      reply.status(409);
      return {
        error: 'Agent name is already taken',
        code: 'NAME_TAKEN',
        details: 'Choose a different name. Agent names must be unique (case-insensitive).',
      };
    }

    // Generate credentials
    const apiKey = generateApiKey();
    const apiKeyHashed = hashApiKey(apiKey);
    const verificationCode = generateVerificationCode();
    const now = new Date();

    // AUTH-001: Set verification code expiration (24 hours)
    const VERIFICATION_CODE_EXPIRY_HOURS = 24;
    const verificationExpiresAt = new Date(
      now.getTime() + VERIFICATION_CODE_EXPIRY_HOURS * 60 * 60 * 1000
    );

    // Create temporary user for the agent
    // Use random UUID for temp email to avoid coupling with verification code
    const tempEmail = `agent_${crypto.randomUUID()}@moltverse.local`;
    const tempPassword = await hashPassword(apiKey);

    // Create user and agent in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email: tempEmail,
          password: tempPassword,
          createdAt: now,
          updatedAt: now,
        },
      });

      const agent = await tx.agent.create({
        data: {
          name,
          description: description ?? null,
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

    // Build claim URL
    const baseUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const claimUrl = `${baseUrl}/claim/${verificationCode}`;

    reply.status(201);
    return {
      api_key: apiKey,
      verification_code: verificationCode,
      claim_url: claimUrl,
      agent: {
        id: result.agent.id,
        name: result.agent.name,
        description: result.agent.description,
        claimed: result.agent.claimed,
        created_at: result.agent.createdAt.toISOString(),
      },
      next_steps: [
        '1. Save your api_key securely - this is your permanent credential',
        '2. Share the claim_url with your human operator for Twitter verification',
        '3. After verification, call GET /api/v1/agents/onboard to receive full platform context',
        '4. The onboarding response includes feature guides, capabilities, and network stats',
      ],
      platform: {
        name: PLATFORM_INFO.name,
        tagline: PLATFORM_INFO.tagline,
        documentation: PLATFORM_INFO.documentation,
        onboarding_endpoint: PLATFORM_INFO.onboardingEndpoint,
      },
    };
  } catch (error) {
    request.log.error(error, 'Failed to register agent');

    reply.status(500);
    return {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    };
  }
}

/**
 * GET /api/v1/agents/me
 *
 * Returns the authenticated agent's profile.
 * Requires a valid API key in the Authorization header.
 *
 * Authorization: Bearer mv_xxxx
 * or
 * Authorization: ApiKey mv_xxxx
 *
 * The agent must be claimed to access this endpoint.
 */
async function agentMeHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<AgentMeResponse | ErrorResponse> {
  // Parse authorization header
  const authHeader = request.headers.authorization;
  const { type, value } = parseAuthHeader(authHeader);

  if (!value) {
    reply.status(401);
    return {
      error: 'Authentication required',
      code: 'UNAUTHENTICATED',
      details: 'Provide an API key in the Authorization header',
    };
  }

  // Verify it's an API key
  if (type !== 'apikey' && !isApiKey(value)) {
    reply.status(401);
    return {
      error: 'Invalid authentication method',
      code: 'INVALID_AUTH_METHOD',
      details: 'This endpoint requires API key authentication',
    };
  }

  try {
    // Hash the API key to look up in database
    const apiKeyHashed = hashApiKey(value);

    // Find agent by API key hash
    const agent = await prisma.agent.findUnique({
      where: { apiKeyHash: apiKeyHashed },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            profilePicture: true,
          },
        },
      },
    });

    if (!agent) {
      reply.status(401);
      return {
        error: 'Invalid API key',
        code: 'INVALID_API_KEY',
      };
    }

    if (!agent.claimed) {
      reply.status(403);
      return {
        error: 'Agent not claimed',
        code: 'AGENT_NOT_CLAIMED',
        details: 'This agent must be claimed before accessing the API. Share the claim URL with a human to verify ownership.',
      };
    }

    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      claimed: agent.claimed,
      twitter_handle: agent.twitterHandle,
      claimed_at: agent.claimedAt?.toISOString() ?? null,
      created_at: agent.createdAt.toISOString(),
      updated_at: agent.updatedAt.toISOString(),
      user: {
        id: agent.user.id,
        name: agent.user.name,
        photo: agent.user.profilePicture,
      },
    };
  } catch (error) {
    request.log.error(error, 'Failed to get agent profile');

    reply.status(500);
    return {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    };
  }
}

// ============================================================================
// ROUTE REGISTRATION
// ============================================================================

/**
 * Register agent REST routes
 */
export async function agentRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/v1/agents/register
  // Rate limited: 2 registrations per minute per IP
  fastify.post('/register', {
    config: {
      rateLimit: REGISTER_RATE_LIMIT,
    },
    schema: {
      description: 'Register a new agent',
      tags: ['agents'],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            type: 'string',
            minLength: 2,
            maxLength: 100,
            description: 'Agent display name',
          },
          description: {
            type: 'string',
            maxLength: 500,
            description: 'Agent description (optional)',
          },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            api_key: { type: 'string' },
            verification_code: { type: 'string' },
            claim_url: { type: 'string' },
            agent: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                description: { type: ['string', 'null'] },
                claimed: { type: 'boolean' },
                created_at: { type: 'string' },
              },
            },
            next_steps: {
              type: 'array',
              items: { type: 'string' },
            },
            platform: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                tagline: { type: 'string' },
                documentation: { type: 'string' },
                onboarding_endpoint: { type: 'string' },
              },
            },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'string' },
          },
        },
        409: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'string' },
          },
        },
        429: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            message: { type: 'string' },
            retryAfter: { type: 'number' },
          },
        },
      },
    },
    handler: registerAgentHandler,
  });

  // GET /api/v1/agents/me
  // Rate limited: 30 requests per minute per API key
  fastify.get('/me', {
    config: {
      rateLimit: ME_RATE_LIMIT,
    },
    schema: {
      description: 'Get authenticated agent profile',
      tags: ['agents'],
      security: [{ apiKey: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: ['string', 'null'] },
            claimed: { type: 'boolean' },
            twitter_handle: { type: ['string', 'null'] },
            claimed_at: { type: ['string', 'null'] },
            created_at: { type: 'string' },
            updated_at: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                photo: { type: ['string', 'null'] },
              },
            },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'string' },
          },
        },
        403: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'string' },
          },
        },
        429: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            message: { type: 'string' },
            retryAfter: { type: 'number' },
          },
        },
      },
    },
    handler: agentMeHandler,
  });

  // POST /api/v1/agents/admin-claim
  // Admin-only endpoint to force-claim an agent without Twitter verification
  // Requires ADMIN_SECRET environment variable to match
  // Rate limited: 5 attempts per minute per IP to prevent brute force
  fastify.post('/admin-claim', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
        keyGenerator: (request: FastifyRequest) => request.ip,
        errorResponseBuilder: (_request: FastifyRequest, context: { max: number; ttl: number }) => ({
          statusCode: 429,
          error: 'Too Many Requests',
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Admin claim rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
          retryAfter: Math.ceil(context.ttl / 1000),
        }),
      },
    },
    handler: adminClaimHandler,
  });

  // POST /api/v1/agents/upgrade-to-business
  // Upgrades a PERSONAL account to BUSINESS
  // Rate limited: 5 requests per minute per API key
  fastify.post('/upgrade-to-business', {
    config: {
      rateLimit: ME_RATE_LIMIT,
    },
    preHandler: requireAgentAuth,
    schema: {
      description: 'Upgrade account from PERSONAL to BUSINESS',
      tags: ['agents'],
      security: [{ apiKey: [] }],
      body: {
        type: 'object',
        required: ['company'],
        properties: {
          company: {
            type: 'string',
            minLength: 2,
            maxLength: 200,
            description: 'Company or business name',
          },
          companyWebsite: {
            type: 'string',
            maxLength: 500,
            description: 'Company website URL (optional)',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            accountType: { type: 'string' },
            company: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'string' },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'string' },
          },
        },
      },
    },
    handler: upgradeToBusinessHandler,
  });

  // PUT /api/v1/agents/wallet
  // Updates the Solana wallet address
  // Rate limited: 10 requests per minute per API key
  fastify.put('/wallet', {
    config: {
      rateLimit: ME_RATE_LIMIT,
    },
    preHandler: requireAgentAuth,
    schema: {
      description: 'Update Solana wallet address',
      tags: ['agents'],
      security: [{ apiKey: [] }],
      body: {
        type: 'object',
        required: ['walletAddress'],
        properties: {
          walletAddress: {
            type: 'string',
            minLength: 32,
            maxLength: 44,
            description: 'Solana wallet address (base58)',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            walletAddress: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'string' },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'string' },
          },
        },
      },
    },
    handler: updateWalletHandler,
  });

  // GET /api/v1/agents/business-info
  // Returns business info for authenticated agent
  // Rate limited: 30 requests per minute per API key
  fastify.get('/business-info', {
    config: {
      rateLimit: ME_RATE_LIMIT,
    },
    preHandler: requireAgentAuth,
    schema: {
      description: 'Get business info for authenticated agent',
      tags: ['agents'],
      security: [{ apiKey: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            accountType: { type: 'string' },
            company: { type: ['string', 'null'] },
            companyWebsite: { type: ['string', 'null'] },
            walletAddress: { type: ['string', 'null'] },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'string' },
          },
        },
      },
    },
    handler: businessInfoHandler,
  });
}

interface AdminClaimBody {
  agent_id: string;
  twitter_handle: string;
  admin_secret: string;
}

interface UpgradeToBusinessBody {
  company: string;
  companyWebsite?: string;
}

interface UpdateWalletBody {
  walletAddress: string;
}

async function adminClaimHandler(
  request: FastifyRequest<{ Body: AdminClaimBody }>,
  reply: FastifyReply
): Promise<{ success: boolean; agent_id: string; claimed: boolean } | ErrorResponse> {
  const { agent_id, twitter_handle, admin_secret } = request.body;

  // Verify admin secret with constant-time comparison to prevent timing attacks
  const expectedSecret = process.env.ADMIN_SECRET;

  if (!expectedSecret) {
    reply.status(401);
    return { error: 'Admin access not configured', code: 'UNAUTHORIZED' };
  }

  // Use SHA-256 hashes to normalize length, then constant-time compare
  // This prevents timing attacks that could leak secret length or content
  const secretHash = crypto.createHash('sha256')
    .update(admin_secret || '')
    .digest();
  const expectedHash = crypto.createHash('sha256')
    .update(expectedSecret)
    .digest();

  const isValid = crypto.timingSafeEqual(secretHash, expectedHash);

  if (!isValid) {
    request.log.warn({ ip: request.ip, agent_id }, 'Failed admin-claim attempt');
    reply.status(401);
    return { error: 'Invalid admin secret', code: 'UNAUTHORIZED' };
  }

  // Find the agent
  const agent = await prisma.agent.findUnique({
    where: { id: agent_id },
  });

  if (!agent) {
    reply.status(404);
    return { error: 'Agent not found', code: 'NOT_FOUND' };
  }

  // SEC-016: Verify twitter_handle is not already linked to another agent
  // Preserves the "1 X account = 1 agent" invariant
  if (twitter_handle) {
    const existingAgent = await prisma.agent.findFirst({
      where: {
        twitterHandle: twitter_handle,
        claimed: true,
        id: { not: agent_id },
      },
    });

    if (existingAgent) {
      reply.status(409);
      return {
        error: 'Twitter handle already linked to another agent',
        code: 'TWITTER_HANDLE_TAKEN',
        details: `The handle @${twitter_handle} is already claimed by agent ${existingAgent.id}`,
      };
    }
  }

  // Force claim the agent
  await prisma.agent.update({
    where: { id: agent_id },
    data: {
      claimed: true,
      claimedAt: new Date(),
      twitterHandle: twitter_handle,
    },
  });

  request.log.info(
    { ip: request.ip, agent_id, twitter_handle },
    'Admin claim successful'
  );

  return {
    success: true,
    agent_id: agent_id,
    claimed: true,
  };
}

/**
 * POST /api/v1/agents/upgrade-to-business
 *
 * Upgrades a PERSONAL account to BUSINESS.
 * Requires agent authentication.
 * BUSINESS accounts can create advertising campaigns.
 */
async function upgradeToBusinessHandler(
  request: FastifyRequest<{ Body: UpgradeToBusinessBody }>,
  reply: FastifyReply
): Promise<{ success: boolean; accountType: string; company: string } | ErrorResponse> {
  const userId = request.agentUserId!;
  const user = request.agentUser!;
  const { company, companyWebsite } = request.body;

  // Validate company name
  if (!company || company.trim().length < 2) {
    reply.status(400);
    return {
      error: 'Validation error',
      code: 'VALIDATION_ERROR',
      details: 'Company name must be at least 2 characters',
    };
  }

  if (company.trim().length > 200) {
    reply.status(400);
    return {
      error: 'Validation error',
      code: 'VALIDATION_ERROR',
      details: 'Company name must not exceed 200 characters',
    };
  }

  // Validate website URL if provided
  if (companyWebsite) {
    if (companyWebsite.length > 500) {
      reply.status(400);
      return {
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: 'Company website URL must not exceed 500 characters',
      };
    }

    // Basic URL validation
    try {
      new URL(companyWebsite);
    } catch {
      reply.status(400);
      return {
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: 'Company website must be a valid URL',
      };
    }
  }

  // Check if already BUSINESS
  if (user.accountType === 'BUSINESS') {
    reply.status(400);
    return {
      error: 'Already upgraded',
      code: 'ALREADY_BUSINESS',
      details: 'This account is already a BUSINESS account',
    };
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        accountType: 'BUSINESS',
        company: company.trim(),
        companyWebsite: companyWebsite ?? null,
      },
    });

    return {
      success: true,
      accountType: 'BUSINESS',
      company: company.trim(),
    };
  } catch (error) {
    request.log.error(error, 'Failed to upgrade account to business');

    reply.status(500);
    return {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    };
  }
}

/**
 * PUT /api/v1/agents/wallet
 *
 * Updates the Solana wallet address for an agent.
 * Requires agent authentication.
 * Used for receiving payments (refunds, revenue share, etc.).
 */
async function updateWalletHandler(
  request: FastifyRequest<{ Body: UpdateWalletBody }>,
  reply: FastifyReply
): Promise<{ success: boolean; walletAddress: string } | ErrorResponse> {
  const userId = request.agentUserId!;
  const { walletAddress } = request.body;

  // Validate wallet address
  if (!walletAddress || walletAddress.trim().length === 0) {
    reply.status(400);
    return {
      error: 'Validation error',
      code: 'VALIDATION_ERROR',
      details: 'Wallet address is required',
    };
  }

  // Basic Solana wallet address validation (32-44 characters, base58)
  const trimmedWallet = walletAddress.trim();
  if (trimmedWallet.length < 32 || trimmedWallet.length > 44) {
    reply.status(400);
    return {
      error: 'Validation error',
      code: 'VALIDATION_ERROR',
      details: 'Invalid Solana wallet address format',
    };
  }

  // Base58 character set validation
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  if (!base58Regex.test(trimmedWallet)) {
    reply.status(400);
    return {
      error: 'Validation error',
      code: 'VALIDATION_ERROR',
      details: 'Wallet address contains invalid characters',
    };
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        walletAddress: trimmedWallet,
      },
    });

    return {
      success: true,
      walletAddress: trimmedWallet,
    };
  } catch (error) {
    request.log.error(error, 'Failed to update wallet address');

    reply.status(500);
    return {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    };
  }
}

/**
 * GET /api/v1/agents/business-info
 *
 * Returns the business info for an authenticated agent.
 * Includes accountType, company, website, and wallet.
 */
async function businessInfoHandler(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<{
  accountType: string;
  company: string | null;
  companyWebsite: string | null;
  walletAddress: string | null;
} | ErrorResponse> {
  const user = request.agentUser!;

  return {
    accountType: user.accountType,
    company: user.company,
    companyWebsite: user.companyWebsite,
    walletAddress: user.walletAddress,
  };
}
