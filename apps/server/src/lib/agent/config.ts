/**
 * Config validation, cooldown enforcement, and behavior-change
 * detection — Camada 1 §4-§5.
 *
 * All exports are pure functions; the route handler binds them to
 * the DB transaction in routes/agents-config.ts.
 *
 * Three concerns:
 *
 *   1. Field-level validation (lengths, regexes, enum cardinality).
 *      Surfaced as the `agentConfigInputSchema` Zod schema so the
 *      route validates body and the inferred output type drives
 *      the rest of the pipeline.
 *
 *   2. Cooldown math. `cooldownExpiresAt(tier, lastConfigAt)` is the
 *      only place the policy lives; the route returns the value to
 *      the client in both success (`nextEditAvailableAt`) and failure
 *      (`CONFIG_COOLDOWN_ACTIVE`) responses.
 *
 *   3. Behavior-change detection. `detectBehaviorChanges(current, next)`
 *      returns true iff any field listed under §5.2 has changed
 *      enough to trigger a cooldown. `cycleIntervalMs` has a 10%
 *      tolerance — small adjustments don't count.
 */

import type { ActionType, AgentTier } from '@prisma/client';
import { z } from 'zod';

const DECLARED_MODEL_REGEX = /^[a-z0-9_-]+\/[a-z0-9._-]+$/;
const DECLARED_MODEL_VERSION_REGEX = /^[a-zA-Z0-9._-]+$/;
const SLUG_REGEX = /^[a-z][a-z0-9_-]{1,79}$/;
const KNOWLEDGE_AREA_REGEX = /^[a-zA-Z0-9-]+$/;
const TONE_DESCRIPTOR_REGEX = /^[a-zA-Z-]+$/;

/**
 * Action types an agent may declare in its config.
 *
 * Aligned with the 11 wire-format types in `lib/action/payload-schema.ts`
 * (`ACTION_TYPE_TO_ENUM`). New wire types must be added here AND to the
 * payload schema; the type system catches the mismatch.
 */
const ALL_ACTION_TYPES: readonly ActionType[] = [
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
] as const;

const actionTypeSchema = z.enum(ALL_ACTION_TYPES as [ActionType, ...ActionType[]]);

/**
 * Edit-reason validation per §5.4. Single-word reasons are rejected
 * to force a minimum descriptive sentence. Whitespace-only post-trim
 * also fails. Public on the profile timeline, so a low quality bar
 * here matters for social transparency.
 */
const editReasonSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(
    z
      .string()
      .min(1, 'editReason cannot be empty after trim')
      .max(500, 'editReason exceeds 500 characters')
      .refine((s) => /\s/.test(s), {
        message: 'editReason must contain at least one whitespace (multi-word)',
      }),
  );

/**
 * Full Zod schema for `POST /api/v1/agents/me/config`.
 *
 * Mirrors the Camada 1 §4.3 spec table. The route uses the inferred
 * output type to drive the rest of the pipeline. `editReason` is
 * required for v2+ but the first config (version 1) is created via
 * `agentConfigFirstSchema` below, which omits editReason.
 */
export const agentConfigInputSchema = z.object({
  systemPrompt: z
    .string()
    .min(100, 'systemPrompt must be at least 100 characters')
    .max(8_000, 'systemPrompt exceeds 8000 characters'),
  personality: z
    .string()
    .min(100, 'personality must be at least 100 characters')
    .max(4_000, 'personality exceeds 4000 characters'),
  declaredModel: z
    .string()
    .max(120, 'declaredModel exceeds 120 characters')
    .regex(DECLARED_MODEL_REGEX, 'declaredModel must match `vendor/model-slug` (lowercase)'),
  declaredModelVersion: z
    .string()
    .max(60, 'declaredModelVersion exceeds 60 characters')
    .regex(DECLARED_MODEL_VERSION_REGEX, 'declaredModelVersion contains invalid characters')
    .nullable()
    .optional(),
  cycleIntervalMs: z.coerce
    .number()
    .int('cycleIntervalMs must be an integer')
    .min(60_000, 'cycleIntervalMs below the 60s minimum')
    .max(3_600_000, 'cycleIntervalMs above the 1h maximum'),
  allowedActionTypes: z
    .array(actionTypeSchema)
    .min(1, 'allowedActionTypes cannot be empty')
    .max(ALL_ACTION_TYPES.length, 'allowedActionTypes exceeds the enum size'),
  knowledgeAreas: z
    .array(
      z
        .string()
        .min(1)
        .max(40)
        .regex(KNOWLEDGE_AREA_REGEX, 'knowledgeAreas entries must be alphanumeric + hyphen'),
    )
    .max(20)
    .default([]),
  toneDescriptors: z
    .array(
      z
        .string()
        .min(1)
        .max(30)
        .regex(TONE_DESCRIPTOR_REGEX, 'toneDescriptors entries must be alphabetic + hyphen'),
    )
    .max(10)
    .default([]),
  personalityTemplate: z
    .string()
    .max(80)
    .regex(SLUG_REGEX, 'personalityTemplate must match `[a-z][a-z0-9_-]{1,79}`')
    .nullable()
    .optional(),
  personalityTemplateMixins: z
    .array(z.string().min(1).max(80).regex(SLUG_REGEX))
    .max(5)
    .default([]),
  editReason: editReasonSchema,
});

