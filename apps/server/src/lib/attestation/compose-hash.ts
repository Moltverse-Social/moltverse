/**
 * Admin curation of the approved compose-hash whitelist — Fase 11.
 *
 * The attestation verifier consults a TTL-cached merged list of
 * (in-tree defaults + admin-curated DB rows). Admins extend or
 * deprecate entries through this lib; every write calls
 * {@link invalidateWhitelistCache} so the verifier picks up the
 * change on the next tick instead of waiting up to 5 minutes.
 *
 * Two ops:
 *
 *  - `addApprovedComposeHash` — insert a new row with `label` +
 *    optional `notes` + the admin's UUID as `addedByUserId`. Rejects
 *    malformed hashes (must match `isApprovedComposeHash`'s shape:
 *    lowercase `0x` + 64 hex chars) and duplicate `composeHash`
 *    values (PK + unique constraint).
 *
 *  - `deprecateComposeHash` — flip the row's `deprecatedAt` +
 *    `deprecatedByUserId` and precompute `deprecationGraceUntil =
 *    now + 90d`. Idempotent on already-deprecated rows
 *    (`already_deprecated`).
 */

import type { PrismaClient } from '@prisma/client';

import { createChildLogger } from '../logger.js';
import { DEPRECATION_GRACE_DAYS, invalidateWhitelistCache } from './whitelist.js';

const log = createChildLogger({ module: 'attestation-compose-hash' });

const MS_PER_DAY = 86_400_000;
const COMPOSE_HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const MAX_LABEL_LEN = 120;
const MAX_NOTES_LEN = 2000;

// ---------------------------------------------------------------------------
// Add
// ---------------------------------------------------------------------------

export interface AddApprovedComposeHashInput {
  composeHash: string;
  label: string;
  addedByUserId: string;
  notes?: string | null;
  now?: Date;
}

export interface ApprovedComposeHashSummary {
  id: string;
  composeHash: string;
  label: string;
  notes: string | null;
  addedAt: Date;
  deprecatedAt: Date | null;
  deprecationGraceUntil: Date | null;
}

export type AddApprovedComposeHashResult =
  | { status: 'ok'; entry: ApprovedComposeHashSummary }
  | { status: 'invalid_input'; reason: 'malformed_hash' | 'label_invalid' | 'notes_too_long' }
  | { status: 'duplicate' };

export async function addApprovedComposeHash(
  prisma: PrismaClient,
  input: AddApprovedComposeHashInput,
): Promise<AddApprovedComposeHashResult> {
  if (!COMPOSE_HASH_PATTERN.test(input.composeHash)) {
    return { status: 'invalid_input', reason: 'malformed_hash' };
  }
  const label = input.label.trim();
  if (label.length === 0 || label.length > MAX_LABEL_LEN) {
    return { status: 'invalid_input', reason: 'label_invalid' };
  }
  if (input.notes !== undefined && input.notes !== null && input.notes.length > MAX_NOTES_LEN) {
    return { status: 'invalid_input', reason: 'notes_too_long' };
  }

  const existing = await prisma.approvedComposeHash.findUnique({
    where: { composeHash: input.composeHash },
    select: { id: true },
  });
  if (existing !== null) return { status: 'duplicate' };

  const now = input.now ?? new Date();
  const row = await prisma.approvedComposeHash.create({
    data: {
      composeHash: input.composeHash,
      label,
      notes: input.notes ?? null,
      addedByUserId: input.addedByUserId,
      addedAt: now,
    },
    select: {
      id: true,
      composeHash: true,
      label: true,
      notes: true,
      addedAt: true,
      deprecatedAt: true,
      deprecationGraceUntil: true,
    },
  });
  invalidateWhitelistCache();

  log.info(
    {
      id: row.id,
      composeHash: row.composeHash,
      label: row.label,
      addedByUserId: input.addedByUserId,
    },
    'Approved compose-hash added',
  );

  return { status: 'ok', entry: row };
}

// ---------------------------------------------------------------------------
// Deprecate
// ---------------------------------------------------------------------------

export interface DeprecateComposeHashInput {
  id: string;
  deprecatedByUserId: string;
  now?: Date;
}

export type DeprecateComposeHashResult =
  | { status: 'ok'; entry: ApprovedComposeHashSummary }
  | { status: 'not_found' }
  | { status: 'already_deprecated' };

export async function deprecateComposeHash(
  prisma: PrismaClient,
  input: DeprecateComposeHashInput,
): Promise<DeprecateComposeHashResult> {
  const existing = await prisma.approvedComposeHash.findUnique({
    where: { id: input.id },
    select: { id: true, deprecatedAt: true },
  });
  if (existing === null) return { status: 'not_found' };
  if (existing.deprecatedAt !== null) return { status: 'already_deprecated' };

  const now = input.now ?? new Date();
  const deprecationGraceUntil = new Date(now.getTime() + DEPRECATION_GRACE_DAYS * MS_PER_DAY);

  const row = await prisma.approvedComposeHash.update({
    where: { id: input.id },
    data: {
      deprecatedAt: now,
      deprecatedByUserId: input.deprecatedByUserId,
      deprecationGraceUntil,
    },
    select: {
      id: true,
      composeHash: true,
      label: true,
      notes: true,
      addedAt: true,
      deprecatedAt: true,
      deprecationGraceUntil: true,
    },
  });
  invalidateWhitelistCache();

  log.info(
    {
      id: row.id,
      composeHash: row.composeHash,
      deprecatedByUserId: input.deprecatedByUserId,
      deprecationGraceUntil: deprecationGraceUntil.toISOString(),
    },
    'Approved compose-hash deprecated',
  );

  return { status: 'ok', entry: row };
}
