/**
 * Anti-replay primitives — Camada 2 §5.
 *
 * Two checks that together prevent a captured action payload from
 * being re-submitted:
 *
 *   1. {@link verifyTimestampWindow} — the action's `timestamp` must be
 *      within ±5 min of server time. Anything older is presumed stale;
 *      anything in the future is presumed clock-skewed or hostile.
 *
 *   2. {@link consumeActionNonce} — atomically inserts the nonce ULID
 *      into the `action_nonces` table. If a row already exists (PK
 *      violation), the action is a replay and is rejected. The 1h
 *      TTL is enforced by a cron worker so the table stays small.
 *
 * The timestamp window is wider than strictly necessary to tolerate
 * the realistic clock drift between an SDK agent woken up via SSE/webhook
 * on slow networks and the server.
 */

import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

/** ±5min window. */
export const TIMESTAMP_WINDOW_MS = 5 * 60 * 1_000;
/** 1h after consume, the row is eligible for cron-driven cleanup. */
export const NONCE_TTL_MS = 60 * 60 * 1_000;

export type TimestampWindowResult =
  | { ok: true; skewMs: number }
  | { ok: false; reason: 'malformed' | 'too_old' | 'too_new'; skewMs: number };

/**
 * Validate that a wire `timestamp` parses and is within the allowed
 * window of `serverNow`. Pure — no I/O.
 *
 * The two failure variants ("too_old" vs "too_new") let routes surface
 * specific telemetry: stale-replay vs clock-skew/attacker pre-signing.
 */
export function verifyTimestampWindow(
  timestamp: string,
  serverNow: Date = new Date(),
): TimestampWindowResult {
  const parsedMs = Date.parse(timestamp);
  if (Number.isNaN(parsedMs)) {
    return { ok: false, reason: 'malformed', skewMs: 0 };
  }
  const skewMs = parsedMs - serverNow.getTime();
  if (skewMs > TIMESTAMP_WINDOW_MS) {
    return { ok: false, reason: 'too_new', skewMs };
  }
  if (skewMs < -TIMESTAMP_WINDOW_MS) {
    return { ok: false, reason: 'too_old', skewMs };
  }
  return { ok: true, skewMs };
}

export type ConsumeNonceResult = { ok: true } | { ok: false; reason: 'replayed' | 'db_error' };

/**
 * Atomically claim a nonce for an agent. The `nonce` column is the
 * primary key on `action_nonces`, so a P2002 unique-violation maps
 * cleanly to "replay attempted". All other errors return `db_error`
 * so the route handler can surface 500 / retry.
 *
 * Takes the prisma client as parameter (rather than the imported
 * singleton) so the same function can be called from inside a
 * `$transaction` callback if a future caller wants the nonce
 * consume to participate in a larger atomic operation.
 */
export async function consumeActionNonce(
  prisma: Pick<PrismaClient, 'actionNonce'>,
  agentId: string,
  nonce: string,
  now: Date = new Date(),
): Promise<ConsumeNonceResult> {
  try {
    await prisma.actionNonce.create({
      data: {
        nonce,
        agentId,
        consumedAt: now,
        expiresAt: new Date(now.getTime() + NONCE_TTL_MS),
      },
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { ok: false, reason: 'replayed' };
    }
    return { ok: false, reason: 'db_error' };
  }
}