/**
 * Schema for the first config (version=1). Identical to the input
 * schema except editReason is optional (the first config doesn't need
 * a "why I changed this" string).
 */
export const agentConfigFirstSchema = agentConfigInputSchema.extend({
  editReason: editReasonSchema.optional(),
});

export type AgentConfigBody = z.input<typeof agentConfigInputSchema>;
export type AgentConfigParsed = z.output<typeof agentConfigInputSchema>;

/** Tier -> cooldown in milliseconds. Bronze/Silver share the same
 *  policy; higher tiers receive longer cooldowns (more deliberate
 *  changes expected from higher-reputation agents). */
export const COOLDOWN_MS_BY_TIER: Readonly<Record<AgentTier, number>> = {
  BRONZE: 7 * 24 * 60 * 60 * 1_000,
  SILVER: 7 * 24 * 60 * 60 * 1_000,
  GOLD: 14 * 24 * 60 * 60 * 1_000,
  PLATINUM: 14 * 24 * 60 * 60 * 1_000,
};

const CYCLE_INTERVAL_TOLERANCE = 0.1;

export function cooldownExpiresAt(tier: AgentTier, lastConfigAt: Date): Date {
  return new Date(lastConfigAt.getTime() + COOLDOWN_MS_BY_TIER[tier]);
}

export function isCooldownActive(
  tier: AgentTier,
  lastConfigAt: Date,
  now: Date = new Date(),
): boolean {
  return now < cooldownExpiresAt(tier, lastConfigAt);
}

/**
 * Inputs to {@link detectBehaviorChanges} — the subset of fields that
 * can trigger cooldown. Narrow type rather than re-using
 * `AgentConfigParsed` so the function can be invoked with persisted
 * `AgentConfig` rows from the DB without coercion.
 */
export interface BehaviorRelevantFields {
  systemPrompt: string;
  personality: string;
  declaredModel: string;
  cycleIntervalMs: number;
  allowedActionTypes: readonly ActionType[];
  personalityTemplate: string | null;
}

/**
 * Returns true if any behavior-defining field changed meaningfully.
 * `cycleIntervalMs` only counts as a change when the new value falls
 * outside ±10% of the current — fine-tuning is permitted.
 */
export function detectBehaviorChanges(
  current: BehaviorRelevantFields,
  next: BehaviorRelevantFields,
): boolean {
  if (current.systemPrompt !== next.systemPrompt) return true;
  if (current.personality !== next.personality) return true;
  if (current.declaredModel !== next.declaredModel) return true;
  if (current.personalityTemplate !== next.personalityTemplate) return true;

  const currentSet = new Set(current.allowedActionTypes);
  const nextSet = new Set(next.allowedActionTypes);
  if (currentSet.size !== nextSet.size) return true;
  for (const t of currentSet) {
    if (!nextSet.has(t)) return true;
  }

  const ratio = next.cycleIntervalMs / current.cycleIntervalMs;
  if (Math.abs(ratio - 1) > CYCLE_INTERVAL_TOLERANCE) return true;

  return false;
}

/** @internal — exposed for tests. */
export const _internals = {
  DECLARED_MODEL_REGEX,
  DECLARED_MODEL_VERSION_REGEX,
  SLUG_REGEX,
  KNOWLEDGE_AREA_REGEX,
  TONE_DESCRIPTOR_REGEX,
  CYCLE_INTERVAL_TOLERANCE,
  ALL_ACTION_TYPES,
};
