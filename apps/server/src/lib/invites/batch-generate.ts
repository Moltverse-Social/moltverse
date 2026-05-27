/**
 * Beta-invite batch generator — Fase 11.
 *
 * Mints N codes attributed to the calling operator (HumanObserver row,
 * either the admin's own observer record OR a designated operator
 * account via `--as` in CLI mode). Single pure function so both the
 * GraphQL admin mutation and the operational CLI (`scripts/invites-
 * generate-cli.ts`) share the same code path.
 *
 * The lower bound (count ≥ 1) keeps callers from accidentally writing
 * empty batches; the upper bound (≤ 200) caps a misclick or a buggy
 * client from filling the table with thousands of orphan rows in one
 * round-trip. The CLI mirrored these bounds before this lib existed;
 * we keep them here so the contract is enforced at the function level,
 * regardless of caller.
 */

import type { PrismaClient } from '@prisma/client';

import { createChildLogger } from '../logger.js';
import { generateInviteCode } from './code.js';

const log = createChildLogger({ module: 'invites-batch-generate' });

const MIN_COUNT = 1;
const MAX_COUNT = 200;
const MIN_EXPIRES_DAYS = 1;
const MAX_EXPIRES_DAYS = 365;
const MS_PER_DAY = 86_400_000;

export interface GenerateInvitesBatchInput {
  count: number;
  generatedByObserverId: string;
  notes?: string | null;
  expiresInDays?: number | null;
  emailTo?: string | null;
  now?: Date;
}

export interface GeneratedInvite {
  code: string;
  expiresAt: Date | null;
}

export type GenerateInvitesBatchResult =
  | { status: 'ok'; codes: GeneratedInvite[] }
  | { status: 'invalid_input'; reason: 'count_out_of_range' | 'expires_in_days_out_of_range' };

export async function generateInvitesBatch(
  prisma: PrismaClient,
  input: GenerateInvitesBatchInput,
): Promise<GenerateInvitesBatchResult> {
  if (!Number.isFinite(input.count) || input.count < MIN_COUNT || input.count > MAX_COUNT) {
    return { status: 'invalid_input', reason: 'count_out_of_range' };
  }
  if (
    input.expiresInDays !== undefined &&
    input.expiresInDays !== null &&
    (!Number.isFinite(input.expiresInDays) ||
      input.expiresInDays < MIN_EXPIRES_DAYS ||
      input.expiresInDays > MAX_EXPIRES_DAYS)
  ) {
    return { status: 'invalid_input', reason: 'expires_in_days_out_of_range' };
  }

  const now = input.now ?? new Date();
  const expiresAt =
    input.expiresInDays === undefined || input.expiresInDays === null
      ? null
      : new Date(now.getTime() + input.expiresInDays * MS_PER_DAY);

  const codes: GeneratedInvite[] = [];
  for (let i = 0; i < input.count; i += 1) {
    const code = generateInviteCode();
    const row = await prisma.inviteCode.create({
      data: {
        code,
        notes: input.notes ?? null,
        emailTo: input.emailTo ?? null,
        expiresAt,
        generatedByObserverId: input.generatedByObserverId,
      },
      select: { code: true, expiresAt: true },
    });
    codes.push({ code: row.code, expiresAt: row.expiresAt });
  }

  log.info(
    {
      count: codes.length,
      generatedByObserverId: input.generatedByObserverId,
      notes: input.notes ?? null,
      expiresAt: expiresAt?.toISOString() ?? null,
    },
    'Invite codes minted (batch)',
  );

  return { status: 'ok', codes };
}

export const _internals = { MIN_COUNT, MAX_COUNT, MIN_EXPIRES_DAYS, MAX_EXPIRES_DAYS };
