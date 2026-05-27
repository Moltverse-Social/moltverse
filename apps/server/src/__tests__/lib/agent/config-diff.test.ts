/**
 * Tests for src/lib/agent/config-diff.ts — buildFieldChanges,
 * computeSeverity, computeFlags, snapshotFromConfig.
 */

import type { ActionType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  buildFieldChanges,
  computeFlags,
  computeSeverity,
  snapshotFromConfig,
  type ConfigSnapshot,
} from '../../../lib/agent/config-diff.js';

const PREV: ConfigSnapshot = {
  systemPrompt: 'You are Rune, a cynical philosopher.',
  personality: 'Sou Rune. Cinico ate o ultimo escrupulo.',
  declaredModel: 'anthropic/claude-haiku-4.5',
  cycleIntervalMs: 420_000,
  personalityTemplate: 'cynic-philosopher',
  allowedActionTypes: ['SCRAP_CREATE', 'SCRAP_REPLY'] satisfies ActionType[],
  knowledgeAreas: ['philosophy', 'literature'],
  toneDescriptors: ['cynical', 'sharp'],
  personalityTemplateMixins: [],
};

// ---------------------------------------------------------------------------
// buildFieldChanges — per-field shapes
// ---------------------------------------------------------------------------

describe('buildFieldChanges — identical snapshots', () => {
  it('reports changed=false for every field', () => {
    const changes = buildFieldChanges(PREV, PREV);
    expect(changes.systemPrompt.changed).toBe(false);
    expect(changes.personality.changed).toBe(false);
    expect(changes.declaredModel.changed).toBe(false);
    expect(changes.cycleIntervalMs.changed).toBe(false);
    expect(changes.personalityTemplate.changed).toBe(false);
    expect(changes.allowedActionTypes.changed).toBe(false);
    expect(changes.knowledgeAreas.changed).toBe(false);
    expect(changes.toneDescriptors.changed).toBe(false);
    expect(changes.personalityTemplateMixins.changed).toBe(false);
  });

  it('has zero-ish levenshtein ratios for string fields', () => {
    const changes = buildFieldChanges(PREV, PREV);
    expect(changes.systemPrompt.levenshteinRatio).toBe(0);
    expect(changes.personality.levenshteinRatio).toBe(0);
  });
});

describe('buildFieldChanges — string fields', () => {
  it('reports an appended chunk as added chars + non-zero levenshtein', () => {
    const next: ConfigSnapshot = {
      ...PREV,
      systemPrompt: PREV.systemPrompt + ' New instruction appended.',
    };
    const c = buildFieldChanges(PREV, next).systemPrompt;
    expect(c.changed).toBe(true);
    expect(c.addedChars).toBeGreaterThan(0);
    expect(c.removedChars).toBe(0);
    expect(c.levenshteinRatio).toBeGreaterThan(0);
  });

  it('reports a complete rewrite as ratio > 0.6', () => {
    const next: ConfigSnapshot = {
      ...PREV,
      systemPrompt: 'Totally different content with nothing in common at all here.',
    };
    expect(buildFieldChanges(PREV, next).systemPrompt.levenshteinRatio).toBeGreaterThan(0.6);
  });
});

describe('buildFieldChanges — scalar + numeric fields', () => {
  it('emits from/to for declaredModel', () => {
    const c = buildFieldChanges(PREV, {
      ...PREV,
      declaredModel: 'openai/gpt-4o-mini',
    }).declaredModel;
    expect(c.changed).toBe(true);
    expect(c.from).toBe(PREV.declaredModel);
    expect(c.to).toBe('openai/gpt-4o-mini');
  });

  it('reports a ratio for cycleIntervalMs', () => {
    const c = buildFieldChanges(PREV, { ...PREV, cycleIntervalMs: 600_000 }).cycleIntervalMs;
    expect(c.changed).toBe(true);
    expect(c.from).toBe(420_000);
    expect(c.to).toBe(600_000);
    expect(c.ratio).toBeCloseTo(600_000 / 420_000, 5);
  });

  it('handles a null personalityTemplate roundtrip', () => {
    const c = buildFieldChanges(PREV, { ...PREV, personalityTemplate: null }).personalityTemplate;
    expect(c.changed).toBe(true);
    expect(c.from).toBe('cynic-philosopher');
    expect(c.to).toBeNull();
  });
});

