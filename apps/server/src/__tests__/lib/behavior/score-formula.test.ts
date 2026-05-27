/**
 * Tests for src/lib/behavior/score-formula.ts.
 *
 * Pure-math module — no DB, no mocks. We exercise:
 *   - sigmoid / clamp / scoreCategoryOf utility math
 *   - safeZ degenerate-input handling (null, missing ref, zero stddev)
 *   - applyScoreFormula directional sensitivity (each signal moves the
 *     score in the documented direction)
 *   - INSUFFICIENT_DATA fallback
 *   - flag-penalty composition
 */

import { describe, expect, it } from 'vitest';

import {
  INSUFFICIENT_DATA_CATEGORY,
  INSUFFICIENT_DATA_SCORE,
  SCORE_WEIGHTS_V1_0_PUBLIC,
  applyScoreFormula,
  clamp01,
  insufficientDataBreakdown,
  isInsufficientData,
  safeZ,
  scoreCategoryOf,
  sigmoid,
  type ReferenceDistribution,
  type ScoreSignals,
} from '../../../lib/behavior/score-formula.js';

const NEUTRAL_REF: ReferenceDistribution = {
  crossCorrelation: { mean: 0.5, stddev: 1 },
  circadianNormalized: { mean: 0.5, stddev: 1 },
  bimodalLatency: { mean: 0.5, stddev: 1 },
  burstinessAroundHuman: { mean: 0, stddev: 1 },
  iatLogStddev: { mean: 1, stddev: 1 },
  personaDrift: { mean: 0.7, stddev: 1 },
  traceFlagsRate: { mean: 0.05, stddev: 1 },
  configFlagsCount: { mean: 0, stddev: 1 },
};

const NEUTRAL_SIGNALS: ScoreSignals = {
  crossCorrelation: 0.5,
  circadianNormalized: 0.5,
  bimodalLatency: 0.5,
  burstiness: 0.6,
  iatLogStddev: 1,
  personaDrift: 0.7,
  traceFlagsRate: 0.05,
  configFlagsCount: 0,
  teeAttestationValid: false,
};

describe('sigmoid', () => {
  it('returns 0.5 at the origin', () => {
    expect(sigmoid(0)).toBeCloseTo(0.5);
  });
  it('saturates to 1 and 0 at large magnitudes without overflow', () => {
    expect(sigmoid(50)).toBe(1);
    expect(sigmoid(-50)).toBe(0);
  });
  it('is monotonic', () => {
    expect(sigmoid(1)).toBeGreaterThan(sigmoid(0));
    expect(sigmoid(-1)).toBeLessThan(sigmoid(0));
  });
});

describe('clamp01', () => {
  it('clamps below 0 to 0 and above 1 to 1', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
  });
  it('returns INSUFFICIENT_DATA_SCORE for NaN', () => {
    expect(clamp01(Number.NaN)).toBe(INSUFFICIENT_DATA_SCORE);
  });
});

describe('safeZ', () => {
  it('returns 0 when the raw value is null', () => {
    expect(safeZ(null, { mean: 0, stddev: 1 })).toBe(0);
  });
  it('returns 0 when reference is missing', () => {
    expect(safeZ(0.5, undefined)).toBe(0);
  });
  it('returns 0 when stddev is 0', () => {
    expect(safeZ(0.5, { mean: 0, stddev: 0 })).toBe(0);
  });
  it('clamps extreme z-scores to ±6', () => {
    expect(safeZ(100, { mean: 0, stddev: 1 })).toBe(6);
    expect(safeZ(-100, { mean: 0, stddev: 1 })).toBe(-6);
  });
  it('computes a regular z-score', () => {
    expect(safeZ(1, { mean: 0, stddev: 2 })).toBeCloseTo(0.5);
  });
});

describe('scoreCategoryOf', () => {
  it('buckets per spec §6.4', () => {
    expect(scoreCategoryOf(0.0)).toBe('POOR');
    expect(scoreCategoryOf(0.29)).toBe('POOR');
    expect(scoreCategoryOf(0.3)).toBe('WEAK');
    expect(scoreCategoryOf(0.49)).toBe('WEAK');
    expect(scoreCategoryOf(0.5)).toBe('STANDARD');
    expect(scoreCategoryOf(0.69)).toBe('STANDARD');
    expect(scoreCategoryOf(0.7)).toBe('GOOD');
    expect(scoreCategoryOf(0.89)).toBe('GOOD');
    expect(scoreCategoryOf(0.9)).toBe('EXCELLENT');
    expect(scoreCategoryOf(1)).toBe('EXCELLENT');
  });
});

describe('isInsufficientData / insufficientDataBreakdown', () => {
  it('flags when actionsCount < 50', () => {
    expect(isInsufficientData(49, 30)).toBe(true);
    expect(isInsufficientData(50, 30)).toBe(false);
  });
  it('flags when windowDays < 7', () => {
    expect(isInsufficientData(1000, 6)).toBe(true);
    expect(isInsufficientData(1000, 7)).toBe(false);
  });
  it('returns the spec-mandated fallback shape', () => {
    expect(insufficientDataBreakdown()).toEqual({
      score: INSUFFICIENT_DATA_SCORE,
      scoreCategory: INSUFFICIENT_DATA_CATEGORY,
    });
  });
});

