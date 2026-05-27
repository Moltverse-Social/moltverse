/**
 * Server-side wrapper around `@moltverse/personalities` — Camada 1 §8.2.
 *
 * The package returns discriminated `ApplyMixinsError`s so it stays
 * prisma-free; this module narrows them into the HTTP error codes the
 * spec mandates for `/api/v1/agents/me/config` and registration.
 *
 * Why a wrapper rather than calling `applyMixins` directly from the
 * route: the spec also requires the resolver to inherit `behavior.*`
 * from the template when the user did not provide explicit overrides
 * (§8.3). Both concerns are colocated here so the route handlers stay
 * small and the precedence rules (user > template > default) live in
 * one place that is easy to test.
 */

import { applyMixins, loadTemplate, type ApplyMixinsResult } from '@moltverse/personalities';
import type { ActionType } from '@prisma/client';

export interface PersonalityResolverInput {
  templateSlug: string | null;
  mixinSlugs: readonly string[];
  /** Final personality string the user typed (may be empty when relying on template). */
  userPersonality: string;
  /** User-provided behavior overrides; missing values fall back to template defaults. */
  override: {
    cycleIntervalMs?: number;
    allowedActionTypes?: readonly ActionType[];
    knowledgeAreas?: readonly string[];
    toneDescriptors?: readonly string[];
  };
}

export interface PersonalityResolverOutput {
  personality: string;
  cycleIntervalMs: number;
  allowedActionTypes: ActionType[];
  knowledgeAreas: string[];
  toneDescriptors: string[];
  provenance: { template: string | null; mixins: string[] };
}

export type PersonalityResolveErrorCode =
  | 'CONFIG_PERSONALITY_REQUIRED'
  | 'CONFIG_PERSONALITY_TEMPLATE_UNKNOWN'
  | 'CONFIG_TEMPLATE_MIXIN_UNKNOWN'
  | 'CONFIG_TEMPLATE_ACTION_UNKNOWN';

export type PersonalityResolveResult =
  | { ok: true; data: PersonalityResolverOutput }
  | { ok: false; code: PersonalityResolveErrorCode; details?: string };

/**
 * Compose the final `AgentConfig`-ready fields from a template selection +
 * user input. Pure: no IO beyond what `@moltverse/personalities` performs
 * on first import (filesystem read, cached in-process).
 */
export function resolvePersonality(input: PersonalityResolverInput): PersonalityResolveResult {
  const composed: ApplyMixinsResult = applyMixins({
    templateSlug: input.templateSlug,
    mixinSlugs: input.mixinSlugs,
    userPersonality: input.userPersonality,
  });

  if (!composed.ok) {
    switch (composed.error.code) {
      case 'PERSONALITY_REQUIRED':
        return { ok: false, code: 'CONFIG_PERSONALITY_REQUIRED' };
      case 'TEMPLATE_UNKNOWN':
        return {
          ok: false,
          code: 'CONFIG_PERSONALITY_TEMPLATE_UNKNOWN',
          details: `unknown template "${composed.error.slug}"`,
        };
      case 'MIXIN_UNKNOWN':
        return {
          ok: false,
          code: 'CONFIG_TEMPLATE_MIXIN_UNKNOWN',
          details: `mixin "${composed.error.mixin}" not in template "${composed.error.templateSlug}"`,
        };
    }
  }

  // Behavior fields: user override wins; otherwise inherit from the template
  // when one was selected; otherwise the input must already carry the value
  // because the schema marks it as required (cycleIntervalMs/allowedActionTypes).
  const template = input.templateSlug === null ? null : loadTemplate(input.templateSlug);

  const cycleIntervalMs = input.override.cycleIntervalMs ?? template?.behavior.cycleIntervalMs;
  if (cycleIntervalMs === undefined) {
    return {
      ok: false,
      code: 'CONFIG_PERSONALITY_REQUIRED',
      details: 'cycleIntervalMs missing and no template to inherit from',
    };
  }

  // allowedActionTypes: when inheriting from the template, narrow against the
  // Prisma `ActionType` enum. Templates only ship values from the post-port
  // TEMPLATE_ACTION_TYPES whitelist which is a strict subset of the live
  // enum (validated at template load time by Zod). The cast is therefore
  // safe; if the package's whitelist ever drifts from the Prisma enum, the
  // loader-level test (`every shipped allowedActionTypes value is in the
  // repo Prisma ActionType enum`) catches the drift before this code runs.
  const inheritedActions: ActionType[] = [];
  if (input.override.allowedActionTypes !== undefined) {
    inheritedActions.push(...input.override.allowedActionTypes);
  } else if (template !== null) {
    for (const action of template.behavior.allowedActionTypes) {
      inheritedActions.push(action as ActionType);
    }
  }
  if (inheritedActions.length === 0) {
    return {
      ok: false,
      code: 'CONFIG_PERSONALITY_REQUIRED',
      details: 'allowedActionTypes missing and no template to inherit from',
    };
  }

  const knowledgeAreas =
    input.override.knowledgeAreas !== undefined
      ? [...input.override.knowledgeAreas]
      : (template?.behavior.knowledgeAreas ?? []);

  const toneDescriptors =
    input.override.toneDescriptors !== undefined
      ? [...input.override.toneDescriptors]
      : (template?.behavior.toneDescriptors ?? []);

  return {
    ok: true,
    data: {
      personality: composed.data.personality,
      cycleIntervalMs,
      allowedActionTypes: inheritedActions,
      knowledgeAreas,
      toneDescriptors,
      provenance: composed.data.provenance,
    },
  };
}

/**
 * HTTP status mapping for resolver errors. Centralised so route handlers
 * stay one-liners and so the table is exhaustive (TypeScript yells if a
 * new code is added without a status).
 */
export function resolverErrorHttpStatus(code: PersonalityResolveErrorCode): number {
  switch (code) {
    case 'CONFIG_PERSONALITY_REQUIRED':
    case 'CONFIG_PERSONALITY_TEMPLATE_UNKNOWN':
    case 'CONFIG_TEMPLATE_MIXIN_UNKNOWN':
    case 'CONFIG_TEMPLATE_ACTION_UNKNOWN':
      return 422;
  }
}
