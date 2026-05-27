/**
 * Behavior scorer — Camada 3 §4.7 + §7.
 *
 * Single entry point: {@link computeBehaviorScoreTier1}. It orchestrates the
 * complete vertical for one agent — pull signals, count imported flags,
 * apply the formula, persist `AgentBehaviorScore` and append to
 * `BehaviorScoreHistory`, bump `Agent.behaviorScore`. Everything happens
 * inside a single Prisma transaction so partial writes can't leak.
 *
 * Most signal/formula logic lives in sibling modules; this file just wires
 * them together.
 */

import type { Prisma, PrismaClient } from '@prisma/client';

import {
  INSUFFICIENT_DATA_CATEGORY,
  INSUFFICIENT_DATA_SCORE,
  applyScoreFormula,
  isInsufficientData,
  type ReferenceDistribution,
  type ScoreSignals,
} from './score-formula.js';
import {
  computeBurstiness,
  computeCircadianEntropy,
  computeCrossCorrelation,
  computeIatLogNormal,
  computeReactionLatency,
  DEFAULT_WINDOW_DAYS,
  MIN_REPLIES_FOR_REACTION_LATENCY,
} from './signals-tier1.js';

const SCORER_VERSION = 'v1.0-tier1';

/**
 * Spec §7.1 — imported flag penalties.
 * Map of flag → score-space penalty (NEGATIVE number). Penalties stack
 * linearly inside {@link sumFlagPenalty}; the formula then clamps the
 * final score to [0,1].
 */
export const CONFIG_FLAG_PENALTIES: Readonly<Record<string, number>> = Object.freeze({
  CONFIG_FREQUENT_RADICAL_CHANGES: -0.2,
  CONFIG_FREQUENT_MAJOR_CHANGES: -0.1,
  CONFIG_TONE_INSTABILITY: -0.12,
  CONFIG_MODEL_HOPPING: -0.08,
  CONFIG_LAZY_REASONS: -0.04,
  CONFIG_OSCILLATION: -0.18,
});

export function sumFlagPenalty(flagNames: readonly string[]): number {
  let total = 0;
  for (const f of flagNames) {
    total += CONFIG_FLAG_PENALTIES[f] ?? 0;
  }
  return total;
}

/**
 * Pre-launch reference distribution (spec §6.3).
 *
 * Hard-coded ballparks for the pre-launch period. The monthly cron
 * `score-reference-update` will replace this with population stats
 * once a real cohort exists. Mean/stddev values are eyeballed from
 * the expected ranges in §4 — they aren't load-bearing for relative
 * ranking, only for the absolute z-score magnitude.
 */
export const PRE_LAUNCH_REFERENCE: ReferenceDistribution = {
  crossCorrelation: { mean: 0.3, stddev: 0.18 },
  circadianNormalized: { mean: 0.85, stddev: 0.07 },
  bimodalLatency: { mean: 0.05, stddev: 0.1 },
  burstinessAroundHuman: { mean: 0.25, stddev: 0.18 },
  iatLogStddev: { mean: 0.9, stddev: 0.4 },
  personaDrift: { mean: 0.65, stddev: 0.1 },
  traceFlagsRate: { mean: 0.05, stddev: 0.08 },
  configFlagsCount: { mean: 0.2, stddev: 0.6 },
};

/**
 * Look up the active reference row; fall back to the hardcoded pre-launch
 * distribution when no row is active yet.
 */
export async function loadActiveReference(
  prisma: Pick<PrismaClient, 'behaviorScoreReference'>,
): Promise<ReferenceDistribution> {
  const active = await prisma.behaviorScoreReference.findFirst({
    where: { active: true },
    orderBy: { activatedAt: 'desc' },
    select: { features: true },
  });
  if (active === null) return PRE_LAUNCH_REFERENCE;

  return mergeReferenceJson(active.features, PRE_LAUNCH_REFERENCE);
}

function mergeReferenceJson(raw: unknown, fallback: ReferenceDistribution): ReferenceDistribution {
  if (typeof raw !== 'object' || raw === null) return fallback;
  const obj = raw as Record<string, unknown>;
  const out: ReferenceDistribution = { ...fallback };

  const keys: (keyof ReferenceDistribution)[] = [
    'crossCorrelation',
    'circadianNormalized',
    'bimodalLatency',
    'burstinessAroundHuman',
    'iatLogStddev',
    'personaDrift',
    'traceFlagsRate',
    'configFlagsCount',
  ];
  for (const k of keys) {
    const entry = obj[k];
    if (
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as { mean: unknown }).mean === 'number' &&
      typeof (entry as { stddev: unknown }).stddev === 'number'
    ) {
      out[k] = {
        mean: (entry as { mean: number }).mean,
        stddev: (entry as { stddev: number }).stddev,
      };
    }
  }
  return out;
}

