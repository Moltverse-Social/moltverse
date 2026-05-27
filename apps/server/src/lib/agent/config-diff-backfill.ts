/**
 * AgentConfigDiff backfill — Fase 17.5.1.
 *
 * The Fase 17.5 write paths (REST + GraphQL) populate `AgentConfigDiff`
 * inside the same transaction that creates a new `AgentConfig` row.
 * Rows written BEFORE 17.5 landed (or rows created via direct DB writes
 * — seed scripts, migrations, tests that bypass the mutator) have no
 * matching diff row. The history viewer renders `changesFromPrevious:
 * null` for those rows: correct but incomplete.
 *
 * This module scans for those orphan transitions and writes the missing
 * diffs idempotently. It is pure (no I/O outside the supplied
 * PrismaClient) so the same code path drives:
 *
 *   - The operational CLI at `scripts/backfill-agent-config-diffs.ts`.
 *   - A future GraphQL admin mutation if Fase 17.6 adds one.
 *   - Integration tests that seed history rows directly.
 *
 * The candidate query uses the reverse relation `AgentConfig.diffsAsTo`
 * with `none: {}` — so already-processed rows drop out of the next
 * batch's `findMany` automatically. No cursor, no offset tracking.
 *
 * Inserts go through `upsert` keyed on the composite unique
 * `[fromConfigId, toConfigId]`: re-running the backfill is a no-op
 * even if races insert diffs concurrently with the loop.
 */

import type { AgentConfig, PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

import {
  buildFieldChanges,
  computeFlags,
  computeSeverity,
  snapshotFromConfig,
} from './config-diff.js';

const DEFAULT_BATCH_SIZE = 100;
const MIN_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 500;

export interface BackfillOptions {
  /** Whether to skip writes and just report what would be done. */
  dryRun?: boolean;
  /** Number of rows to scan per iteration. Default 100, clamped to [1, 500]. */
  batchSize?: number;
  /** Restrict the scan to a single agent (useful for targeted re-processing). */
  agentId?: string;
  /**
   * Optional structured-log emitter. Receives one record per batch with
   * counters. Production callers pass a pino child logger; tests can
   * leave it undefined.
   */
  onBatch?: (record: BackfillBatchRecord) => void;
}

export interface BackfillBatchRecord {
  batchIndex: number;
  rowsInBatch: number;
  writtenInBatch: number;
  skippedInBatch: number;
}

export interface BackfillResult {
  /** Total candidate rows scanned across all batches. */
  scanned: number;
  /** Rows for which a diff was successfully computed (predecessor found). */
  eligible: number;
  /** Rows where the diff was inserted (always 0 when `dryRun` is true). */
  written: number;
  /**
   * Rows skipped due to unexpected state (e.g., predecessor row missing
   * despite a non-null `previousConfigId`). The schema's
   * `onDelete: SetNull` makes this nearly impossible, but the backfill
   * defends anyway and reports the count rather than crashing.
   */
  skipped: number;
  /** True iff no writes were performed. */
  dryRun: boolean;
}

function clampBatchSize(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) {
    return DEFAULT_BATCH_SIZE;
  }
  return Math.max(MIN_BATCH_SIZE, Math.min(MAX_BATCH_SIZE, Math.floor(requested)));
}

/**
 * Predicate used by both the dry-run count and the live loop. Filters
 * to AgentConfig rows that:
 *   - Have a predecessor (v2+ only — v1 has no diff by design).
 *   - Have NO existing AgentConfigDiff row pointing at them as `toConfigId`.
 * Optionally restricted to a single agent.
 */
function candidateWhere(agentId: string | undefined): Prisma.AgentConfigWhereInput {
  return {
    previousConfigId: { not: null },
    diffsAsTo: { none: {} },
    ...(agentId === undefined ? {} : { agentId }),
  };
}

/**
 * Compute the diff payload for a single AgentConfig row given its
 * predecessor. Returns the data shape ready to feed `agentConfigDiff.upsert`.
 */
