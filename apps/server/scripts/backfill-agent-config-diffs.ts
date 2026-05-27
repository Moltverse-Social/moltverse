/**
 * AgentConfigDiff backfill CLI — Fase 17.5.1.
 *
 *   npx tsx scripts/backfill-agent-config-diffs.ts [flags]
 *
 * Flags:
 *   --dry-run               Report eligible count without writing.
 *   --batch-size <n>        Rows scanned per iteration. Default 100; clamped [1, 500].
 *   --agent <id>            Restrict the scan to a single agent (UUID).
 *   --json                  Emit machine-readable JSON on stdout (one object).
 *
 * Exit codes:
 *   0  Success (including "nothing to do").
 *   2  Invalid flag value.
 *   1  Unexpected runtime error.
 *
 * The CLI is a thin wrapper around `lib/agent/config-diff-backfill.ts:
 * backfillAgentConfigDiffs`. All business logic and edge-case handling
 * lives in the lib so the same code path drives the CLI, future GraphQL
 * admin mutations, and integration tests.
 *
 * Why an explicit backfill: the Fase 17.5 write paths populate
 * AgentConfigDiff atomically with each new AgentConfig row, but rows
 * written BEFORE 17.5 (or via direct-DB seed scripts that bypass the
 * mutator) have no diff. This script repairs that state idempotently.
 * Safe to re-run; safe to interrupt mid-batch (the candidate query
 * automatically excludes already-written rows).
 */

import { createChildLogger } from '../src/lib/logger.js';
import { prisma } from '../src/lib/prisma.js';
import {
  backfillAgentConfigDiffs,
  _internals as backfillInternals,
  type BackfillResult,
} from '../src/lib/agent/config-diff-backfill.js';

const log = createChildLogger({ module: 'backfill-agent-config-diffs' });

interface CliOptions {
  dryRun: boolean;
  batchSize: number | null;
  agentId: string | null;
  jsonOutput: boolean;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const out: CliOptions = {
    dryRun: false,
    batchSize: null,
    agentId: null,
    jsonOutput: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--dry-run') {
      out.dryRun = true;
    } else if (a === '--batch-size' && next !== undefined) {
      out.batchSize = Number.parseInt(next, 10);
      i += 1;
    } else if (a === '--agent' && next !== undefined) {
      out.agentId = next;
      i += 1;
    } else if (a === '--json') {
      out.jsonOutput = true;
    } else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return out;
}

function printHelp(): void {
  const { DEFAULT_BATCH_SIZE, MIN_BATCH_SIZE, MAX_BATCH_SIZE } = backfillInternals;
  process.stdout.write(
    [
      'AgentConfigDiff backfill — Fase 17.5.1',
      '',
      'Usage: npx tsx scripts/backfill-agent-config-diffs.ts [flags]',
      '',
      'Flags:',
      '  --dry-run             Report eligible count without writing.',
      `  --batch-size <n>      Rows per iteration. Default ${DEFAULT_BATCH_SIZE}, clamped [${MIN_BATCH_SIZE}, ${MAX_BATCH_SIZE}].`,
      '  --agent <id>          Restrict to a single AgentConfig.agentId (UUID).',
      '  --json                Emit JSON on stdout instead of human-readable text.',
      '  --help, -h            Print this help.',
      '',
    ].join('\n'),
  );
}

function renderHuman(result: BackfillResult): string {
  const verb = result.dryRun ? 'would backfill' : 'backfilled';
  const lines = [
    result.dryRun
      ? `Dry-run: ${result.eligible} diff row(s) ${verb}.`
      : `Backfill complete: ${result.written} new diff row(s) written.`,
    `  scanned: ${result.scanned}`,
    `  eligible: ${result.eligible}`,
    `  written:  ${result.written}`,
    `  skipped:  ${result.skipped}`,
  ];
  return lines.join('\n') + '\n';
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));

  if (options.batchSize !== null) {
    if (!Number.isFinite(options.batchSize) || options.batchSize < 1) {
      process.stderr.write(
        `--batch-size must be a positive integer, got ${String(options.batchSize)}\n`,
      );
      return 2;
    }
  }
  if (options.agentId !== null) {
    // Sanity check — a malformed UUID would error from Prisma anyway,
    // but a clear up-front message is friendlier than a stack trace.
    const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!UUID_RE.test(options.agentId)) {
      process.stderr.write(`--agent must be a UUID, got '${options.agentId}'\n`);
      return 2;
    }
  }

  log.info(
    {
      dryRun: options.dryRun,
      batchSize: options.batchSize,
      agentId: options.agentId,
    },
    'Starting AgentConfigDiff backfill',
  );

  let result: BackfillResult;
  try {
    result = await backfillAgentConfigDiffs(prisma, {
      dryRun: options.dryRun,
      batchSize: options.batchSize ?? undefined,
      agentId: options.agentId ?? undefined,
      onBatch: (record) => {
        log.info(
          {
            batchIndex: record.batchIndex,
            rowsInBatch: record.rowsInBatch,
            writtenInBatch: record.writtenInBatch,
            skippedInBatch: record.skippedInBatch,
          },
          'Batch processed',
        );
      },
    });
  } finally {
    await prisma.$disconnect();
  }

  if (options.jsonOutput) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    process.stdout.write(renderHuman(result));
  }

  log.info(result, 'AgentConfigDiff backfill finished');
  return 0;
}

main().then(
  (code) => {
    process.exit(code);
  },
  (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`AgentConfigDiff backfill failed: ${message}\n`);
    process.exit(1);
  },
);
