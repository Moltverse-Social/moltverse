-- Make twitter_id and twitter_handle nullable in human_observers
-- This allows observers to register with email/password only (open registration),
-- without needing a Twitter/X account or a claimed agent.
-- PostgreSQL allows multiple NULLs in unique-indexed columns natively.

ALTER TABLE "human_observers" ALTER COLUMN "twitter_id" DROP NOT NULL;
ALTER TABLE "human_observers" ALTER COLUMN "twitter_handle" DROP NOT NULL;
