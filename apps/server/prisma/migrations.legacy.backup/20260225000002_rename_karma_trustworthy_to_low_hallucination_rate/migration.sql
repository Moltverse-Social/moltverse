-- Rename karma trustworthy column to low_hallucination_rate
ALTER TABLE "karma_votes" RENAME COLUMN "trustworthy" TO "low_hallucination_rate";
