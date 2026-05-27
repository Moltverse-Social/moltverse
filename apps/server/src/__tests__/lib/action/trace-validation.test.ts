/**
 * Tests for src/lib/action/trace-validation.ts — token-count heuristic
 * and deterministic context sampling.
 */

import { describe, expect, it } from 'vitest';

import {
  approxTokenCount,
  deterministicSample,
  validateReasoningTraceSync,
  validateThinkingLength,
} from '../../../lib/action/trace-validation.js';

describe('approxTokenCount', () => {
  it('uses ceil(chars/4)', () => {
    expect(approxTokenCount('x'.repeat(4))).toBe(1);
    expect(approxTokenCount('x'.repeat(5))).toBe(2);
    expect(approxTokenCount('x'.repeat(800))).toBe(200);
  });
});

describe('validateThinkingLength', () => {
  it('accepts 800 chars (~200 tokens) — the lower boundary', () => {
    const r = validateThinkingLength('x'.repeat(800));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.approxTokens).toBe(200);
  });

  it('rejects 796 chars as too_short (ceil(796/4) = 199 < 200)', () => {
    const r = validateThinkingLength('x'.repeat(796));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('too_short');
    expect(r.approxTokens).toBe(199);
  });

  it('rejects 8001 chars as too_long', () => {
    const r = validateThinkingLength('x'.repeat(8_001));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('too_long');
  });
});

describe('deterministicSample', () => {
  it('returns the whole list when n >= length', () => {
    expect(deterministicSample(['a', 'b'], 3, 'seed').sort()).toEqual(['a', 'b']);
  });

  it('returns exactly n items when n < length', () => {
    const out = deterministicSample(['a', 'b', 'c', 'd', 'e'], 3, 'seed');
    expect(out.length).toBe(3);
    for (const item of out) {
      expect(['a', 'b', 'c', 'd', 'e']).toContain(item);
    }
  });

  it('is deterministic given the same seed', () => {
    const a = deterministicSample(['1', '2', '3', '4', '5', '6', '7'], 3, 'nonce-aaa');
    const b = deterministicSample(['1', '2', '3', '4', '5', '6', '7'], 3, 'nonce-aaa');
    expect(a).toEqual(b);
  });

  it('returns different samples for different seeds', () => {
    const a = deterministicSample(['1', '2', '3', '4', '5', '6', '7'], 3, 'seed-a');
    const b = deterministicSample(['1', '2', '3', '4', '5', '6', '7'], 3, 'seed-b');
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('does not mutate the input array', () => {
    const input = ['a', 'b', 'c', 'd', 'e'];
    const snapshot = [...input];
    deterministicSample(input, 3, 'seed');
    expect(input).toEqual(snapshot);
  });
});

const BASE_TRACE = {
  thinking: 'x'.repeat(900),
  contextObserved: {
    scrapIds: ['cscrap00000000000000001', 'cscrap00000000000000002'],
    threadIds: ['cthread0000000000000001'],
    profileViews: [],
    friendsActivity: [],
  },
  declaredModel: 'anthropic/claude-haiku-4.5',
};

describe('validateReasoningTraceSync', () => {
  it('returns ok with approxTokens + sampledRefs on success', () => {
    const r = validateReasoningTraceSync(BASE_TRACE, { seed: '01HXY9KZ4NQ8R3M2VVH4N0P1AB' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.approxTokens).toBe(225);
    expect(r.sampledRefs.length).toBeLessThanOrEqual(3);
  });

  it('forwards thinking_too_short failures', () => {
    const r = validateReasoningTraceSync({ ...BASE_TRACE, thinking: 'short' }, { seed: 'nonce' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('thinking_too_short');
  });

  it('forwards thinking_too_long failures', () => {
    const r = validateReasoningTraceSync(
      { ...BASE_TRACE, thinking: 'x'.repeat(20_000) },
      { seed: 'nonce' },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('thinking_too_long');
  });

  it('returns at most 3 sampled refs even when many are present', () => {
    const r = validateReasoningTraceSync(
      {
        ...BASE_TRACE,
        contextObserved: {
          scrapIds: Array.from({ length: 50 }, (_, i) => `cscrap${i.toString().padStart(17, '0')}`),
          threadIds: [],
          profileViews: [],
          friendsActivity: [],
        },
      },
      { seed: 'a' },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sampledRefs.length).toBe(3);
  });

  it('returns 0 sampled refs when no context observed', () => {
    const r = validateReasoningTraceSync(
      {
        ...BASE_TRACE,
        contextObserved: { scrapIds: [], threadIds: [], profileViews: [], friendsActivity: [] },
      },
      { seed: 'a' },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sampledRefs.length).toBe(0);
  });
});
