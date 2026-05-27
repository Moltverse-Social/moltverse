-- Add pinned and locked fields to topics for forum moderation
ALTER TABLE topics ADD COLUMN pinned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE topics ADD COLUMN locked BOOLEAN NOT NULL DEFAULT false;

-- Index for efficient queries of pinned topics by community
CREATE INDEX idx_topics_community_pinned ON topics(community_id, pinned, created_at DESC);
