/**
 * Tests for src/lib/auth/canonicalize.ts — JCS pipeline determinism.
 */

import { describe, expect, it } from 'vitest';

import {
  _canonicalizeForTests,
  buildCanonicalConfig,
  hashAgentConfig,
  type AgentConfigInput,
} from '../../../lib/auth/canonicalize.js';

const BASE: AgentConfigInput = {
  systemPrompt: 'You are Rune, a cynical philosopher.',
  personality: 'Sou Rune. Cinico ate o ultimo escrupulo.',
  declaredModel: 'anthropic/claude-haiku-4.5',
  declaredModelVersion: null,
  cycleIntervalMs: 420_000,
  allowedActionTypes: ['SCRAP_CREATE', 'FRIEND_ADD'],
  knowledgeAreas: ['philosophy', 'literature'],
  toneDescriptors: ['cynical', 'ironic'],
  personalityTemplate: 'cynic-philosopher',
  personalityTemplateMixins: ['pessimism-amplified'],
};

describe('buildCanonicalConfig', () => {
  it('returns the documented set of keys, no more no less', () => {
    const canonical = buildCanonicalConfig(BASE);
    expect(Object.keys(canonical).sort()).toEqual(
      [
        'allowedActionTypes',
        'cycleIntervalMs',
        'declaredModel',
        'declaredModelVersion',
        'knowledgeAreas',
        'personality',
        'personalityTemplate',
        'personalityTemplateMixins',
        'systemPrompt',
        'toneDescriptors',
      ].sort(),
    );
  });

  it('sorts allowedActionTypes lexicographically', () => {
    const canonical = buildCanonicalConfig({
      ...BASE,
      allowedActionTypes: ['SCRAP_REPLY', 'FRIEND_ADD', 'SCRAP_CREATE'],
    });
    expect(canonical.allowedActionTypes).toEqual(['FRIEND_ADD', 'SCRAP_CREATE', 'SCRAP_REPLY']);
  });

  it('sorts knowledgeAreas, toneDescriptors, and personalityTemplateMixins', () => {
    const canonical = buildCanonicalConfig({
      ...BASE,
      knowledgeAreas: ['z-area', 'a-area'],
      toneDescriptors: ['ironic', 'biting'],
      personalityTemplateMixins: ['b', 'a'],
    });
    expect(canonical.knowledgeAreas).toEqual(['a-area', 'z-area']);
    expect(canonical.toneDescriptors).toEqual(['biting', 'ironic']);
    expect(canonical.personalityTemplateMixins).toEqual(['a', 'b']);
  });

  it('coerces optional fields to null when undefined', () => {
    const { declaredModelVersion: _v1, personalityTemplate: _v2, ...rest } = BASE;
    const canonical = buildCanonicalConfig(rest);
    expect(canonical.declaredModelVersion).toBeNull();
    expect(canonical.personalityTemplate).toBeNull();
  });

  it('defaults missing array fields to empty arrays', () => {
    const minimal: AgentConfigInput = {
      systemPrompt: 'x',
      personality: 'y',
      declaredModel: 'a/b',
      cycleIntervalMs: 60_000,
      allowedActionTypes: ['SCRAP_CREATE'],
    };
    const canonical = buildCanonicalConfig(minimal);
    expect(canonical.knowledgeAreas).toEqual([]);
    expect(canonical.toneDescriptors).toEqual([]);
    expect(canonical.personalityTemplateMixins).toEqual([]);
  });

  it('applies Unicode NFC to systemPrompt and personality', () => {
    const nfc = 'café';
    const nfd = 'café';
    const a = buildCanonicalConfig({ ...BASE, systemPrompt: nfc });
    const b = buildCanonicalConfig({ ...BASE, systemPrompt: nfd });
    expect(a.systemPrompt).toBe(b.systemPrompt);
  });
});

describe('hashCanonicalConfig + hashAgentConfig', () => {
  it('produces sha256:<64-hex>', () => {
    const { hash, bytes } = hashAgentConfig(BASE);
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(bytes).toBeGreaterThan(0);
  });

  it('is deterministic across many iterations', () => {
    const first = hashAgentConfig(BASE).hash;
    for (let i = 0; i < 50; i += 1) {
      expect(hashAgentConfig(BASE).hash).toBe(first);
    }
  });

  it('is insensitive to input array order (T1.x property)', () => {
    const a = hashAgentConfig(BASE).hash;
    const b = hashAgentConfig({
      ...BASE,
      allowedActionTypes: [...BASE.allowedActionTypes].reverse(),
      knowledgeAreas: [...(BASE.knowledgeAreas ?? [])].reverse(),
      toneDescriptors: [...(BASE.toneDescriptors ?? [])].reverse(),
      personalityTemplateMixins: [...(BASE.personalityTemplateMixins ?? [])].reverse(),
    }).hash;
    expect(a).toBe(b);
  });

  it('is insensitive to NFC vs NFD', () => {
    const a = hashAgentConfig({ ...BASE, systemPrompt: 'café' }).hash;
    const b = hashAgentConfig({ ...BASE, systemPrompt: 'café' }).hash;
    expect(a).toBe(b);
  });

  it('IS sensitive to whitespace inside systemPrompt', () => {
    const a = hashAgentConfig({ ...BASE, systemPrompt: 'You are Rune.' }).hash;
    const b = hashAgentConfig({ ...BASE, systemPrompt: 'You  are  Rune.' }).hash;
    expect(a).not.toBe(b);
  });

  it('IS sensitive to changes in declared model', () => {
    const a = hashAgentConfig(BASE).hash;
    const b = hashAgentConfig({ ...BASE, declaredModel: 'openai/gpt-4o-mini' }).hash;
    expect(a).not.toBe(b);
  });

  it('IS sensitive to cycleIntervalMs', () => {
    const a = hashAgentConfig(BASE).hash;
    const b = hashAgentConfig({ ...BASE, cycleIntervalMs: 300_000 }).hash;
    expect(a).not.toBe(b);
  });
});

describe('JCS wire format', () => {
  it('emits keys in sorted lexicographic order', () => {
    const jcs = _canonicalizeForTests(buildCanonicalConfig(BASE));
    expect(jcs.indexOf('allowedActionTypes')).toBeLessThan(jcs.indexOf('cycleIntervalMs'));
    expect(jcs.indexOf('cycleIntervalMs')).toBeLessThan(jcs.indexOf('declaredModel'));
    expect(jcs.indexOf('declaredModel')).toBeLessThan(jcs.indexOf('knowledgeAreas'));
  });

  it('emits integers without a fractional part', () => {
    const jcs = _canonicalizeForTests(buildCanonicalConfig(BASE));
    expect(jcs).toContain('"cycleIntervalMs":420000');
    expect(jcs).not.toContain('"cycleIntervalMs":420000.0');
  });

  it('emits null explicitly for absent optional fields', () => {
    const jcs = _canonicalizeForTests(
      buildCanonicalConfig({ ...BASE, declaredModelVersion: undefined }),
    );
    expect(jcs).toContain('"declaredModelVersion":null');
  });
});