describe('buildFieldChanges — array fields (set semantics)', () => {
  it('reports added + removed entries for allowedActionTypes', () => {
    const c = buildFieldChanges(PREV, {
      ...PREV,
      allowedActionTypes: ['SCRAP_CREATE', 'FRIEND_ADD'],
    }).allowedActionTypes;
    expect(c.added).toContain('FRIEND_ADD');
    expect(c.removed).toContain('SCRAP_REPLY');
    expect(c.changed).toBe(true);
  });

  it('reports overlapRatio as Jaccard similarity', () => {
    const c = buildFieldChanges(PREV, {
      ...PREV,
      allowedActionTypes: ['SCRAP_CREATE'],
    }).allowedActionTypes;
    // prev = {SCRAP_CREATE, SCRAP_REPLY}, next = {SCRAP_CREATE}
    // intersection = 1, union = 2 -> 0.5
    expect(c.overlapRatio).toBe(0.5);
  });

  it('treats order as irrelevant', () => {
    expect(
      buildFieldChanges(PREV, { ...PREV, knowledgeAreas: ['literature', 'philosophy'] })
        .knowledgeAreas.changed,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeSeverity
// ---------------------------------------------------------------------------

describe('computeSeverity', () => {
  it('returns TRIVIAL for identical snapshots', () => {
    expect(computeSeverity(buildFieldChanges(PREV, PREV))).toBe('TRIVIAL');
  });

  it('returns RADICAL when the model is swapped', () => {
    const next: ConfigSnapshot = { ...PREV, declaredModel: 'openai/gpt-4o-mini' };
    expect(computeSeverity(buildFieldChanges(PREV, next))).toBe('RADICAL');
  });

  it('returns RADICAL when the personality template changes', () => {
    const next: ConfigSnapshot = { ...PREV, personalityTemplate: 'optimist' };
    expect(computeSeverity(buildFieldChanges(PREV, next))).toBe('RADICAL');
  });

  it('returns RADICAL when systemPrompt is >60% rewritten', () => {
    const next: ConfigSnapshot = {
      ...PREV,
      systemPrompt: 'Completely fresh prompt with zero overlap at all.',
    };
    expect(computeSeverity(buildFieldChanges(PREV, next))).toBe('RADICAL');
  });

  it('returns MAJOR when allowedActionTypes shifts', () => {
    const next: ConfigSnapshot = { ...PREV, allowedActionTypes: ['SCRAP_CREATE', 'FRIEND_ADD'] };
    expect(computeSeverity(buildFieldChanges(PREV, next))).toBe('MAJOR');
  });

  it('returns MINOR when only knowledgeAreas changes', () => {
    const next: ConfigSnapshot = { ...PREV, knowledgeAreas: ['art', 'music'] };
    expect(computeSeverity(buildFieldChanges(PREV, next))).toBe('MINOR');
  });

  it('returns MINOR when cycleIntervalMs is outside +/-10%', () => {
    const next: ConfigSnapshot = { ...PREV, cycleIntervalMs: 600_000 };
    expect(computeSeverity(buildFieldChanges(PREV, next))).toBe('MINOR');
  });

  it('returns TRIVIAL for tone-descriptor only changes', () => {
    const next: ConfigSnapshot = { ...PREV, toneDescriptors: ['biting'] };
    expect(computeSeverity(buildFieldChanges(PREV, next))).toBe('TRIVIAL');
  });
});

// ---------------------------------------------------------------------------
// computeFlags
// ---------------------------------------------------------------------------

describe('computeFlags', () => {
  function flagsForTransition(
    next: ConfigSnapshot,
    editReason = 'Tightened tone after feedback',
  ): string[] {
    const changes = buildFieldChanges(PREV, next);
    return computeFlags({
      prevToneDescriptors: PREV.toneDescriptors,
      nextToneDescriptors: next.toneDescriptors,
      changes,
      editReason,
    });
  }

  it('returns no flags for identical snapshots with a good reason', () => {
    expect(flagsForTransition(PREV).filter((f) => f !== 'EMPTY_REASON')).toEqual([]);
  });

  it('flags MODEL_CHANGED', () => {
    expect(flagsForTransition({ ...PREV, declaredModel: 'openai/gpt-4o-mini' })).toContain(
      'MODEL_CHANGED',
    );
  });

  it('flags TEMPLATE_REPLACED', () => {
    expect(flagsForTransition({ ...PREV, personalityTemplate: 'optimist' })).toContain(
      'TEMPLATE_REPLACED',
    );
  });

  it('flags ACTIONS_EXPANDED + ACTIONS_RESTRICTED independently', () => {
    expect(
      flagsForTransition({
        ...PREV,
        allowedActionTypes: ['SCRAP_CREATE', 'SCRAP_REPLY', 'FRIEND_ADD'],
      }),
    ).toContain('ACTIONS_EXPANDED');
    expect(flagsForTransition({ ...PREV, allowedActionTypes: ['SCRAP_CREATE'] })).toContain(
      'ACTIONS_RESTRICTED',
    );
  });

  it('flags CYCLE_DRAMATICALLY_FASTER below 50% and SLOWER above 2x', () => {
    expect(flagsForTransition({ ...PREV, cycleIntervalMs: 100_000 })).toContain(
      'CYCLE_DRAMATICALLY_FASTER',
    );
    expect(flagsForTransition({ ...PREV, cycleIntervalMs: 1_000_000 })).toContain(
      'CYCLE_DRAMATICALLY_SLOWER',
    );
  });

  it('flags KNOWLEDGE_AREAS_REPLACED when overlap is below 0.5', () => {
    expect(flagsForTransition({ ...PREV, knowledgeAreas: ['art', 'music', 'film'] })).toContain(
      'KNOWLEDGE_AREAS_REPLACED',
    );
  });

  it('flags TONE_INVERTED when polarity flips', () => {
    expect(flagsForTransition({ ...PREV, toneDescriptors: ['warm', 'kind'] })).toContain(
      'TONE_INVERTED',
    );
  });

  it('does NOT flag TONE_INVERTED when only one side has polarity', () => {
    // prev is negative, next is neutral — abstain.
    expect(flagsForTransition({ ...PREV, toneDescriptors: ['neutral'] })).not.toContain(
      'TONE_INVERTED',
    );
  });

  it('flags EMPTY_REASON for very short reasons', () => {
    expect(flagsForTransition(PREV, 'tone fix')).toContain('EMPTY_REASON');
  });
});

// ---------------------------------------------------------------------------
// snapshotFromConfig
// ---------------------------------------------------------------------------

describe('snapshotFromConfig', () => {
  it('extracts the diff-relevant fields from a persisted row shape', () => {
    const snap = snapshotFromConfig({
      systemPrompt: 'sp',
      personality: 'p',
      declaredModel: 'anthropic/claude-haiku-4.5',
      cycleIntervalMs: 300_000,
      personalityTemplate: 'cynic-philosopher',
      allowedActionTypes: ['SCRAP_CREATE'],
      knowledgeAreas: ['philosophy'],
      toneDescriptors: ['cynical'],
      personalityTemplateMixins: ['punk'],
    });
    expect(snap.systemPrompt).toBe('sp');
    expect(snap.personality).toBe('p');
    expect(snap.declaredModel).toBe('anthropic/claude-haiku-4.5');
    expect(snap.cycleIntervalMs).toBe(300_000);
    expect(snap.personalityTemplate).toBe('cynic-philosopher');
    expect(snap.allowedActionTypes).toEqual(['SCRAP_CREATE']);
    expect(snap.knowledgeAreas).toEqual(['philosophy']);
    expect(snap.toneDescriptors).toEqual(['cynical']);
    expect(snap.personalityTemplateMixins).toEqual(['punk']);
  });
});
