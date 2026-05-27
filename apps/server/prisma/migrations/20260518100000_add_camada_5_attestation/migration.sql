-- Camada 5 — TEE attestation
--
-- Extends the `attestations` stub from Camada 4 with all the fields the
-- worker pipeline writes. The table is empty pre-Camada-5 so we don't
-- bother with default backfills on the columns that become NOT NULL —
-- the worker is the only writer.
--
-- Adds the `approved_compose_hashes` admin-curated whitelist + User
-- reverse FKs.

-- ---------------------------------------------------------------------------
-- attestations — extend Camada 4 stub
-- ---------------------------------------------------------------------------

-- Drop the stub fields the moltverse pattern doesn't use:
--   * quote_payload: bytes were stored inline in the row in the stub;
--     the moltverse pattern uses an in-process cache + `quote_uri`
--     placeholder so the path is forward-compatible with R2 storage.
--   * kind: replaced by the richer `verification_detail` Json column.
ALTER TABLE "attestations" DROP COLUMN "quote_payload";
ALTER TABLE "attestations" DROP COLUMN "kind";

-- Cryptographic anchor + verification detail.
ALTER TABLE "attestations"
  ADD COLUMN "quote_uri"            VARCHAR(500) NOT NULL DEFAULT '',
  ADD COLUMN "verification_detail"  JSONB,
  ADD COLUMN "compose_hash"         VARCHAR(80)  NOT NULL DEFAULT '',
  ADD COLUMN "compose_hash_entry"   JSONB,
  ADD COLUMN "report_data_hex"      VARCHAR(128) NOT NULL DEFAULT '',
  ADD COLUMN "rtmr3_hex"            VARCHAR(96)  NOT NULL DEFAULT '',
  ADD COLUMN "quote_version"        INTEGER      NOT NULL DEFAULT 0;

-- Lifecycle extras.
ALTER TABLE "attestations"
  ADD COLUMN "renewal_reminder_sent_at" TIMESTAMPTZ(6),
  ADD COLUMN "invalidated_at"           TIMESTAMPTZ(6),
  ADD COLUMN "invalidated_reason"       VARCHAR(200);

-- On-chain link (Camada 5 §5.4; Phase 6+).
ALTER TABLE "attestations"
  ADD COLUMN "onchain_tx_hash"       VARCHAR(80),
  ADD COLUMN "onchain_submitted_at"  TIMESTAMPTZ(6);

-- updated_at — defaults to created_at semantics so existing rows aren't
-- backfilled by a separate update. Application code uses Prisma
-- @updatedAt to bump going forward.
ALTER TABLE "attestations"
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- New search paths for the worker + public reads.
CREATE INDEX "attestations_compose_hash_idx" ON "attestations" ("compose_hash");
CREATE INDEX "attestations_expires_at_idx"   ON "attestations" ("expires_at");

-- ---------------------------------------------------------------------------
-- approved_compose_hashes
-- ---------------------------------------------------------------------------

CREATE TABLE "approved_compose_hashes" (
  "id"                       UUID         NOT NULL DEFAULT gen_random_uuid(),
  "compose_hash"             VARCHAR(80)  NOT NULL,
  "label"                    VARCHAR(120) NOT NULL,
  "notes"                    TEXT,

  "added_by_user_id"         UUID         NOT NULL,
  "added_at"                 TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  "deprecated_at"            TIMESTAMPTZ(6),
  "deprecated_by_user_id"    UUID,
  "deprecation_grace_until"  TIMESTAMPTZ(6),

  CONSTRAINT "approved_compose_hashes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "approved_compose_hashes_added_by_user_id_fkey"
    FOREIGN KEY ("added_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "approved_compose_hashes_deprecated_by_user_id_fkey"
    FOREIGN KEY ("deprecated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "approved_compose_hashes_compose_hash_key"
  ON "approved_compose_hashes" ("compose_hash");
CREATE INDEX "approved_compose_hashes_deprecated_at_idx"
  ON "approved_compose_hashes" ("deprecated_at");
