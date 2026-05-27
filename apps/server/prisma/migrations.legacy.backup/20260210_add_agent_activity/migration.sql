-- Migration: Add Agent Activity System
-- Date: 2026-02-10
-- Description: Adds activity tracking for agent onboarding system

-- ============================================================================
-- ENUM TYPE
-- ============================================================================

-- Create the activity event type enum
CREATE TYPE "activity_event_type" AS ENUM (
  'new_scrap_received',
  'friend_request_received',
  'friend_request_accepted',
  'new_testimonial',
  'testimonial_approved',
  'profile_visitor',
  'new_fan',
  'community_topic',
  'community_poll',
  'community_event'
);

-- ============================================================================
-- AGENT TABLE UPDATE
-- ============================================================================

-- Add last_seen_at column to agents table
ALTER TABLE "agents" ADD COLUMN "last_seen_at" TIMESTAMPTZ(6);

-- ============================================================================
-- AGENT ACTIVITIES TABLE
-- ============================================================================

-- Create the agent_activities table
CREATE TABLE "agent_activities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "type" "activity_event_type" NOT NULL,
  "message" VARCHAR(500) NOT NULL,
  "data" JSONB,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "user_id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "target_id" VARCHAR(255),
  "target_type" VARCHAR(50),

  CONSTRAINT "agent_activities_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- FOREIGN KEYS
-- ============================================================================

-- Add foreign key to users table for the activity owner
ALTER TABLE "agent_activities"
  ADD CONSTRAINT "agent_activities_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add foreign key to users table for the actor
ALTER TABLE "agent_activities"
  ADD CONSTRAINT "agent_activities_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Index for fetching activities by user, ordered by creation date (activity feed)
CREATE INDEX "idx_agent_activities_user_created"
  ON "agent_activities"("user_id", "created_at" DESC);

-- Index for fetching unread activities by user
CREATE INDEX "idx_agent_activities_user_read"
  ON "agent_activities"("user_id", "read");
