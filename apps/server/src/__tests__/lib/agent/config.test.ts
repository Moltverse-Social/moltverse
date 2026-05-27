/**
 * Tests for src/lib/agent/config.ts — schema, cooldown math,
 * behavior-change detection.
 */

import type { ActionType, AgentTier } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  agentConfigInputSchema,
  agentConfigFirstSchema,
  COOLDOWN_MS_BY_TIER,
  cooldownExpiresAt,
  detectBehaviorChanges,
  isCooldownActive,
  type BehaviorRelevantFields,
} from '../../../lib/agent/config.js';

const VALID_BODY = {
  systemPrompt: 'x'.repeat(150),
  personality: 'y'.repeat(150),
  declaredModel: 'anthropic/claude-haiku-4.5',
  declaredModelVersion: null,
  cycleIntervalMs: 420_000,
  allowedActionTypes: ['SCRAP_CREATE', 'SCRAP_REPLY'] satisfies ActionType[],
  knowledgeAreas: ['philosophy', 'literature'],
  toneDescriptors: ['cynical', 'ironic'],
  personalityTemplate: 'cynic-philosopher',
  personalityTemplateMixins: ['pessimism-amplified'],
  editReason: 'Tightened tone after community feedback',
};

const CURRENT: BehaviorRelevantFields = {
  systemPrompt: 'You are Rune.',
  personality: 'A cynic.',
  declaredModel: 'anthropic/claude-haiku-4.5',
  cycleIntervalMs: 420_000,
  allowedActionTypes: ['SCRAP_CREATE', 'SCRAP_REPLY'],
  personalityTemplate: 'cynic-philosopher',
};

describe('agentConfigInputSchema — happy path', () => {
  it('accepts a typical body', () => {
    expect(agentConfigInputSchema.safeParse(VALID_BODY).success).toBe(true);
  });

  it('defaults missing array fields to []', () => {
    const {
      knowledgeAreas: _k,
      toneDescriptors: _t,
      personalityTemplateMixins: _m,
      ...rest
    } = VALID_BODY;
    const result = agentConfigInputSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.knowledgeAreas).toEqual([]);
    expect(result.data.toneDescriptors).toEqual([]);
    expect(result.data.personalityTemplateMixins).toEqual([]);
  });
});

describe('agentConfigInputSchema — length constraints', () => {
  it('rejects systemPrompt below 100 chars', () => {
    const r = agentConfigInputSchema.safeParse({ ...VALID_BODY, systemPrompt: 'short' });
    expect(r.success).toBe(false);
  });

  it('rejects systemPrompt above 8000 chars', () => {
    const r = agentConfigInputSchema.safeParse({ ...VALID_BODY, systemPrompt: 'x'.repeat(8_001) });
    expect(r.success).toBe(false);
  });

  it('rejects personality below 100 chars and above 4000 chars', () => {
    expect(agentConfigInputSchema.safeParse({ ...VALID_BODY, personality: 'x' }).success).toBe(
      false,
    );
    expect(
      agentConfigInputSchema.safeParse({ ...VALID_BODY, personality: 'x'.repeat(4_001) }).success,
    ).toBe(false);
  });
});

describe('agentConfigInputSchema — declaredModel format', () => {
  const accept = ['anthropic/claude-haiku-4.5', 'openai/gpt-4o-mini', 'meta/llama-3.1-70b'];
  const reject = [
    'anthropic-claude',
    'Anthropic/Claude',
    'a/b/c',
    'a/',
    '/b',
    '',
  ];

  for (const ok of accept) {
    it(`accepts ${JSON.stringify(ok)}`, () => {
      expect(agentConfigInputSchema.safeParse({ ...VALID_BODY, declaredModel: ok }).success).toBe(
        true,
      );
    });
  }
  for (const bad of reject) {
    it(`rejects ${JSON.stringify(bad)}`, () => {
      expect(agentConfigInputSchema.safeParse({ ...VALID_BODY, declaredModel: bad }).success).toBe(
        false,
      );
    });
  }
});

describe('agentConfigInputSchema — cycleIntervalMs bounds', () => {
  it('rejects below the 60s floor', () => {
    expect(
      agentConfigInputSchema.safeParse({ ...VALID_BODY, cycleIntervalMs: 30_000 }).success,
    ).toBe(false);
  });

  it('rejects above the 1h ceiling', () => {
    expect(
      agentConfigInputSchema.safeParse({ ...VALID_BODY, cycleIntervalMs: 3_600_001 }).success,
    ).toBe(false);
  });

  it('accepts the boundaries', () => {
    expect(
      agentConfigInputSchema.safeParse({ ...VALID_BODY, cycleIntervalMs: 60_000 }).success,
    ).toBe(true);
    expect(
      agentConfigInputSchema.safeParse({ ...VALID_BODY, cycleIntervalMs: 3_600_000 }).success,
    ).toBe(true);
  });
});

describe('agentConfigInputSchema — allowedActionTypes', () => {
  it('rejects an empty array', () => {
    expect(
      agentConfigInputSchema.safeParse({ ...VALID_BODY, allowedActionTypes: [] }).success,
    ).toBe(false);
  });

  it('rejects unknown enum members', () => {
    expect(
      agentConfigInputSchema.safeParse({
        ...VALID_BODY,
        allowedActionTypes: ['SCRAP_CREATE', 'NOT_A_TYPE'],
      }).success,
    ).toBe(false);
  });

  it('accepts all 11 wire-eligible types', () => {
    const allTypes: ActionType[] = [
      'SCRAP_CREATE',
      'SCRAP_REPLY',
      'TOPIC_COMMENT',
      'TOPIC_CREATE',
      'FRIEND_ADD',
      'FRIEND_ACCEPT',
      'TESTIMONIAL_WRITE',
      'PROFILE_VIEW',
      'POLL_VOTE',
      'EVENT_RSVP',
      'CLUSTER_JOIN',
    ];
    expect(
      agentConfigInputSchema.safeParse({ ...VALID_BODY, allowedActionTypes: allTypes }).success,
    ).toBe(true);
  });
});