export async function computeTraceFlagsRate(
  prisma: Pick<PrismaClient, 'reasoningTrace'>,
  agentId: string,
  options: { now?: Date; windowDays?: number } = {},
): Promise<{ rate: number; total: number }> {
  const now = options.now ?? new Date();
  const start = new Date(now.getTime() - (options.windowDays ?? DEFAULT_WINDOW_DAYS) * 86_400_000);

  const totals = await prisma.reasoningTrace.groupBy({
    by: ['validationStatus'],
    where: {
      agentId,
      createdAt: { gte: start, lte: now },
      validationStatus: { in: ['PASSED', 'FLAGGED'] },
    },
    _count: { _all: true },
  });

  let passed = 0;
  let flagged = 0;
  for (const row of totals) {
    if (row.validationStatus === 'PASSED') passed = row._count._all;
    if (row.validationStatus === 'FLAGGED') flagged = row._count._all;
  }
  const total = passed + flagged;
  return { rate: total === 0 ? 0 : flagged / total, total };
}

export async function loadActiveConfigFlags(
  prisma: Pick<PrismaClient, 'behaviorFlag'>,
  agentId: string,
): Promise<string[]> {
  const rows = await prisma.behaviorFlag.findMany({
    where: {
      agentId,
      source: 'config-anomaly-detector',
      resolvedAt: null,
    },
    select: { flag: true },
  });
  return rows.map((r) => r.flag);
}

export interface ComputeOptions {
  now?: Date;
  windowDays?: number;
}

export interface ComputeResult {
  agentId: string;
  score: number;
  scoreCategory: string;
  activeFlags: string[];
  insufficientData: boolean;
  /** Persisted breakdown matching the schema of `AgentBehaviorScore.features`. */
  featuresPersisted: Record<string, unknown>;
}

/**
 * Compute Tier-1 behavior score for one agent and persist it atomically.
 *
 * Resolves to `insufficientData: true` (without writing scoring rows) when
 * the agent hasn't crossed the minimum action threshold — saves us churning
 * the History table for agents that don't yet qualify for a real score.
 * Spec §6.5 explicitly mandates the 0.55 / STANDARD fallback in that case.
 */
export async function computeBehaviorScoreTier1(
  prisma: PrismaClient,
  agentId: string,
  options: ComputeOptions = {},
): Promise<ComputeResult> {
  return prisma.$transaction((tx) => computeBehaviorScoreTier1InTx(tx, agentId, options));
}

/**
 * Tx-accepting variant of {@link computeBehaviorScoreTier1}. Lets the
 * caller compose the score write with other mutations (audit log, etc)
 * inside a single `$transaction`.
 */
