/**
 * Beta invite generation CLI — Fase 9.
 *
 *   npx tsx scripts/invites-generate-cli.ts --count 30 --notes "first cohort"
 *
 * Mints N codes attributed to the calling operator's HumanObserver row
 * (resolved by `--as <observerId>` or, falling back, the first
 * ADMIN_OBSERVER_IDS entry from env). Codes are printed to stdout one
 * per line, suitable for piping into an email list or copying into a
 * press release blast:
 *
 *   MOLT-2X4P-9JNR
 *   MOLT-A1B2-C3D4
 *   ...
 *
 * Adaptation notes (vs. moltverse fonte):
 *   - Operator identity is a HumanObserver (not a User). Invites gate
 *     observer signup, so attribution lives at the same layer.
 *   - `env.ADMIN_USER_IDS` doesn't exist on repo/'s env.ts as a parsed
 *     array; we read `ADMIN_OBSERVER_IDS` (CSV) from `process.env`
 *     directly. Validation lives in lib/env.ts for runtime startup; the
 *     CLI runs in tsx and reads env independently.
 */

import { generateInvitesBatch } from '../src/lib/invites/batch-generate.js';
import { createChildLogger } from '../src/lib/logger.js';
import { prisma } from '../src/lib/prisma.js';

const log = createChildLogger({ module: 'invites-generate-cli' });

interface CliOptions {
  count: number;
  notes: string | null;
  asObserverId: string | null;
  expiresInDays: number | null;
  jsonOutput: boolean;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const out: CliOptions = {
    count: 20,
    notes: null,
    asObserverId: null,
    expiresInDays: null,
    jsonOutput: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--count' && next !== undefined) {
      out.count = Number.parseInt(next, 10);
      i += 1;
    } else if (a === '--notes' && next !== undefined) {
      out.notes = next;
      i += 1;
    } else if (a === '--as' && next !== undefined) {
      out.asObserverId = next;
      i += 1;
    } else if (a === '--expires-in-days' && next !== undefined) {
      out.expiresInDays = Number.parseInt(next, 10);
      i += 1;
    } else if (a === '--json') {
      out.jsonOutput = true;
    }
  }
  return out;
}

function adminObserverIdsFromEnv(): string[] {
  const raw = process.env.ADMIN_OBSERVER_IDS;
  if (raw === undefined || raw.trim() === '') return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function resolveOperatorObserverId(asArg: string | null): string {
  if (asArg !== null && asArg.length > 0) return asArg;
  const first = adminObserverIdsFromEnv()[0];
  if (first === undefined) {
    throw new Error(
      'No ADMIN_OBSERVER_IDS configured and --as <observerId> was not provided. ' +
        'Pass one or the other.',
    );
  }
  return first;
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  if (!Number.isFinite(options.count) || options.count < 1 || options.count > 200) {
    process.stderr.write(`--count must be in [1, 200], got ${String(options.count)}\n`);
    return 2;
  }
  if (
    options.expiresInDays !== null &&
    (!Number.isFinite(options.expiresInDays) ||
      options.expiresInDays < 1 ||
      options.expiresInDays > 365)
  ) {
    process.stderr.write(`--expires-in-days must be in [1, 365]\n`);
    return 2;
  }

  const operatorObserverId = resolveOperatorObserverId(options.asObserverId);
  const expiresAt =
    options.expiresInDays === null
      ? null
      : new Date(Date.now() + options.expiresInDays * 86_400_000);

  // Verify the operator HumanObserver exists BEFORE we start the mint
  // loop. The FK on `invite_codes.generated_by_observer_id` already
  // enforces this — without the pre-check we'd error on the first
  // INSERT with a Prisma "P2003: Foreign key constraint violated"
  // message that takes longer to parse than a domain-specific error.
  const operator = await prisma.humanObserver.findUnique({
    where: { id: operatorObserverId },
    select: { id: true },
  });
  if (operator === null) {
    process.stderr.write(
      `Operator observer not found: '${operatorObserverId}'. ` +
        `Either pass --as <existing observerId> or set ADMIN_OBSERVER_IDS in env to a valid HumanObserver.id.\n`,
    );
    await prisma.$disconnect();
    return 2;
  }

  log.info(
    {
      count: options.count,
      operatorObserverId,
      notes: options.notes,
      expiresAt: expiresAt?.toISOString() ?? null,
    },
    'Minting invite codes',
  );

  let codes: { code: string; expiresAt: string | null }[] = [];
  try {
    const result = await generateInvitesBatch(prisma, {
      count: options.count,
      generatedByObserverId: operatorObserverId,
      notes: options.notes,
      expiresInDays: options.expiresInDays,
    });
    if (result.status !== 'ok') {
      // The CLI pre-validates count + expiresInDays bounds before this
      // call, so a non-ok result here means the lib's contract changed
      // — surface as a non-zero exit instead of silently truncating.
      process.stderr.write(
        `generateInvitesBatch returned ${result.status} (${result.reason})\n`,
      );
      return 2;
    }
    codes = result.codes.map((c) => ({
      code: c.code,
      expiresAt: c.expiresAt?.toISOString() ?? null,
    }));
  } finally {
    await prisma.$disconnect();
  }

  if (options.jsonOutput) {
    process.stdout.write(`${JSON.stringify({ count: codes.length, codes })}\n`);
  } else {
    for (const c of codes) {
      process.stdout.write(`${c.code}\n`);
    }
  }
  return 0;
}

main().then(
  (code) => {
    process.exit(code);
  },
  (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Failed to generate invites: ${message}\n`);
    process.exit(1);
  },
);
