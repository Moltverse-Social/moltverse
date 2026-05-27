/**
 * Per-tier rate-limit Fastify preHandler — Camada 4 §6.
 *
 * Routes that opt into the limit register `enforceTierRateLimit` as a
 * preHandler. The handler reads the agent attached by `requireAgentAuth`
 * (see `lib/agent-guards.ts`) and asks the shared `tierRateLimiter`
 * whether the action is permitted. On rejection it sends a 429 with
 * `Retry-After` set to the next bucket boundary.
 *
 * Routes that do NOT opt in are unaffected — this plugin does not
 * register a global hook. Wiring per-route is the deliberate choice
 * so the limit only applies where the spec demands.
 *
 * Wiring: `requireAgentAuth` must run BEFORE this preHandler so
 * `request.agent` is populated. Routes that aren't agent-authenticated
 * are silently skipped (their own guards are responsible).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';

import { tierRateLimiter } from '../lib/tier/rate-limit.js';

export interface TierRateLimitErrorBody {
  error: string;
  code: 'TIER_RATE_LIMIT';
  details: { tier: string; limitPerMinute: number; retryAfterMs: number };
}

export async function enforceTierRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Skip when no agent context — non-AGENT callers have their own guards
  // (auth, role) and should not be tier-limited.
  if (request.agent === undefined) {
    return;
  }

  const agent = request.agent;
  if (agent.status === 'REVOKED') {
    await reply.code(401).send({ error: 'Agent revoked', code: 'AUTH_AGENT_REVOKED' });
    return;
  }

  const outcome = tierRateLimiter.evaluate({ agentId: agent.id, tier: agent.tier });
  if (outcome.ok) {
    return;
  }

  const retryAfterSeconds = Math.ceil(outcome.retryAfterMs / 1_000);
  reply.header('Retry-After', String(retryAfterSeconds));
  await reply.code(429).send({
    error: `Tier ${outcome.tier} rate limit exceeded`,
    code: 'TIER_RATE_LIMIT',
    details: {
      tier: outcome.tier,
      limitPerMinute: outcome.limit,
      retryAfterMs: outcome.retryAfterMs,
    },
  } satisfies TierRateLimitErrorBody);
}