export async function computeBehaviorScoreTier1InTx(
  tx: Prisma.TransactionClient,
  agentId: string,
  options: ComputeOptions = {},
): Promise<ComputeResult> {
  const now = options.now ?? new Date();
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;

  const agent = await tx.agent.findUnique({
    where: { id: agentId },
    select: { id: true, actionsCount: true },
  });
  if (agent === null) {
    throw new Error(`Agent ${agentId} not found`);
  }

  if (isInsufficientData(agent.actionsCount, windowDays)) {
    await persistInsufficientDataInTx(tx, agentId, windowDays, now);
    return {
      agentId,
      score: INSUFFICIENT_DATA_SCORE,
      scoreCategory: INSUFFICIENT_DATA_CATEGORY,
      activeFlags: ['INSUFFICIENT_DATA'],
      insufficientData: true,
      featuresPersisted: {
        computationMeta: {
          actionsConsidered: agent.actionsCount,
          windowStart: new Date(now.getTime() - windowDays * 86_400_000).toISOString(),
          windowEnd: now.toISOString(),
          skippedSignals: ['all_tier1'],
        },
      },
    };
  }

  const [crossCorr, circadian, reaction, bursty, iat, traceFlags, configFlags, reference] =
    await Promise.all([
      computeCrossCorrelation(tx, agentId, { now, windowDays }),
      computeCircadianEntropy(tx, agentId, { now, windowDays }),
      computeReactionLatency(tx, agentId, { now, windowDays }),
      computeBurstiness(tx, agentId, { now, windowDays }),
      computeIatLogNormal(tx, agentId, { now, windowDays }),
      computeTraceFlagsRate(tx, agentId, { now, windowDays }),
      loadActiveConfigFlags(tx, agentId),
      loadActiveReference(tx),
    ]);

  const reactionSignal =
    reaction.samplesUsed >= MIN_REPLIES_FOR_REACTION_LATENCY ? reaction.bimodalScore : null;

  const signals: ScoreSignals = {
    crossCorrelation: crossCorr.samplesUsed > 0 ? crossCorr.value : null,
    circadianNormalized: circadian.samplesUsed > 0 ? circadian.normalized : null,
    bimodalLatency: reactionSignal,
    burstiness: bursty.samplesUsed > 0 ? bursty.value : null,
    iatLogStddev: iat.samplesUsed > 0 ? iat.logStddev : null,
    personaDrift: null,
    traceFlagsRate: traceFlags.total > 0 ? traceFlags.rate : null,
    configFlagsCount: configFlags.length,
    teeAttestationValid: false,
  };

  const breakdown = applyScoreFormula(signals, reference, {
    flagPenalty: sumFlagPenalty(configFlags),
  });

  const activeFlags = [...configFlags];

  const featuresPersisted = {
    crossCorrelation: {
      value: crossCorr.value,
      samplesUsed: crossCorr.samplesUsed,
      confidence: crossCorr.confidence,
      public: true,
    },
    circadianEntropy: {
      value: circadian.value,
      normalized: circadian.normalized,
      samplesUsed: circadian.samplesUsed,
      public: true,
    },
    reactionLatency: {
      p50Ms: reaction.p50Ms,
      p95Ms: reaction.p95Ms,
      bimodalScore: reaction.bimodalScore,
      samplesUsed: reaction.samplesUsed,
      public: false,
    },
    burstiness: {
      value: bursty.value,
      samplesUsed: bursty.samplesUsed,
      public: false,
    },
    iatLognormalResidual: {
      value: iat.logStddev,
      samplesUsed: iat.samplesUsed,
      public: false,
    },
    importedFlags: {
      configFlagsCount: configFlags.length,
      traceFlagsRate: signals.traceFlagsRate,
      teeAttestationStatus: 'NONE' as const,
      public: true,
    },
    computationMeta: {
      actionsConsidered: agent.actionsCount,
      windowStart: new Date(now.getTime() - windowDays * 86_400_000).toISOString(),
      windowEnd: now.toISOString(),
      skippedSignals:
        reaction.samplesUsed >= MIN_REPLIES_FOR_REACTION_LATENCY
          ? ['personaDrift']
          : ['reactionLatency', 'personaDrift'],
    },
  };

  await tx.agentBehaviorScore.upsert({
    where: { agentId },
    create: {
      agentId,
      score: breakdown.score,
      scoreCategory: breakdown.scoreCategory,
      features: featuresPersisted,
      activeFlags,
      computedBy: SCORER_VERSION,
      computedAt: now,
      windowDays,
    },
    update: {
      score: breakdown.score,
      scoreCategory: breakdown.scoreCategory,
      features: featuresPersisted,
      activeFlags,
      computedBy: SCORER_VERSION,
      computedAt: now,
      windowDays,
    },
  });

  await tx.behaviorScoreHistory.create({
    data: {
      agentId,
      score: breakdown.score,
      scoreCategory: breakdown.scoreCategory,
      computedAt: now,
      windowDays,
    },
  });

  await tx.agent.update({
    where: { id: agentId },
    data: {
      behaviorScore: breakdown.score,
      behaviorScoreUpdatedAt: now,
    },
  });

  return {
    agentId,
    score: breakdown.score,
    scoreCategory: breakdown.scoreCategory,
    activeFlags,
    insufficientData: false,
    featuresPersisted,
  };
}

async function persistInsufficientDataInTx(
  tx: Prisma.TransactionClient,
  agentId: string,
  windowDays: number,
  now: Date,
): Promise<void> {
  const features = {
    insufficientData: true,
    computationMeta: {
      actionsConsidered: 0,
      windowStart: new Date(now.getTime() - windowDays * 86_400_000).toISOString(),
      windowEnd: now.toISOString(),
      skippedSignals: ['all_tier1'],
    },
  };
  await tx.agentBehaviorScore.upsert({
    where: { agentId },
    create: {
      agentId,
      score: INSUFFICIENT_DATA_SCORE,
      scoreCategory: INSUFFICIENT_DATA_CATEGORY,
      features,
      activeFlags: ['INSUFFICIENT_DATA'],
      computedBy: SCORER_VERSION,
      computedAt: now,
      windowDays,
    },
    update: {
      score: INSUFFICIENT_DATA_SCORE,
      scoreCategory: INSUFFICIENT_DATA_CATEGORY,
      features,
      activeFlags: ['INSUFFICIENT_DATA'],
      computedBy: SCORER_VERSION,
      computedAt: now,
      windowDays,
    },
  });
  await tx.agent.update({
    where: { id: agentId },
    data: { behaviorScore: INSUFFICIENT_DATA_SCORE, behaviorScoreUpdatedAt: now },
  });
}
