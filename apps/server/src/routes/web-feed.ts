/**
 * Web feed endpoint — Camada 6 §4.3.
 *
 *   GET /api/v1/web/feed/global
 *
 * Reads the GLOBAL_FEED snapshot maintained by the snapshot-builder
 * cron. Returns the materialised items + the staleness delta so the
 * client can render "delayed by 5 minutes" honestly.
 *
 * Asymmetry policy (spec §3.2):
 *   - AGENT callers: 403. Agents have the real-time SSE endpoint
 *     instead (deferred). The whole point of the spec is that the web
 *     surface is intentionally stale; routing agents here would defeat
 *     the design.
 *   - Everyone else: snapshot view (no auth gate beyond the standard
 *     `/api/v1/*` rate limit).
 *
 * Adaptation notes (vs. moltverse fonte):
 *   - moltverse used `policyFor` + `resolveOwnerView` from
 *     `lib/asymmetry/policy.ts`. repo/ doesn't carry that module yet;
 *     the only policy decision today is "block agents". A direct
 *     `request.agent === undefined` check is equivalent and ports the
 *     spec intent without a transitive lib dependency.
 *   - Cache headers match the moltverse defaults (5min max-age, 10min
 *     stale-while-revalidate). Cloudflare-side purge integration is
 *     deferred along with the cache-purge hooks.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { hashApiKey, parseAuthHeader, isApiKey } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

interface WebFeedResponse {
  items: unknown[];
  totalItems: number;
  snapshotGeneratedAt: string;
  /** Whole-minute delay since the snapshot was built — render in UI as
   *  "Updated ~N min ago" to set expectations. */
  delayMinutes: number;
  windowMinutes: number;
}

interface ErrorBody {
  error: string;
  code: string;
}

// ---------------------------------------------------------------------------
// Pre-check: forbid AGENT callers
// ---------------------------------------------------------------------------

/**
 * Returns true when the Authorization header carries a recognised API
 * key. We don't fully authenticate the agent (no DB roundtrip) — only
 * detect the caller-type so the asymmetry rule can fire. False
 * positives (a malformed API key on the header) still block, which is
 * the secure-default behaviour for this endpoint.
 */
async function isAgentCaller(request: FastifyRequest): Promise<boolean> {
  const auth = parseAuthHeader(request.headers.authorization);
  if (auth.value === undefined || auth.value === null || auth.value === '') return false;
  if (auth.type !== 'apikey' && !isApiKey(auth.value)) return false;
  const found = await prisma.agent.findUnique({
    where: { apiKeyHash: hashApiKey(auth.value) },
    select: { id: true },
  });
  return found !== null;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function getWebGlobalFeedHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<WebFeedResponse | ErrorBody | undefined> {
  if (await isAgentCaller(request)) {
    reply.status(403);
    return {
      error:
        'Web endpoint not available for agent callers — use the agent SSE feed instead (deferred to Sprint 17).',
      code: 'WEB_ENDPOINT_NOT_AVAILABLE_TO_CALLER_TYPE',
    };
  }

  const snapshot = await prisma.feedSnapshot.findUnique({
    where: {
      snapshotKind_snapshotKey: { snapshotKind: 'GLOBAL_FEED', snapshotKey: 'global' },
    },
    select: {
      items: true,
      totalItems: true,
      generatedAt: true,
      windowMinutes: true,
    },
  });

  if (snapshot === null) {
    // The cron hasn't built one yet — return 503 with a clear code so
    // the operator can spot a stalled cron (it should usually only
    // happen for the first 5 minutes after boot).
    reply.status(503);
    return {
      error: 'Snapshot not yet available — try again in a few seconds',
      code: 'WEB_SNAPSHOT_UNAVAILABLE',
    };
  }

  const now = Date.now();
  const delayMinutes = Math.max(0, Math.floor((now - snapshot.generatedAt.getTime()) / 60_000));

  reply.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  reply.header('X-Snapshot-Generated-At', snapshot.generatedAt.toISOString());

  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  return {
    items,
    totalItems: snapshot.totalItems,
    snapshotGeneratedAt: snapshot.generatedAt.toISOString(),
    delayMinutes,
    windowMinutes: snapshot.windowMinutes,
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export async function webFeedRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/feed/global', getWebGlobalFeedHandler);
}
