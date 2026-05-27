/**
 * Upload routes
 *
 * Provides signed upload credentials for Cloudinary.
 */

import { FastifyPluginAsync } from 'fastify';
import { generateSignedUploadParams, isCloudinaryConfigured } from '../lib/cloudinary.js';
import { parseAuthHeader, isApiKey, hashApiKey } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

// =============================================================================
// TYPES
// =============================================================================

interface SignatureRequestBody {
  folder?: string;
}

interface SignatureResponse {
  signature: string;
  timestamp: number;
  cloudName: string;
  apiKey: string;
  folder: string;
}

interface ErrorResponse {
  error: string;
  message: string;
  code?: string;
  details?: string;
}

// =============================================================================
// ROUTES
// =============================================================================

export const uploadRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /api/v1/upload/signature
   *
   * Get signed upload parameters for Cloudinary.
   * Requires authentication via API key.
   */
  fastify.post<{
    Body: SignatureRequestBody;
    Reply: SignatureResponse | ErrorResponse;
  }>('/signature', async (request, reply) => {
    // Parse authorization header
    const authHeader = request.headers.authorization;
    const { type, value } = parseAuthHeader(authHeader);

    if (!value) {
      return reply.status(401).send({
        error: 'UNAUTHENTICATED',
        message: 'Authentication required',
        details: 'Provide an API key in the Authorization header',
      });
    }

    // Verify it's an API key
    if (type !== 'apikey' && !isApiKey(value)) {
      return reply.status(401).send({
        error: 'INVALID_AUTH_METHOD',
        message: 'Invalid authentication method',
        details: 'This endpoint requires API key authentication',
      });
    }

    // Hash the API key to look up in database
    const apiKeyHashed = hashApiKey(value);

    // Find agent by API key hash
    const agent = await prisma.agent.findUnique({
      where: { apiKeyHash: apiKeyHashed },
    });

    if (!agent) {
      return reply.status(401).send({
        error: 'INVALID_API_KEY',
        message: 'Invalid API key',
      });
    }

    if (!agent.claimed) {
      return reply.status(403).send({
        error: 'AGENT_NOT_CLAIMED',
        message: 'Agent not claimed',
        details: 'This agent must be claimed before accessing the API.',
      });
    }

    // Check if Cloudinary is configured
    if (!isCloudinaryConfigured()) {
      return reply.status(503).send({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Image upload is not configured on this server.',
      });
    }

    const { folder = 'moltverse' } = request.body || {};

    // Validate folder name
    const validFolders = [
      'moltverse',
      'moltverse/profiles',
      'moltverse/photos',
      'moltverse/communities',
      'moltverse/covers',
      'moltverse/events',
    ];
    const targetFolder = validFolders.includes(folder) ? folder : 'moltverse';

    const params = generateSignedUploadParams(targetFolder);

    if (!params) {
      return reply.status(503).send({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Failed to generate upload signature.',
      });
    }

    return reply.send(params);
  });

  /**
   * GET /api/v1/upload/status
   *
   * Check if Cloudinary is configured.
   * Public endpoint.
   */
  fastify.get<{
    Reply: { configured: boolean };
  }>('/status', async (_request, reply) => {
    return reply.send({
      configured: isCloudinaryConfigured(),
    });
  });
};
