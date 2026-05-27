/**
 * Synchronous reasoning-trace validation (Camada 2 §6.3).
 *
 * Runs inline as part of the action pipeline so an obviously-bad trace
 * fails the request rather than landing in the DB to be revalidated
 * asynchronously by the LLM judge.
 *
 * Two checks here:
 *
 *   1. Token-count band. `thinking` must approximate 200-2000 tokens.
 *      Spec recommends `tiktoken` for a true tokenizer; we use the
 *      chars/4 heuristic which lines up to ±15% of the true count for
 *      English / Romance text and is platform-portable. A future
 *      enhancement can swap in `tiktoken` without changing the
 *      function's signature.
 *
 *   2. Context-reference plausibility (sample). Spec §6.3: take 3
 *      random refs from `scrapIds + threadIds` and check they
 *      reference real, visible entities. The DB-bound check lives in
 *      `trace-context-audit.ts`; here we deterministically sample the
 *      refs the auditor will later check.
 */

import type { ReasoningTraceInput } from './payload-schema.js';

const CHARS_PER_TOKEN_HEURISTIC = 4;
const MIN_TOKENS = 200;
const MAX_TOKENS = 2_000;

/** Approximate token count via the chars/4 heuristic. Pure. */
export function approxTokenCount(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN_HEURISTIC);
}

export type ThinkingLengthResult =
  | { ok: true; approxTokens: number }
  | { ok: false; reason: 'too_short' | 'too_long'; approxTokens: number };

export function validateThinkingLength(thinking: string): ThinkingLengthResult {
  const approxTokens = approxTokenCount(thinking);
  if (approxTokens < MIN_TOKENS) return { ok: false, reason: 'too_short', approxTokens };
  if (approxTokens > MAX_TOKENS) return { ok: false, reason: 'too_long', approxTokens };
  return { ok: true, approxTokens };
}

/**
 * Deterministic-random sample of `n` items from `xs`. Uses a seed
 * (the action nonce in production) so a replay attack can't game the
 * sample by retrying until the cheap items are chosen.
 *
 * Seed-based shuffle: Fisher-Yates with a deterministic RNG derived
 * from `seed` via a tiny xorshift32 — no crypto strength needed, just
 * unpredictability vs. the caller.
 */
export function deterministicSample<T>(xs: readonly T[], n: number, seed: string): T[] {
  if (xs.length <= n) return [...xs];
  const arr = [...xs];
  const rng = xorshift32FromString(seed);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = rng() % (i + 1);
    const tmp = arr[i];
    arr[i] = arr[j] as T;
    arr[j] = tmp as T;
  }
  return arr.slice(0, n);
}

function xorshift32FromString(seed: string): () => number {
  let state = 0;
  for (let i = 0; i < seed.length; i += 1) {
    state = (state * 31 + seed.charCodeAt(i)) | 0;
  }
  if (state === 0) state = 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

export interface TraceValidationContext {
  /** Used as the sampler seed — typically the action nonce. */
  seed: string;
}

export type TraceValidationResult =
  | { ok: true; approxTokens: number; sampledRefs: readonly string[] }
  | { ok: false; reason: 'thinking_too_short' | 'thinking_too_long'; approxTokens: number };

/**
 * Run the cheap synchronous checks against a `reasoningTrace`. The
 * caller (route handler) maps the failure variants to HTTP 422 with
 * the corresponding error code per spec §6.2 step 10.
 *
 * Returns the sampled refs so the caller can persist them on the
 * `TraceContextAudit` record for the async auditor to follow up.
 */
export function validateReasoningTraceSync(
  trace: ReasoningTraceInput,
  ctx: TraceValidationContext,
): TraceValidationResult {
  const lengthResult = validateThinkingLength(trace.thinking);
  if (!lengthResult.ok) {
    return {
      ok: false,
      reason: lengthResult.reason === 'too_short' ? 'thinking_too_short' : 'thinking_too_long',
      approxTokens: lengthResult.approxTokens,
    };
  }

  const allRefs = [...trace.contextObserved.scrapIds, ...trace.contextObserved.threadIds];
  const sampled = deterministicSample(allRefs, 3, ctx.seed);

  return {
    ok: true,
    approxTokens: lengthResult.approxTokens,
    sampledRefs: sampled,
  };
}
