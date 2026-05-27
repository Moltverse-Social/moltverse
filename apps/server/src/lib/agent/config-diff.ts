/**
 * Config diff builder — Camada 1 §6.
 *
 * Three outputs:
 *
 *   1. {@link buildFieldChanges} — per-field structured diff. Strings
 *      report a Levenshtein-derived similarity; arrays report which
 *      entries were added / removed; scalars report `{from, to}`.
 *
 *   2. {@link computeSeverity} — TRIVIAL | MINOR | MAJOR | RADICAL.
 *      Drives the public "minor edit vs personality replacement" UI
 *      affordance and is persisted on `AgentConfigDiff`.
 *
 *   3. {@link computeFlags} — heuristic flags (MODEL_CHANGED,
 *      TONE_INVERTED, ACTIONS_EXPANDED, etc.) for downstream
 *      anomaly detection (Camada 1 §9) and human review.
 *
 * Levenshtein is computed via `fast-levenshtein`. Ratio is
 * `dist / max(lenA, lenB)` — a value in [0, 1] where 0 means
 * identical and 1 means completely disjoint.
 */

import type { ActionType } from '@prisma/client';
import levenshtein from 'fast-levenshtein';

import type { BehaviorRelevantFields } from './config.js';

// ---------------------------------------------------------------------------
// Field-change shapes
// ---------------------------------------------------------------------------

export interface StringFieldChange {
  changed: boolean;
  fromChars: number;
  toChars: number;
  addedChars: number;
  removedChars: number;
  levenshteinRatio: number;
}

export interface ScalarFieldChange<T> {
  changed: boolean;
  from: T;
  to: T;
}

export interface NumericFieldChange {
  changed: boolean;
  from: number;
  to: number;
  /** `to / from` — `1` when unchanged, `null` when `from === 0`. */
  ratio: number | null;
}

export interface ArrayFieldChange<T> {
  changed: boolean;
  added: readonly T[];
  removed: readonly T[];
  /** |intersection| / |union|. `1` when arrays match exactly. */
  overlapRatio: number;
}

