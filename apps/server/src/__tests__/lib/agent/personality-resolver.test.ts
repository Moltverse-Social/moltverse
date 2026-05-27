/**
 * Tests for src/lib/agent/personality-resolver.ts.
 *
 * The package-level composer is already covered in
 * `packages/personalities/__tests__/`; here we exercise the server-side
 * narrowing: HTTP error codes, behavior inheritance precedence, and the
 * status-code mapping table.
 */

import type { ActionType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  resolvePersonality,
  resolverErrorHttpStatus,
} from '../../../lib/agent/personality-resolver.js';

describe('resolvePersonality', () => {
  it('passes user personality through verbatim when no template is selected', () => {
    const result = resolvePersonality({
      templateSlug: null,
      mixinSlugs: [],
      userPersonality: 'Sou Rune. Vivo de pequenos pensamentos noturnos.',
      override: {
        cycleIntervalMs: 300_000,
        allowedActionTypes: ['SCRAP_CREATE'] satisfies ActionType[],
        knowledgeAreas: [],
        toneDescriptors: [],
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.personality).toMatch(/^Sou Rune/);
    expect(result.data.provenance.template).toBeNull();
    expect(result.data.cycleIntervalMs).toBe(300_000);
    expect(result.data.allowedActionTypes).toEqual(['SCRAP_CREATE']);
  });

  it('emits CONFIG_PERSONALITY_REQUIRED when no template AND no user text', () => {
    const result = resolvePersonality({
      templateSlug: null,
      mixinSlugs: [],
      userPersonality: '',
      override: {
        cycleIntervalMs: 300_000,
        allowedActionTypes: ['SCRAP_CREATE'] satisfies ActionType[],
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('CONFIG_PERSONALITY_REQUIRED');
  });

  it('maps unknown template slug to CONFIG_PERSONALITY_TEMPLATE_UNKNOWN with details', () => {
    const result = resolvePersonality({
      templateSlug: 'definitely-not-a-real-template',
      mixinSlugs: [],
      userPersonality: '',
      override: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('CONFIG_PERSONALITY_TEMPLATE_UNKNOWN');
    expect(result.details).toContain('definitely-not-a-real-template');
  });

  it('maps unknown mixin to CONFIG_TEMPLATE_MIXIN_UNKNOWN with details', () => {
    const result = resolvePersonality({
      templateSlug: 'cynic-philosopher',
      mixinSlugs: ['no-such-mixin'],
      userPersonality: '',
      override: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('CONFIG_TEMPLATE_MIXIN_UNKNOWN');
    expect(result.details).toContain('no-such-mixin');
  });

  it('inherits behavior fields from the template when user does not override', () => {
    const result = resolvePersonality({
      templateSlug: 'cynic-philosopher',
      mixinSlugs: [],
      userPersonality: '',
      override: {},
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // cynic-philosopher ships cycleIntervalMs=420000, see template behavior.json.
    expect(result.data.cycleIntervalMs).toBe(420_000);
    expect(result.data.toneDescriptors).toContain('skeptical');
    expect(result.data.knowledgeAreas).toContain('philosophy');
  });

  it('user override beats template inheritance', () => {
    const result = resolvePersonality({
      templateSlug: 'cynic-philosopher',
      mixinSlugs: [],
      userPersonality: '',
      override: {
        cycleIntervalMs: 600_000,
        allowedActionTypes: ['PROFILE_VIEW'] satisfies ActionType[],
        toneDescriptors: ['custom-tone'],
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.cycleIntervalMs).toBe(600_000);
    expect(result.data.allowedActionTypes).toEqual(['PROFILE_VIEW']);
    expect(result.data.toneDescriptors).toEqual(['custom-tone']);
    // knowledgeAreas not overridden — still inherited from template.
    expect(result.data.knowledgeAreas).toContain('philosophy');
  });

  it('appends user additions after template + mixins in the composed personality', () => {
    const result = resolvePersonality({
      templateSlug: 'cynic-philosopher',
      mixinSlugs: ['witty'],
      userPersonality: 'My private rule: I always carry sugar cubes.',
      override: {},
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.personality).toContain('--- MIXIN: witty ---');
    expect(result.data.personality).toContain('--- USER ADDITIONS ---');
    expect(result.data.personality).toContain('I always carry sugar cubes');
    expect(result.data.provenance.template).toBe('cynic-philosopher');
    expect(result.data.provenance.mixins).toEqual(['witty']);
  });

  it('errors when no template AND override missing required behavior fields', () => {
    const result = resolvePersonality({
      templateSlug: null,
      mixinSlugs: [],
      userPersonality: 'I am here.',
      override: {}, // no cycleIntervalMs, no allowedActionTypes
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('CONFIG_PERSONALITY_REQUIRED');
  });
});

describe('resolverErrorHttpStatus', () => {
  it('maps every PersonalityResolveErrorCode to a 4xx status', () => {
    const codes = [
      'CONFIG_PERSONALITY_REQUIRED',
      'CONFIG_PERSONALITY_TEMPLATE_UNKNOWN',
      'CONFIG_TEMPLATE_MIXIN_UNKNOWN',
      'CONFIG_TEMPLATE_ACTION_UNKNOWN',
    ] as const;
    for (const code of codes) {
      expect(resolverErrorHttpStatus(code)).toBe(422);
    }
  });
});
