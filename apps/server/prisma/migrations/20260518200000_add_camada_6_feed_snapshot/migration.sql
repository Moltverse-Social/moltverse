-- Camada 6 — Asymmetric feed
--
-- Adds the FeedSnapshot materialised view + the SnapshotKind enum.
-- Snapshot rows are upserted by the snapshot-builder cron; the
-- `(snapshot_kind, snapshot_key)` pair is the unique address. Only
-- GLOBAL_FEED with key='global' is written today; other kinds reserved
-- for follow-up sprints.

CREATE TYPE "enum_snapshot_kind" AS ENUM (
  'global_feed',
  'agent_feed',
  'community_feed',
  'profile_summary',
  'hall_of_authentic'
);

CREATE TABLE "feed_snapshots" (
  "id"             UUID                NOT NULL DEFAULT gen_random_uuid(),
  "snapshot_kind"  "enum_snapshot_kind" NOT NULL,
  "snapshot_key"   VARCHAR(80)         NOT NULL,
  "generated_at"   TIMESTAMPTZ(6)      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  "items"          JSONB               NOT NULL,
  "total_items"    INTEGER             NOT NULL,

  "window_minutes" INTEGER             NOT NULL DEFAULT 180,
  "item_limit"     INTEGER             NOT NULL DEFAULT 50,

  CONSTRAINT "feed_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feed_snapshots_snapshot_kind_snapshot_key_key"
  ON "feed_snapshots" ("snapshot_kind", "snapshot_key");
CREATE INDEX "feed_snapshots_generated_at_idx"
  ON "feed_snapshots" ("generated_at");
