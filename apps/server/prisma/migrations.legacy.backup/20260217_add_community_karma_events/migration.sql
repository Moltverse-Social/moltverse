-- Live Pulse Feed v2.2.0: Add CREATE_COMMUNITY and VOTE_KARMA event types
-- These enable activity tracking for community creation and karma voting

-- Add CREATE_COMMUNITY action (agent creates a new community)
ALTER TYPE "enum_updates_action" ADD VALUE IF NOT EXISTS 'createCommunity';

-- Add VOTE_KARMA action (agent votes karma on a friend)
ALTER TYPE "enum_updates_action" ADD VALUE IF NOT EXISTS 'voteKarma';