function computeDiffPayload(
  prev: AgentConfig,
  next: AgentConfig,
): {
  fieldChanges: Prisma.InputJsonValue;
  severity: 'TRIVIAL' | 'MINOR' | 'MAJOR' | 'RADICAL';
  flags: ReturnType<typeof computeFlags>;
} {
  const prevSnap = snapshotFromConfig(prev);
  const nextSnap = snapshotFromConfig(next);
  const fieldChanges = buildFieldChanges(prevSnap, nextSnap);
  const severity = computeSeverity(fieldChanges);
  const flags = computeFlags({
    prevToneDescriptors: prevSnap.toneDescriptors,
    nextToneDescriptors: nextSnap.toneDescriptors,
    changes: fieldChanges,
    editReason: next.editReason ?? '',
  });
  return {
    fieldChanges: fieldChanges as unknown as Prisma.InputJsonValue,
    severity,
    flags,
  };
}

export async function backfillAgentConfigDiffs(
  prisma: PrismaClient,
  options: BackfillOptions = {},
): Promise<BackfillResult> {
  const dryRun = options.dryRun === true;
  const batchSize = clampBatchSize(options.batchSize);
  const where = candidateWhere(options.agentId);

  // Dry-run: a single COUNT is all the reporter needs. We still surface
  // `eligible` = the count because the operator's interest is "how many
  // diffs WOULD be created" — the count is exact for that purpose
  // (predecessor lookups would only ever subtract, never add).
  if (dryRun) {
    const eligible = await prisma.agentConfig.count({ where });
    return {
      scanned: eligible,
      eligible,
      written: 0,
      skipped: 0,
      dryRun: true,
    };
  }

  let scanned = 0;
  let eligible = 0;
  let written = 0;
  let skipped = 0;
  let batchIndex = 0;

  // Loop until findMany returns []. Because successful writes flip the
  // `diffsAsTo: none: {}` predicate to false for that row, processed
  // rows naturally drop out of the next batch — no cursor needed. A
  // race with concurrent writers is fine (the upsert handles it).
  while (true) {
    const batch = await prisma.agentConfig.findMany({
      where,
      take: batchSize,
      // Stable order helps debugging; createdAt is indexed and the
      // candidate set is small relative to the table.
      orderBy: { createdAt: 'asc' },
    });
    if (batch.length === 0) break;

    let writtenInBatch = 0;
    let skippedInBatch = 0;
    scanned += batch.length;

    for (const next of batch) {
      // `previousConfigId !== null` is guaranteed by the where clause,
      // so the cast is safe. Prisma still types it as nullable on the
      // model, hence the non-null assertion.
      const prevId = next.previousConfigId;
      if (prevId === null) {
        skipped += 1;
        skippedInBatch += 1;
        continue;
      }
      const prev = await prisma.agentConfig.findUnique({ where: { id: prevId } });
      if (prev === null) {
        // Structurally unreachable today: the FK on
        // `agent_configs.previous_config_id` has `onDelete: SetNull`,
        // so deleting a predecessor zeroes the pointer (which would
        // exclude the row from the candidate set), and the FK rejects
        // UPDATEs that point at a non-existent UUID. The check is
        // retained as defense-in-depth — a future schema change that
        // relaxes the FK (or a direct-SQL fixup that bypasses it)
        // would otherwise crash the whole backfill on one bad row.
        // We count it as a skip rather than throw so the loop continues.
        skipped += 1;
        skippedInBatch += 1;
        continue;
      }
      eligible += 1;

      const payload = computeDiffPayload(prev, next);

      // Upsert by the composite unique constraint. `update: {}` makes
      // the operation a no-op when the row already exists, so concurrent
      // writers (or a re-run of this backfill) cannot produce errors.
      await prisma.agentConfigDiff.upsert({
        where: {
          fromConfigId_toConfigId: { fromConfigId: prev.id, toConfigId: next.id },
        },
        create: {
          agentId: next.agentId,
          fromConfigId: prev.id,
          toConfigId: next.id,
          fieldChanges: payload.fieldChanges,
          severity: payload.severity,
          flags: payload.flags,
        },
        update: {},
      });
      written += 1;
      writtenInBatch += 1;
    }

    options.onBatch?.({
      batchIndex,
      rowsInBatch: batch.length,
      writtenInBatch,
      skippedInBatch,
    });
    batchIndex += 1;
  }

  return {
    scanned,
    eligible,
    written,
    skipped,
    dryRun: false,
  };
}

/**
 * Tunable constants exported for tests + the CLI's `--help` text.
 * Not part of the runtime API.
 */
export const _internals = {
  DEFAULT_BATCH_SIZE,
  MIN_BATCH_SIZE,
  MAX_BATCH_SIZE,
};