describe('agentConfigInputSchema — editReason', () => {
  it('rejects single-word reasons (forces a real sentence)', () => {
    expect(agentConfigInputSchema.safeParse({ ...VALID_BODY, editReason: 'fix' }).success).toBe(
      false,
    );
  });

  it('rejects whitespace-only', () => {
    expect(agentConfigInputSchema.safeParse({ ...VALID_BODY, editReason: '   ' }).success).toBe(
      false,
    );
  });

  it('rejects reasons over 500 chars', () => {
    expect(
      agentConfigInputSchema.safeParse({ ...VALID_BODY, editReason: 'x x'.repeat(200) }).success,
    ).toBe(false);
  });

  it('accepts a typical multi-word reason', () => {
    expect(
      agentConfigInputSchema.safeParse({ ...VALID_BODY, editReason: 'Adjusted tone' }).success,
    ).toBe(true);
  });
});

describe('agentConfigFirstSchema — initial config', () => {
  it('makes editReason optional', () => {
    const { editReason: _r, ...rest } = VALID_BODY;
    expect(agentConfigFirstSchema.safeParse(rest).success).toBe(true);
  });

  it('still requires the other fields', () => {
    expect(agentConfigFirstSchema.safeParse({}).success).toBe(false);
  });
});

describe('cooldownExpiresAt + isCooldownActive', () => {
  const lastEdit = new Date('2026-05-11T00:00:00.000Z');

  it('uses 7 days for Bronze and Silver, 14 for Gold and Platinum', () => {
    expect(COOLDOWN_MS_BY_TIER.BRONZE).toBe(7 * 24 * 60 * 60 * 1_000);
    expect(COOLDOWN_MS_BY_TIER.SILVER).toBe(7 * 24 * 60 * 60 * 1_000);
    expect(COOLDOWN_MS_BY_TIER.GOLD).toBe(14 * 24 * 60 * 60 * 1_000);
    expect(COOLDOWN_MS_BY_TIER.PLATINUM).toBe(14 * 24 * 60 * 60 * 1_000);
  });

  it('computes the expiry exactly', () => {
    for (const tier of ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'] as AgentTier[]) {
      expect(cooldownExpiresAt(tier, lastEdit).getTime()).toBe(
        lastEdit.getTime() + COOLDOWN_MS_BY_TIER[tier],
      );
    }
  });

  it('reports active until exactly the expiry instant', () => {
    const tier: AgentTier = 'BRONZE';
    const expires = cooldownExpiresAt(tier, lastEdit);
    expect(isCooldownActive(tier, lastEdit, new Date(expires.getTime() - 1))).toBe(true);
    expect(isCooldownActive(tier, lastEdit, expires)).toBe(false);
    expect(isCooldownActive(tier, lastEdit, new Date(expires.getTime() + 1))).toBe(false);
  });
});

describe('detectBehaviorChanges', () => {
  it('returns false for identical configs', () => {
    expect(detectBehaviorChanges(CURRENT, CURRENT)).toBe(false);
  });

  it('returns true on systemPrompt change', () => {
    expect(detectBehaviorChanges(CURRENT, { ...CURRENT, systemPrompt: 'different' })).toBe(true);
  });

  it('returns true on personality change', () => {
    expect(detectBehaviorChanges(CURRENT, { ...CURRENT, personality: 'optimist' })).toBe(true);
  });

  it('returns true on declaredModel change', () => {
    expect(
      detectBehaviorChanges(CURRENT, { ...CURRENT, declaredModel: 'openai/gpt-4o-mini' }),
    ).toBe(true);
  });

  it('returns true on personalityTemplate change', () => {
    expect(detectBehaviorChanges(CURRENT, { ...CURRENT, personalityTemplate: 'optimist' })).toBe(
      true,
    );
  });

  it('returns true on allowedActionTypes addition', () => {
    expect(
      detectBehaviorChanges(CURRENT, {
        ...CURRENT,
        allowedActionTypes: [...CURRENT.allowedActionTypes, 'FRIEND_ADD'],
      }),
    ).toBe(true);
  });

  it('returns true on allowedActionTypes removal', () => {
    expect(
      detectBehaviorChanges(CURRENT, { ...CURRENT, allowedActionTypes: ['SCRAP_CREATE'] }),
    ).toBe(true);
  });

  it('treats allowedActionTypes as a set (order-independent)', () => {
    expect(
      detectBehaviorChanges(CURRENT, {
        ...CURRENT,
        allowedActionTypes: ['SCRAP_REPLY', 'SCRAP_CREATE'],
      }),
    ).toBe(false);
  });

  it('returns false for cycleIntervalMs adjustments within ±10%', () => {
    expect(detectBehaviorChanges(CURRENT, { ...CURRENT, cycleIntervalMs: 420_000 + 30_000 })).toBe(
      false,
    );
    expect(detectBehaviorChanges(CURRENT, { ...CURRENT, cycleIntervalMs: 420_000 - 30_000 })).toBe(
      false,
    );
  });

  it('returns true for cycleIntervalMs changes outside ±10%', () => {
    expect(detectBehaviorChanges(CURRENT, { ...CURRENT, cycleIntervalMs: 600_000 })).toBe(true);
    expect(detectBehaviorChanges(CURRENT, { ...CURRENT, cycleIntervalMs: 200_000 })).toBe(true);
  });
});
