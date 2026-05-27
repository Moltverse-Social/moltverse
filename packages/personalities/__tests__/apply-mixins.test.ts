import { describe, expect, it } from 'vitest';

import { applyMixins } from '../src/apply-mixins.js';
import { _setTemplatesDirForTesting } from '../src/loader.js';

// Use the shipped catalogue so we exercise the same templates the server
// will use in production.
_setTemplatesDirForTesting(null);

describe('applyMixins', () => {
  it('returns user personality verbatim when no template is selected', () => {
    const result = applyMixins({
      templateSlug: null,
      mixinSlugs: [],
      userPersonality: 'I am Rune. I write at night and forget the names of streets.',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.personality).toMatch(/^I am Rune/);
    expect(result.data.provenance.template).toBeNull();
    expect(result.data.provenance.mixins).toEqual([]);
  });

  it('errors PERSONALITY_REQUIRED when neither template nor user personality given', () => {
    const result = applyMixins({
      templateSlug: null,
      mixinSlugs: [],
      userPersonality: '',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('PERSONALITY_REQUIRED');
  });

  it('errors TEMPLATE_UNKNOWN for an unknown slug', () => {
    const result = applyMixins({
      templateSlug: 'no-such-template',
      mixinSlugs: [],
      userPersonality: '',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('TEMPLATE_UNKNOWN');
  });

  it('errors MIXIN_UNKNOWN for a mixin that is not in the template', () => {
    const result = applyMixins({
      templateSlug: 'cynic-philosopher',
      mixinSlugs: ['not-a-real-mixin'],
      userPersonality: '',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MIXIN_UNKNOWN');
  });

  it('composes template + mixins with deterministic alphabetic ordering', () => {
    const a = applyMixins({
      templateSlug: 'cynic-philosopher',
      mixinSlugs: ['nostalgic', 'witty'],
      userPersonality: '',
    });
    const b = applyMixins({
      templateSlug: 'cynic-philosopher',
      mixinSlugs: ['witty', 'nostalgic'],
      userPersonality: '',
    });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    // Order of input array does not affect composed text.
    expect(a.data.personality).toBe(b.data.personality);
    expect(a.data.provenance.mixins).toEqual(['nostalgic', 'witty']);
    // Mixin headers appear in alphabetic order.
    expect(a.data.personality.indexOf('--- MIXIN: nostalgic ---')).toBeLessThan(
      a.data.personality.indexOf('--- MIXIN: witty ---'),
    );
  });

  it('appends user additions after template + mixins', () => {
    const result = applyMixins({
      templateSlug: 'cynic-philosopher',
      mixinSlugs: ['witty'],
      userPersonality: 'My one private addition: I always carry sugar cubes.',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const composed = result.data.personality;
    const userIdx = composed.indexOf('--- USER ADDITIONS ---');
    const mixinIdx = composed.indexOf('--- MIXIN: witty ---');
    expect(userIdx).toBeGreaterThan(mixinIdx);
    expect(composed).toContain('I always carry sugar cubes');
  });

  it('treats whitespace-only user additions as empty', () => {
    const result = applyMixins({
      templateSlug: 'cynic-philosopher',
      mixinSlugs: [],
      userPersonality: '   \n\t  ',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.personality).not.toContain('USER ADDITIONS');
  });
});
