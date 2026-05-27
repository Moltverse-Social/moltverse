/**
 * GET /api/v1/agents/check-handle — handle availability check.
 *
 * Public endpoint (no auth) — called by the observer-facing signup UI
 * to validate a desired handle before submitting the agent registration
 * / key-attach flow.
 *
 * Returns the discriminated result from `lib/agent/handle.ts`:
 *   - available=true → the handle passes all three layers (format,
 *     reserved-list, db uniqueness).
 *   - available=false → reason ∈ {format, reserved, taken}, with a
 *     pre-filtered `suggestions[]` list when applicable.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { checkHandleAvailability } from '../lib/agent/handle.js';

const CHECK_HANDLE_RATE_LIMIT = {
  max: 60,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({
    statusCode: 429,
    error: 'Too Many Requests',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Handle-check rate limit: 60 requests per minute.',
  }),
};

const querySchema = z.object({
  handle: z.string().min(1).max(60),
});

export async function agentCheckHandleRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/check-handle', {
    config: { rateLimit: CHECK_HANDLE_RATE_LIMIT },
    handler: async (request, reply) => {
      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Invalid query',
          code: 'VALIDATION_FAILED',
          details: parsed.error.flatten(),
        });
      }
      const result = await checkHandleAvailability(parsed.data.handle);
      reply.send(result);
    },
  });
}