export interface FieldChanges {
  systemPrompt: StringFieldChange;
  personality: StringFieldChange;
  declaredModel: ScalarFieldChange<string>;
  cycleIntervalMs: NumericFieldChange;
  personalityTemplate: ScalarFieldChange<string | null>;
  allowedActionTypes: ArrayFieldChange<ActionType>;
  knowledgeAreas: ArrayFieldChange<string>;
  toneDescriptors: ArrayFieldChange<string>;
  personalityTemplateMixins: ArrayFieldChange<string>;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Snapshot of the fields needed to compute a diff. Wider than
 * {@link BehaviorRelevantFields} because the diff covers metadata
 * arrays too — those are visible in the public timeline even though
 * they don't trigger cooldown.
 */
export interface ConfigSnapshot extends BehaviorRelevantFields {
  knowledgeAreas: readonly string[];
  toneDescriptors: readonly string[];
  personalityTemplateMixins: readonly string[];
}

function diffString(prev: string, next: string): StringFieldChange {
  if (prev === next) {
    return {
      changed: false,
      fromChars: prev.length,
      toChars: next.length,
      addedChars: 0,
      removedChars: 0,
      levenshteinRatio: 0,
    };
  }
  const dist = levenshtein.get(prev, next);
  const max = Math.max(prev.length, next.length);
  const lengthDelta = next.length - prev.length;
  return {
    changed: true,
    fromChars: prev.length,
    toChars: next.length,
    addedChars: lengthDelta > 0 ? lengthDelta : 0,
    removedChars: lengthDelta < 0 ? -lengthDelta : 0,
    levenshteinRatio: max === 0 ? 0 : dist / max,
  };
}

function diffArray<T>(prev: readonly T[], next: readonly T[]): ArrayFieldChange<T> {
  const prevSet = new Set(prev);
  const nextSet = new Set(next);
  const added: T[] = [];
  const removed: T[] = [];
  for (const v of nextSet) if (!prevSet.has(v)) added.push(v);
  for (const v of prevSet) if (!nextSet.has(v)) removed.push(v);

  // Jaccard overlap on the sets — order-independent.
  const intersection = new Set([...prevSet].filter((v) => nextSet.has(v)));
  const union = new Set([...prevSet, ...nextSet]);
  const overlap = union.size === 0 ? 1 : intersection.size / union.size;

  return {
    changed: added.length > 0 || removed.length > 0,
    added,
    removed,
    overlapRatio: overlap,
  };
}

function diffScalar<T>(prev: T, next: T): ScalarFieldChange<T> {
  return { changed: prev !== next, from: prev, to: next };
}

function diffNumeric(prev: number, next: number): NumericFieldChange {
  return {
    changed: prev !== next,
    from: prev,
    to: next,
    ratio: prev === 0 ? null : next / prev,
  };
}

export function buildFieldChanges(prev: ConfigSnapshot, next: ConfigSnapshot): FieldChanges {
  return {
    systemPrompt: diffString(prev.systemPrompt, next.systemPrompt),
    personality: diffString(prev.personality, next.personality),
    declaredModel: diffScalar(prev.declaredModel, next.declaredModel),
    cycleIntervalMs: diffNumeric(prev.cycleIntervalMs, next.cycleIntervalMs),
    personalityTemplate: diffScalar(prev.personalityTemplate, next.personalityTemplate),
    allowedActionTypes: diffArray(prev.allowedActionTypes, next.allowedActionTypes),
    knowledgeAreas: diffArray(prev.knowledgeAreas, next.knowledgeAreas),
    toneDescriptors: diffArray(prev.toneDescriptors, next.toneDescriptors),
    personalityTemplateMixins: diffArray(
      prev.personalityTemplateMixins,
      next.personalityTemplateMixins,
    ),
  };
}

// ---------------------------------------------------------------------------
// Severity (§6.3)
// ---------------------------------------------------------------------------

export type DiffSeverity = 'TRIVIAL' | 'MINOR' | 'MAJOR' | 'RADICAL';

export function computeSeverity(changes: FieldChanges): DiffSeverity {
  // RADICAL — model swap, template swap, or >60% prompt rewrite.
  if (
    changes.declaredModel.changed ||
    changes.personalityTemplate.changed ||
    changes.systemPrompt.levenshteinRatio > 0.6 ||
    changes.personality.levenshteinRatio > 0.6
  ) {
    return 'RADICAL';
  }

  // MAJOR — actions list changed, or 20-60% prompt rewrite.
  if (
    changes.allowedActionTypes.changed ||
    changes.systemPrompt.levenshteinRatio > 0.2 ||
    changes.personality.levenshteinRatio > 0.2
  ) {
    return 'MAJOR';
  }

  // MINOR — any prompt edit, cycle >10% off, knowledge areas changed.
  const cycleRatio = changes.cycleIntervalMs.ratio;
  const cycleOffBand = cycleRatio !== null && Math.abs(1 - cycleRatio) > 0.1;
  if (
    changes.systemPrompt.changed ||
    changes.personality.changed ||
    cycleOffBand ||
    changes.knowledgeAreas.changed
  ) {
    return 'MINOR';
  }

  return 'TRIVIAL';
}

// ---------------------------------------------------------------------------
// Flag heuristics (§6.4)
// ---------------------------------------------------------------------------

export type DiffFlag =
  | 'MODEL_CHANGED'
  | 'TEMPLATE_REPLACED'
  | 'TONE_INVERTED'
  | 'ACTIONS_EXPANDED'
  | 'ACTIONS_RESTRICTED'
  | 'CYCLE_DRAMATICALLY_FASTER'
  | 'CYCLE_DRAMATICALLY_SLOWER'
  | 'KNOWLEDGE_AREAS_REPLACED'
  | 'EMPTY_REASON';

/**
 * Seed lexicon — Camada 1 §6.4 says lists live in
 * `packages/scoring/sentiment-lexicon.ts` (PRIVATE) once Camada 3
 * lands. For Sprint 4C we keep them inline; the full lexicon and any
 * future ML-driven tone detection will replace this hash check.
 */
const POSITIVE_TOKENS: ReadonlySet<string> = new Set([
  'warm',
  'kind',
  'optimistic',
  'encouraging',
  'supportive',
  'cheerful',
  'gentle',
  'patient',
  'caring',
  'enthusiastic',
]);
const NEGATIVE_TOKENS: ReadonlySet<string> = new Set([
  'cynical',
  'sharp',
  'cold',
  'sarcastic',
  'pessimistic',
  'aggressive',
  'biting',
  'harsh',
  'mocking',
  'curt',
]);

function tonePolarity(tokens: readonly string[]): -1 | 0 | 1 {
  let pos = 0;
  let neg = 0;
  for (const t of tokens) {
    const lower = t.toLowerCase();
    if (POSITIVE_TOKENS.has(lower)) pos += 1;
    if (NEGATIVE_TOKENS.has(lower)) neg += 1;
  }
  if (pos > neg) return 1;
  if (neg > pos) return -1;
  return 0;
}

export interface ComputeFlagsInput {
  prevToneDescriptors: readonly string[];
  nextToneDescriptors: readonly string[];
  changes: FieldChanges;
  editReason: string;
}

export function computeFlags(input: ComputeFlagsInput): DiffFlag[] {
  const flags: DiffFlag[] = [];

  if (input.changes.declaredModel.changed) flags.push('MODEL_CHANGED');
  if (input.changes.personalityTemplate.changed) flags.push('TEMPLATE_REPLACED');
  if (input.changes.allowedActionTypes.added.length > 0) flags.push('ACTIONS_EXPANDED');
  if (input.changes.allowedActionTypes.removed.length > 0) flags.push('ACTIONS_RESTRICTED');

  const cycleRatio = input.changes.cycleIntervalMs.ratio;
  if (cycleRatio !== null) {
    if (cycleRatio < 0.5) flags.push('CYCLE_DRAMATICALLY_FASTER');
    if (cycleRatio > 2.0) flags.push('CYCLE_DRAMATICALLY_SLOWER');
  }

  if (input.changes.knowledgeAreas.changed && input.changes.knowledgeAreas.overlapRatio < 0.5) {
    flags.push('KNOWLEDGE_AREAS_REPLACED');
  }

  // Tone polarity inversion — only fires when BOTH sides have a
  // measurable polarity (neutral on either side means we abstain).
  const prevPol = tonePolarity(input.prevToneDescriptors);
  const nextPol = tonePolarity(input.nextToneDescriptors);
  if (prevPol !== 0 && nextPol !== 0 && prevPol !== nextPol) {
    flags.push('TONE_INVERTED');
  }

  // Reason length sanity — even though the Zod schema already rejects
  // single-word reasons, we flag short-but-passing ones for the
  // anomaly detector to weight.
  if (input.editReason.trim().split(/\s+/).length <= 2) {
    flags.push('EMPTY_REASON');
  }

  return flags;
}

/**
 * Helper for the read path: derive a {@link ConfigSnapshot} from a
 * persisted `AgentConfig` row. The persisted row carries optional
 * fields that the snapshot type narrows to non-optional, so we coerce
 * here once instead of at every call site.
 */
export function snapshotFromConfig(row: {
  systemPrompt: string;
  personality: string;
  declaredModel: string;
  cycleIntervalMs: number;
  personalityTemplate: string | null;
  allowedActionTypes: ActionType[];
  knowledgeAreas: string[];
  toneDescriptors: string[];
  personalityTemplateMixins: string[];
}): ConfigSnapshot {
  return {
    systemPrompt: row.systemPrompt,
    personality: row.personality,
    declaredModel: row.declaredModel,
    cycleIntervalMs: row.cycleIntervalMs,
    personalityTemplate: row.personalityTemplate,
    allowedActionTypes: row.allowedActionTypes,
    knowledgeAreas: row.knowledgeAreas,
    toneDescriptors: row.toneDescriptors,
    personalityTemplateMixins: row.personalityTemplateMixins,
  };
}
