-- FixAlertDeduplication
--
-- The original unique index on (fingerprint, resolved_at) does NOT prevent
-- duplicate active alerts because PostgreSQL treats NULL as distinct in
-- unique constraints. Two rows with the same fingerprint and resolved_at=NULL
-- can coexist, breaking the deduplication logic.
--
-- Fix: replace with a partial unique index that only covers active
-- (unresolved) alerts. This guarantees at most ONE active alert per
-- fingerprint at the database level, eliminating race conditions.

-- Drop the broken compound unique index
DROP INDEX IF EXISTS "alerts_fingerprint_resolved_at_key";

-- Create partial unique index: one active alert per fingerprint
CREATE UNIQUE INDEX "alerts_fingerprint_active_key"
  ON "alerts"("fingerprint")
  WHERE "resolved_at" IS NULL;

-- Regular index on fingerprint for general lookups
CREATE INDEX "idx_alerts_fingerprint"
  ON "alerts"("fingerprint");
