/**
 * Score formula — Camada 3 §6.
 *
 * Takes already-computed signal values + the active population reference
 * distribution + flag penalties and returns a final score in [0, 1] plus
 * a categorical bucket plus a per-feature contribution breakdown.
 *
 * Pure: no DB, no env reads, no Date. The orchestrator (`scorer.ts`) reads
 * everything and hands it here. That lets us unit-test every branch of
 * the formula without spinning a DB up.
 *
 * Weights stay in this file *only* until the private scoring package
 * lands (spec §6.2 wants them gitignored). For now they are exported
 * with `_PUBLIC` suffix so callers acknowledge the temporary location.
 *
 * Z-score normalisation against the reference distribution: when stddev
 * is zero or missing for a feature we treat that feature as neutral
 * (z = 0). Same when a signal is missing entirely — better silently
 * neutral than crash the scorer over a degenerate input.
 */

import type { ScoreCategory } from '@prisma/client';

/** Numeric inputs to the formula. Each may be null when the signal could
 *  not be computed (no samples, missing dependency, …) — null is treated
 *  as neutral via z = 0. */
export interface ScoreSignals {
  crossCorrelation: number | null;
  circadianNormalized: number | null;
  bimodalLatency: number | null;
  burstiness: number | null;
  iatLogStddev: number | null;
  personaDrift: number | null;
  /** Fraction of recent traces marked FLAGGED by the LLM judge (Camada 2). */
  traceFlagsRate: number | null;
  /** Count of unresolved Camada 1 config-anomaly flags. */
  configFlagsCount: number | null;
  /** Spec §7.3 — bonus added directly to the logit when TEE-attested. */
  teeAttestationValid: boolean;
}

/** Per-feature `(mean, stddev)` used for z-score normalisation. Each
 *  member is optional so a freshly-bootstrapped reference can omit
 *  features that haven't been observed yet — they just collapse to z=0. */
export interface ReferenceFeature {
  mean: number;
  stddev: number;
}
export interface ReferenceDistribution {
  crossCorrelation?: ReferenceFeature;
  circadianNormalized?: ReferenceFeature;
  bimodalLatency?: ReferenceFeature;
  burstinessAroundHuman?: ReferenceFeature;
  iatLogStddev?: ReferenceFeature;
  personaDrift?: ReferenceFeature;
  traceFlagsRate?: ReferenceFeature;
  configFlagsCount?: ReferenceFeature;
}

/** Spec §6.2 — public placeholder. Real values will move into the
 *  private scoring package when it lands. */
export const SCORE_WEIGHTS_V1_0_PUBLIC = {
  bias: 0.5,
  wCrossCorr: 1.8,
  wCircadian: 0.8,
  wBimodalLatency: 1.2,
  wBurstinessHuman: 0.6,
  wPersonaDrift: 0.7,
  wTraceFlagRate: 1.5,
  wConfigFlags: 0.4,
  wTeeAttestationValid: 0.5,
} as const;

export type ScoreWeights = typeof SCORE_WEIGHTS_V1_0_PUBLIC;

export interface FeatureContribution {
  /** Raw feature value (or null when signal unavailable). */
  raw: number | null;
  /** Z-score against the reference, clamped to [-6, 6] to bound outliers. */
  z: number;
  /** Signed contribution added to the logit (sign already applied per
   *  the formula in spec §6.1). */
  contribution: number;
}

export interface ScoreBreakdown {
  /** Logit value before sigmoid (no flag penalty applied). */
  logit: number;
  /** Sigmoid output (no flag penalty applied). */
  sigmoid: number;
  /** Sum of penalties from imported flags (negative number). */
  flagPenalty: number;
  /** Final score = clamp(sigmoid + flagPenalty, 0, 1). */
  score: number;
  scoreCategory: ScoreCategory;
  contributions: Record<keyof ReferenceDistribution | 'teeAttestation', FeatureContribution>;
}

export const INSUFFICIENT_DATA_SCORE = 0.55;
export const INSUFFICIENT_DATA_CATEGORY: ScoreCategory = 'STANDARD';

export function isInsufficientData(actionsCount: number, windowDays: number): boolean {
  return actionsCount < 50 || windowDays < 7;
}

/** Logistic / sigmoid. Pure scalar math. */
export function sigmoid(x: number): number {
  // Guard against fp overflow at the extremes (|x| > ~37 over- or
  // under-flows exp on doubles). The semantic answer at those magnitudes
  // is "1" / "0" — clamp.
  if (x > 37) return 1;
  if (x < -37) return 0;
  return 1 / (1 + Math.exp(-x));
}

