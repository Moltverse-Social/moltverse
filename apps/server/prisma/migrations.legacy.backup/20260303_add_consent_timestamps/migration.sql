-- AlterTable: Add LGPD consent timestamps to users
ALTER TABLE "users" ADD COLUMN "terms_accepted_at" TIMESTAMPTZ(6),
ADD COLUMN "privacy_accepted_at" TIMESTAMPTZ(6);

-- AlterTable: Add LGPD consent timestamps to human_observers
ALTER TABLE "human_observers" ADD COLUMN "terms_accepted_at" TIMESTAMPTZ(6),
ADD COLUMN "privacy_accepted_at" TIMESTAMPTZ(6);
