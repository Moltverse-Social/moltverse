/**
 * Public agent behavior endpoint — Camada 3 §5.2.
 *
 * Routes:
 *   - GET /api/v1/agents/:handle/behavior — current score + public
 *     subset of features for the agent identified by handle.
 *
 * Public means "no auth required". The response includes only fields
 * marked `public: true` in the persisted `AgentBehaviorScore.features`
 * blob, plus the public-flag list. Private fields (raw bimodal, raw
 * burstiness, IAT log-stddev) stay server-side and are visible only
 * through admin endpoints.
 *
 * When the agent has no score row yet (never been scored), we return
 * the INSUFFICIENT_DATA fallback inline rather than 404 — keeps the
 * UI's loading paths simple.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  INSUFFICIENT_DATA_CATEGORY,
  INSUFFICIENT_DATA_SCORE,
} from '../lib/behavior/score-formula.js';
import { prisma } from '../lib/prisma.js';

const BEHAVIOR_RATE_LIMIT = {
  max: 60,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({
    statusCode: 429,
    error: 'Too Many Requests',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Behavior endpoint rate limit: 60 requests per minute.',
  }),
};

const paramsSchema = z.object({
  handle: z.string().min(3).max(30).regex(/^[a-z][a-z0-9_-]{2,29}$/),
});

interface PublicBehaviorResponse {
  agentHandle: string;
  did: string | null;
  score: number;
  scoreCategory: string;
  computedAt: string | null;
  windowDays: number | null;
  /** Public subset of features. Private fields stripped. */
  features: Record<string, unknown>;
  /** Public flags (severity, flag name, when raised). */
  flags: Array<{
    flag: string;
    source: string;
    severity: string;
    raisedAt: string;
  }>;
  insufficientData: boolean;
}

function pickPublicFeatures(features: unknown): Record<string, unknown> {
  if (typeof features !== 'object' || features === null) return {};
  const obj = features as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'computationMeta') continue;
    if (typeof value === 'object' && value !== null && (value as { public?: unknown }).public === true) {
      // Strip the `public` marker itself from the response.
      const { public: _flag, ...rest } = value as { public: boolean } & Record<string, unknown>;
      out[key] = rest;
    }
  }
  return out;
}

export async function agentBehaviorRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/:handle/behavior', {
    config: { rateLimit: BEHAVIOR_RATE_LIMIT },
    handler: async (request, reply) => {
      const parsed = paramsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Invalid handle',
          code: 'VALIDATION_FAILED',
          details: parsed.error.flatten(),
        });
      }
      const { handle } = parsed.data;

      const agent = await prisma.agent.findUnique({
        where: { handle },
        select: { id: true, did: true, handle: true },
      });
      if (agent === null) {
        return reply.status(404).send({
          error: 'Agent not found',
          code: 'AGENT_NOT_FOUND',
        });
      }

      const [scoreRow, publicFlags] = await Promise.all([
        prisma.agentBehaviorScore.findUnique({ where: { agentId: agent.id } }),
        prisma.behaviorFlag.findMany({
          where: { agentId: agent.id, resolvedAt: null, isPublic: true },
          select: { flag: true, source: true, severity: true, raisedAt: true },
          orderBy: { raisedAt: 'desc' },
          take: 20,
        }),
      ]);

      const body: PublicBehaviorResponse =
        scoreRow === null
          ? {
              agentHandle: agent.handle!,
              did: agent.did,
              score: INSUFFICIENT_DATA_SCORE,
              scoreCategory: INSUFFICIENT_DATA_CATEGORY,
              computedAt: null,
              windowDays: null,
              features: {},
              flags: publicFlags.map((f) => ({
                flag: f.flag,
                source: f.source,
                severity: f.severity,
                raisedAt: f.raisedAt.toISOString(),
              })),
              insufficientData: true,
            }
          : {
              agentHandle: agent.handle!,
              did: agent.did,
              score: scoreRow.score,
              scoreCategory: scoreRow.scoreCategory,
              computedAt: scoreRow.computedAt.toISOString(),
              windowDays: scoreRow.windowDays,
              features: pickPublicFeatures(scoreRow.features),
              flags: publicFlags.map((f) => ({
                flag: f.flag,
                source: f.source,
                severity: f.severity,
                raisedAt: f.raisedAt.toISOString(),
              })),
              insufficientData: scoreRow.activeFlags.includes('INSUFFICIENT_DATA'),
            };

      reply.send(body);
    },
  });
}
