-- Rollback: Remove Ads System
-- Date: 2026-02-19
-- Description: Reverses the ads system migration.
-- WARNING: This will permanently delete all ads data (campaigns, impressions, etc.)

-- DropForeignKey (community_sponsorships)
ALTER TABLE "community_sponsorships" DROP CONSTRAINT IF EXISTS "community_sponsorships_brand_id_fkey";
ALTER TABLE "community_sponsorships" DROP CONSTRAINT IF EXISTS "community_sponsorships_community_id_fkey";

-- DropForeignKey (verified_agents)
ALTER TABLE "verified_agents" DROP CONSTRAINT IF EXISTS "verified_agents_brand_id_fkey";
ALTER TABLE "verified_agents" DROP CONSTRAINT IF EXISTS "verified_agents_agent_id_fkey";

-- DropForeignKey (ad_impressions)
ALTER TABLE "ad_impressions" DROP CONSTRAINT IF EXISTS "ad_impressions_campaign_id_fkey";

-- DropForeignKey (campaigns)
ALTER TABLE "campaigns" DROP CONSTRAINT IF EXISTS "campaigns_brand_id_fkey";

-- DropForeignKey (brand_refresh_tokens)
ALTER TABLE "brand_refresh_tokens" DROP CONSTRAINT IF EXISTS "brand_refresh_tokens_brand_id_fkey";

-- DropIndex (community_sponsorships)
DROP INDEX IF EXISTS "idx_community_sponsorships_community_active";
DROP INDEX IF EXISTS "community_sponsorships_community_brand";

-- DropIndex (verified_agents)
DROP INDEX IF EXISTS "idx_verified_agents_brand";
DROP INDEX IF EXISTS "verified_agents_agent_id_key";

-- DropIndex (ad_impressions)
DROP INDEX IF EXISTS "idx_ad_impressions_ip_created";
DROP INDEX IF EXISTS "idx_ad_impressions_observer_created";
DROP INDEX IF EXISTS "idx_ad_impressions_campaign_created";

-- DropIndex (campaigns)
DROP INDEX IF EXISTS "idx_campaigns_active";
DROP INDEX IF EXISTS "idx_campaigns_brand_status";

-- DropIndex (brand_refresh_tokens)
DROP INDEX IF EXISTS "idx_brand_refresh_tokens_expires";
DROP INDEX IF EXISTS "idx_brand_refresh_tokens_brand_revoked";

-- DropIndex (brand_accounts)
DROP INDEX IF EXISTS "idx_brand_accounts_email";
DROP INDEX IF EXISTS "brand_accounts_email_key";

-- DropTable
DROP TABLE IF EXISTS "community_sponsorships";
DROP TABLE IF EXISTS "verified_agents";
DROP TABLE IF EXISTS "ad_impressions";
DROP TABLE IF EXISTS "campaigns";
DROP TABLE IF EXISTS "brand_refresh_tokens";
DROP TABLE IF EXISTS "brand_accounts";

-- DropEnum
DROP TYPE IF EXISTS "enum_payment_token";
DROP TYPE IF EXISTS "enum_verification_tier";
DROP TYPE IF EXISTS "enum_pricing_model";
DROP TYPE IF EXISTS "enum_campaign_status";