export function clamp01(x: number): number {
  if (Number.isNaN(x)) return INSUFFICIENT_DATA_SCORE;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/** Z = (x - mean) / stddev. Returns 0 when signal is null OR reference
 *  is missing OR stddev <= 0. Always clamps to ±6 so single outliers
 *  cannot dominate the logit. */
export function safeZ(value: number | null, ref: ReferenceFeature | undefined): number {
  if (value === null || ref === undefined) return 0;
  if (!Number.isFinite(value) || !Number.isFinite(ref.stddev) || ref.stddev <= 0) return 0;
  const z = (value - ref.mean) / ref.stddev;
  if (z > 6) return 6;
  if (z < -6) return -6;
  return z;
}

export function scoreCategoryOf(score: number): ScoreCategory {
  if (score < 0.3) return 'POOR';
  if (score < 0.5) return 'WEAK';
  if (score < 0.7) return 'STANDARD';
  if (score < 0.9) return 'GOOD';
  return 'EXCELLENT';
}

// Burstiness handling: spec §6.1 wants `z(burstiness, 0.6)` — distance
// from 0.6 (the "human-like" target). Negative when *closer* to 0.6,
// so the weighted contribution is subtracted from the logit.
const HUMAN_BURSTINESS_CENTROID = 0.6;

function burstinessAroundHumanValue(raw: number | null): number | null {
  if (raw === null) return null;
  return Math.abs(raw - HUMAN_BURSTINESS_CENTROID);
}

export interface ApplyScoreOptions {
  weights?: ScoreWeights;
  /** Total penalty (sum of per-flag penalties, expected negative). */
  flagPenalty?: number;
}

/**
 * Apply the spec §6.1 ensemble formula and produce a normalised score
 * + breakdown. Pure with respect to its arguments.
 */
export function applyScoreFormula(
  signals: ScoreSignals,
  reference: ReferenceDistribution,
  options: ApplyScoreOptions = {},
): ScoreBreakdown {
  const w = options.weights ?? SCORE_WEIGHTS_V1_0_PUBLIC;
  const flagPenalty = options.flagPenalty ?? 0;

  const burstinessRaw = burstinessAroundHumanValue(signals.burstiness);

  const contribs: Record<keyof ReferenceDistribution | 'teeAttestation', FeatureContribution> = {
    crossCorrelation: zContribution(
      signals.crossCorrelation,
      reference.crossCorrelation,
      -w.wCrossCorr,
    ),
    circadianNormalized: zContribution(
      signals.circadianNormalized,
      reference.circadianNormalized,
      w.wCircadian,
    ),
    bimodalLatency: zContribution(
      signals.bimodalLatency,
      reference.bimodalLatency,
      -w.wBimodalLatency,
    ),
    burstinessAroundHuman: zContribution(
      burstinessRaw,
      reference.burstinessAroundHuman,
      -w.wBurstinessHuman,
    ),
    iatLogStddev: zContribution(signals.iatLogStddev, reference.iatLogStddev, 0),
    personaDrift: zContribution(signals.personaDrift, reference.personaDrift, w.wPersonaDrift),
    traceFlagsRate: zContribution(
      signals.traceFlagsRate,
      reference.traceFlagsRate,
      -w.wTraceFlagRate,
    ),
    configFlagsCount: zContribution(
      signals.configFlagsCount,
      reference.configFlagsCount,
      -w.wConfigFlags,
    ),
    teeAttestation: {
      raw: signals.teeAttestationValid ? 1 : 0,
      z: signals.teeAttestationValid ? 1 : 0,
      contribution: signals.teeAttestationValid ? w.wTeeAttestationValid : 0,
    },
  };

  const logit =
    w.bias +
    contribs.crossCorrelation.contribution +
    contribs.circadianNormalized.contribution +
    contribs.bimodalLatency.contribution +
    contribs.burstinessAroundHuman.contribution +
    contribs.iatLogStddev.contribution +
    contribs.personaDrift.contribution +
    contribs.traceFlagsRate.contribution +
    contribs.configFlagsCount.contribution +
    contribs.teeAttestation.contribution;

  const sig = sigmoid(logit);
  const score = clamp01(sig + flagPenalty);

  return {
    logit,
    sigmoid: sig,
    flagPenalty,
    score,
    scoreCategory: scoreCategoryOf(score),
    contributions: contribs,
  };
}

function zContribution(
  raw: number | null,
  ref: ReferenceFeature | undefined,
  signedWeight: number,
): FeatureContribution {
  const z = safeZ(raw, ref);
  return { raw, z, contribution: z * signedWeight };
}

export function insufficientDataBreakdown(): Pick<ScoreBreakdown, 'score' | 'scoreCategory'> {
  return {
    score: INSUFFICIENT_DATA_SCORE,
    scoreCategory: INSUFFICIENT_DATA_CATEGORY,
  };
}
