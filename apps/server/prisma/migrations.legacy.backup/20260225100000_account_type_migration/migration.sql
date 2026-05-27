-- AccountType Migration
-- Migrates from separate BrandAccount to unified User model with AccountType

-- Step 1: Create the AccountType enum
CREATE TYPE "enum_account_type" AS ENUM ('personal', 'business');

-- Step 2: Add new columns to users table
ALTER TABLE "users" ADD COLUMN "account_type" "enum_account_type" NOT NULL DEFAULT 'personal';
ALTER TABLE "users" ADD COLUMN "company" VARCHAR(200);
ALTER TABLE "users" ADD COLUMN "company_website" VARCHAR(500);
ALTER TABLE "users" ADD COLUMN "wallet_address" VARCHAR(100);

-- Step 3: Add advertiser_id column to campaigns table (nullable initially for migration)
ALTER TABLE "campaigns" ADD COLUMN "advertiser_id" UUID;

-- Step 4: Add advertiser_id column to verified_agents table (nullable initially for migration)
ALTER TABLE "verified_agents" ADD COLUMN "advertiser_id" UUID;

-- Step 5: Add sponsor_id column to community_sponsorships table (nullable initially for migration)
ALTER TABLE "community_sponsorships" ADD COLUMN "sponsor_id" UUID;

-- Step 6: Add foreign key constraints
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_advertiser_id_fkey"
  FOREIGN KEY ("advertiser_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "verified_agents" ADD CONSTRAINT "verified_agents_advertiser_id_fkey"
  FOREIGN KEY ("advertiser_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "community_sponsorships" ADD CONSTRAINT "community_sponsorships_sponsor_id_fkey"
  FOREIGN KEY ("sponsor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 7: Create indexes for new columns
CREATE INDEX "idx_campaigns_advertiser_status" ON "campaigns"("advertiser_id", "status");
CREATE INDEX "idx_verified_agents_advertiser" ON "verified_agents"("advertiser_id");

-- Step 8: Update unique constraint on community_sponsorships
-- First drop the old constraint
ALTER TABLE "community_sponsorships" DROP CONSTRAINT IF EXISTS "community_sponsorships_community_brand";

-- Add new unique constraint
CREATE UNIQUE INDEX "community_sponsorships_community_sponsor" ON "community_sponsorships"("community_id", "sponsor_id");

-- Note: The following tables are being deprecated and should be dropped after data migration:
-- - brand_accounts
-- - brand_refresh_tokens
-- - brand_email_verification_codes
--
-- If there is existing data in these tables, it should be migrated first.
-- For now, we keep them to avoid data loss. They can be dropped in a future migration.

-- Step 9: Drop old foreign key constraints and columns (only if no data exists)
-- WARNING: Run these only after verifying no important data exists in brand tables

-- Check if brand_accounts has data before proceeding
DO $$
DECLARE
  brand_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO brand_count FROM brand_accounts;

  IF brand_count = 0 THEN
    -- Safe to drop brand-related constraints and columns

    -- Drop foreign keys
    ALTER TABLE "campaigns" DROP CONSTRAINT IF EXISTS "campaigns_brand_id_fkey";
    ALTER TABLE "verified_agents" DROP CONSTRAINT IF EXISTS "verified_agents_brand_id_fkey";
    ALTER TABLE "community_sponsorships" DROP CONSTRAINT IF EXISTS "community_sponsorships_brand_id_fkey";

    -- Drop indexes
    DROP INDEX IF EXISTS "idx_campaigns_brand_status";
    DROP INDEX IF EXISTS "idx_verified_agents_brand";

    -- Drop brand_id columns
    ALTER TABLE "campaigns" DROP COLUMN IF EXISTS "brand_id";
    ALTER TABLE "verified_agents" DROP COLUMN IF EXISTS "brand_id";
    ALTER TABLE "community_sponsorships" DROP COLUMN IF EXISTS "brand_id";

    -- Make new columns NOT NULL (since we're dropping the old ones)
    ALTER TABLE "campaigns" ALTER COLUMN "advertiser_id" SET NOT NULL;
    ALTER TABLE "verified_agents" ALTER COLUMN "advertiser_id" SET NOT NULL;
    ALTER TABLE "community_sponsorships" ALTER COLUMN "sponsor_id" SET NOT NULL;

    -- Drop brand tables
    DROP TABLE IF EXISTS "brand_email_verification_codes";
    DROP TABLE IF EXISTS "brand_refresh_tokens";
    DROP TABLE IF EXISTS "brand_accounts";

    RAISE NOTICE 'Brand tables dropped successfully (no data existed)';
  ELSE
    RAISE NOTICE 'Brand tables contain % records. Manual migration required before dropping.', brand_count;
  END IF;
END $$;
