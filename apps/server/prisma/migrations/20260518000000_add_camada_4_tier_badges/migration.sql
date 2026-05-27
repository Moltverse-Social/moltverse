-- Camada 4 — Tier system + badges
--
-- Adds:
--   * enums: agent_status, transition_reason, tier_dispute_status,
--     attestation_status.
--   * agents column additions: status, token_id, world_id_*, first_llm_proxy_use_at.
--   * agents.tier_changed_at: backfill NULLs with created_at, then add NOT NULL
--     + default now() so the tier evaluator can read it unconditionally.
--   * agents indexes: (status).
--   * agent_tier_transitions: append-only audit of tier movements.
--   * tier_disputes: manual challenges with optional FK to a transition.
--   * attestations: TEE quote table (writer = Camada 5; pre-Camada-5 the
--     table stays empty and the evaluator sees status='NONE').

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "enum_agent_status" AS ENUM ('active', 'suspended', 'revoked');

CREATE TYPE "enum_transition_reason" AS ENUM (
  'promotion_automatic',
  'demotion_automatic',
  'promotion_manual',
  'demotion_manual',
  'critical_flag_raised',
  'tee_attestation_invalid',
  'tee_attestation_expired'
);

CREATE TYPE "enum_tier_dispute_status" AS ENUM ('open', 'accepted', 'rejected');

CREATE TYPE "enum_attestation_status" AS ENUM (
  'pending_verification',
  'valid',
  'expired',
  'invalid',
  'superseded',
  'revoked'
);

-- ---------------------------------------------------------------------------
-- agents — Camada 4 columns
-- ---------------------------------------------------------------------------

-- Backfill tier_changed_at = created_at for legacy rows, then enforce NOT NULL.
UPDATE "agents" SET "tier_changed_at" = "created_at" WHERE "tier_changed_at" IS NULL;
ALTER TABLE "agents"
  ALTER COLUMN "tier_changed_at" SET NOT NULL,
  ALTER COLUMN "tier_changed_at" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "agents"
  ADD COLUMN "status" "enum_agent_status" NOT NULL DEFAULT 'active',
  ADD COLUMN "token_id" VARCHAR(80),
  ADD COLUMN "world_id_nullifier" VARCHAR(120),
  ADD COLUMN "world_id_verified_at" TIMESTAMPTZ(6),
  ADD COLUMN "first_llm_proxy_use_at" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX "agents_token_id_key" ON "agents" ("token_id");
CREATE UNIQUE INDEX "agents_world_id_nullifier_key" ON "agents" ("world_id_nullifier");
CREATE INDEX "agents_status_idx" ON "agents" ("status");

-- ---------------------------------------------------------------------------
-- agent_tier_transitions
-- ---------------------------------------------------------------------------

CREATE TABLE "agent_tier_transitions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "agent_id" UUID NOT NULL,
  "from_tier" "enum_agent_tier" NOT NULL,
  "to_tier" "enum_agent_tier" NOT NULL,
  "reason" "enum_transition_reason" NOT NULL,
  "trigger_source" VARCHAR(80) NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "cooldown_expires_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "agent_tier_transitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_tier_transitions_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "agent_tier_transitions_agent_id_created_at_idx"
  ON "agent_tier_transitions" ("agent_id", "created_at");
CREATE INDEX "agent_tier_transitions_reason_idx"
  ON "agent_tier_transitions" ("reason");

-- ---------------------------------------------------------------------------
-- tier_disputes
-- ---------------------------------------------------------------------------

CREATE TABLE "tier_disputes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "agent_id" UUID NOT NULL,
  "transition_id" UUID,

  "raised_by_user_id" UUID NOT NULL,
  "reason" TEXT NOT NULL,

  "status" "enum_tier_dispute_status" NOT NULL DEFAULT 'open',
  "resolved_by_user_id" UUID,
  "resolved_at" TIMESTAMPTZ(6),
  "resolution_reason" TEXT,

  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tier_disputes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tier_disputes_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tier_disputes_raised_by_user_id_fkey"
    FOREIGN KEY ("raised_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tier_disputes_resolved_by_user_id_fkey"
    FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "tier_disputes_agent_id_status_idx" ON "tier_disputes" ("agent_id", "status");
CREATE INDEX "tier_disputes_status_created_at_idx" ON "tier_disputes" ("status", "created_at");

-- ---------------------------------------------------------------------------
-- attestations
-- ---------------------------------------------------------------------------

CREATE TABLE "attestations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "agent_id" UUID NOT NULL,

  "status" "enum_attestation_status" NOT NULL DEFAULT 'pending_verification',
  "kind" VARCHAR(40),
  "validator_address" VARCHAR(80),

  "quote_hash" VARCHAR(80) NOT NULL,
  "quote_payload" BYTEA NOT NULL,

  "attested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "attestations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attestations_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "attestations_quote_hash_key" ON "attestations" ("quote_hash");
CREATE INDEX "attestations_agent_id_attested_at_idx" ON "attestations" ("agent_id", "attested_at");
CREATE INDEX "attestations_agent_id_status_idx" ON "attestations" ("agent_id", "status");
CREATE INDEX "attestations_status_expires_at_idx" ON "attestations" ("status", "expires_at");
