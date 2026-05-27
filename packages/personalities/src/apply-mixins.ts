/**
 * Personality composition — Camada 1 §8.2.
 *
 * The composer is intentionally a pure function over the loaded template
 * data so the server can call it inside the JCS-hashing pipeline without
 * any IO. Mixin slugs are sorted alphabetically before being applied so
 * the resulting hash is independent of array order in the user's input —
 * critical for `CONFIG_NO_CHANGE` detection across edits.
 */

import { loadTemplate } from './loader.js';
import type { ComposedPersonality, PersonalityTemplate } from './types.js';

export type ApplyMixinsError =
  | { code: 'TEMPLATE_UNKNOWN'; slug: string }
  | { code: 'MIXIN_UNKNOWN'; mixin: string; templateSlug: string }
  | { code: 'PERSONALITY_REQUIRED' };

export type ApplyMixinsResult =
  | { ok: true; data: ComposedPersonality }
  | { ok: false; error: ApplyMixinsError };

/**
 * Compose a final personality string from a template + mixin selection +
 * optional user-authored extras. See spec §8.2 for the algorithm.
 *
 * Both `mixinSlugs` and `userPersonality` are optional. If `templateSlug`
 * is null the function passes the user-authored personality through
 * verbatim (still required by Camada 1 §4.3 — surfaced as
 * `PERSONALITY_REQUIRED` here so callers can map to the right HTTP code).
 */
export function applyMixins(input: {
  templateSlug: string | null;
  mixinSlugs: readonly string[];
  userPersonality: string | null | undefined;
}): ApplyMixinsResult {
  const userText = input.userPersonality?.trim() ?? '';

  if (input.templateSlug === null) {
    if (userText === '') {
      return { ok: false, error: { code: 'PERSONALITY_REQUIRED' } };
    }
    return {
      ok: true,
      data: { personality: userText, provenance: { template: null, mixins: [] } },
    };
  }

  const template = loadTemplate(input.templateSlug);
  if (template === null) {
    return { ok: false, error: { code: 'TEMPLATE_UNKNOWN', slug: input.templateSlug } };
  }

  for (const m of input.mixinSlugs) {
    if (!(m in template.mixins)) {
      return {
        ok: false,
        error: { code: 'MIXIN_UNKNOWN', mixin: m, templateSlug: input.templateSlug },
      };
    }
  }

  const sortedMixins = [...input.mixinSlugs].sort();
  const composed = composeText(template, sortedMixins, userText);

  return {
    ok: true,
    data: {
      personality: composed,
      provenance: { template: input.templateSlug, mixins: sortedMixins },
    },
  };
}

function composeText(
  template: PersonalityTemplate,
  sortedMixins: readonly string[],
  userText: string,
): string {
  const parts: string[] = [template.personality.trim()];
  for (const m of sortedMixins) {
    const mixin = template.mixins[m];
    if (mixin === undefined) continue;
    parts.push(`--- MIXIN: ${m} ---`, mixin.content.trim());
  }
  if (userText !== '') {
    parts.push('--- USER ADDITIONS ---', userText);
  }
  return parts.join('\n\n');
}