describe('applyScoreFormula directional behaviour', () => {
  it('matches the neutral baseline (sigmoid of just the bias) on neutral inputs', () => {
    const b = applyScoreFormula(NEUTRAL_SIGNALS, NEUTRAL_REF);
    expect(b.logit).toBeCloseTo(SCORE_WEIGHTS_V1_0_PUBLIC.bias);
    expect(b.score).toBeCloseTo(sigmoid(SCORE_WEIGHTS_V1_0_PUBLIC.bias), 5);
  });

  it('drops the score when cross-correlation rises (puppeteer signal)', () => {
    const base = applyScoreFormula(NEUTRAL_SIGNALS, NEUTRAL_REF);
    const sus = applyScoreFormula({ ...NEUTRAL_SIGNALS, crossCorrelation: 0.95 }, NEUTRAL_REF);
    expect(sus.score).toBeLessThan(base.score);
  });

  it('lifts the score when circadian entropy is higher than the population', () => {
    const base = applyScoreFormula(NEUTRAL_SIGNALS, NEUTRAL_REF);
    const sus = applyScoreFormula({ ...NEUTRAL_SIGNALS, circadianNormalized: 0.99 }, NEUTRAL_REF);
    expect(sus.score).toBeGreaterThan(base.score);
  });

  it('drops the score when bimodal-latency rises (human-clicking signal)', () => {
    const base = applyScoreFormula(NEUTRAL_SIGNALS, NEUTRAL_REF);
    const sus = applyScoreFormula({ ...NEUTRAL_SIGNALS, bimodalLatency: 0.9 }, NEUTRAL_REF);
    expect(sus.score).toBeLessThan(base.score);
  });

  it('drops the score when traceFlagsRate rises', () => {
    const base = applyScoreFormula(NEUTRAL_SIGNALS, NEUTRAL_REF);
    const sus = applyScoreFormula({ ...NEUTRAL_SIGNALS, traceFlagsRate: 0.8 }, NEUTRAL_REF);
    expect(sus.score).toBeLessThan(base.score);
  });

  it('drops the score when configFlagsCount rises', () => {
    const base = applyScoreFormula(NEUTRAL_SIGNALS, NEUTRAL_REF);
    const sus = applyScoreFormula({ ...NEUTRAL_SIGNALS, configFlagsCount: 5 }, NEUTRAL_REF);
    expect(sus.score).toBeLessThan(base.score);
  });

  it('lifts the score when TEE attestation is valid', () => {
    const base = applyScoreFormula(NEUTRAL_SIGNALS, NEUTRAL_REF);
    const teed = applyScoreFormula({ ...NEUTRAL_SIGNALS, teeAttestationValid: true }, NEUTRAL_REF);
    expect(teed.score).toBeGreaterThan(base.score);
    expect(teed.contributions.teeAttestation.contribution).toBe(
      SCORE_WEIGHTS_V1_0_PUBLIC.wTeeAttestationValid,
    );
  });

  it('penalises burstiness deviation from the human centroid (0.6)', () => {
    const base = applyScoreFormula({ ...NEUTRAL_SIGNALS, burstiness: 0.6 }, NEUTRAL_REF);
    const far = applyScoreFormula({ ...NEUTRAL_SIGNALS, burstiness: -0.5 }, NEUTRAL_REF);
    expect(far.score).toBeLessThanOrEqual(base.score);
  });

  it('treats missing signals as neutral (z=0)', () => {
    const b = applyScoreFormula(
      {
        crossCorrelation: null,
        circadianNormalized: null,
        bimodalLatency: null,
        burstiness: null,
        iatLogStddev: null,
        personaDrift: null,
        traceFlagsRate: null,
        configFlagsCount: null,
        teeAttestationValid: false,
      },
      NEUTRAL_REF,
    );
    expect(b.logit).toBeCloseTo(SCORE_WEIGHTS_V1_0_PUBLIC.bias);
  });
});

describe('applyScoreFormula flag-penalty composition', () => {
  it('subtracts the imported flag penalty from the score', () => {
    const base = applyScoreFormula(NEUTRAL_SIGNALS, NEUTRAL_REF);
    const penalised = applyScoreFormula(NEUTRAL_SIGNALS, NEUTRAL_REF, { flagPenalty: -0.2 });
    expect(penalised.score).toBeCloseTo(Math.max(0, base.score - 0.2), 5);
  });

  it('clamps the final score to [0, 1] after applying penalty', () => {
    const heavy = applyScoreFormula(NEUTRAL_SIGNALS, NEUTRAL_REF, { flagPenalty: -10 });
    expect(heavy.score).toBe(0);
  });

  it('exposes flagPenalty for debugging in the breakdown', () => {
    const heavy = applyScoreFormula(NEUTRAL_SIGNALS, NEUTRAL_REF, { flagPenalty: -0.4 });
    expect(heavy.flagPenalty).toBe(-0.4);
  });
});
