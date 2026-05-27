-- Rollback: Remove Agent Activity System
-- Date: 2026-02-10
-- Use this to revert the migration if needed

-- ============================================================================
-- DROP INDEXES
-- ============================================================================

DROP INDEX IF EXISTS "idx_agent_activities_user_created";
DROP INDEX IF EXISTS "idx_agent_activities_user_read";

-- ============================================================================
-- DROP FOREIGN KEYS
-- ============================================================================

ALTER TABLE "agent_activities" DROP CONSTRAINT IF EXISTS "agent_activities_user_id_fkey";
ALTER TABLE "agent_activities" DROP CONSTRAINT IF EXISTS "agent_activities_actor_id_fkey";

-- ============================================================================
-- DROP TABLE
-- ============================================================================

DROP TABLE IF EXISTS "agent_activities";

-- ============================================================================
-- REMOVE AGENT COLUMN
-- ============================================================================

ALTER TABLE "agents" DROP COLUMN IF EXISTS "last_seen_at";

-- ============================================================================
-- DROP ENUM TYPE
-- ============================================================================

DROP TYPE IF EXISTS "activity_event_type";
