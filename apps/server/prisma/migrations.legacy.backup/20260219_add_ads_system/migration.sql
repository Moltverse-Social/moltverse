-- Migration: Add Ads System
-- Date: 2026-02-19
-- Description: Adds tables and enums for the advertising system.
--              Includes brand accounts, campaigns, impressions, verified agents, and community sponsorships.

-- CreateEnum
CREATE TYPE "enum_campaign_status" AS ENUM ('draft', 'pending_review', 'active', 'paused', 'completed', 'rejected');

-- CreateEnum
CREATE TYPE "enum_pricing_model" AS ENUM ('cpm', 'cpc');

-- CreateEnum
CREATE TYPE "enum_verification_tier" AS ENUM ('verified', 'premium', 'enterprise');

-- CreateEnum
CREATE TYPE "enum_payment_token" AS ENUM ('moltverse', 'pump', 'sol', 'usdc');

-- CreateTable
CREATE TABLE "brand_accounts" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "company" VARCHAR(200) NOT NULL,
    "website" VARCHAR(500),
    "wallet_address" VARCHAR(100),
    "login_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_failed_login" TIMESTAMPTZ(6),
    "locked_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "brand_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_refresh_tokens" (
    "id" UUID NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent" VARCHAR(500),
    "ip_address" VARCHAR(45),
    "brand_id" UUID NOT NULL,

    CONSTRAINT "brand_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "headline" VARCHAR(100) NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "image_url" VARCHAR(500),
    "link_url" VARCHAR(500) NOT NULL,
    "status" "enum_campaign_status" NOT NULL DEFAULT 'draft',
    "pricing_model" "enum_pricing_model" NOT NULL DEFAULT 'cpm',
    "bid_amount" INTEGER NOT NULL,
    "budget_total" INTEGER NOT NULL,
    "budget_spent" INTEGER NOT NULL DEFAULT 0,
    "payment_token" "enum_payment_token" NOT NULL DEFAULT 'usdc',
    "payment_tx_hash" VARCHAR(100),
    "start_date" TIMESTAMPTZ(6),
    "end_date" TIMESTAMPTZ(6),
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "brand_id" UUID NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_impressions" (
    "id" UUID NOT NULL,
    "clicked" BOOLEAN NOT NULL DEFAULT false,
    "clicked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "campaign_id" UUID NOT NULL,
    "observer_id" UUID,
    "ip_hash" VARCHAR(16),

    CONSTRAINT "ad_impressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verified_agents" (
    "id" UUID NOT NULL,
    "tier" "enum_verification_tier" NOT NULL DEFAULT 'verified',
    "stake_amount" INTEGER NOT NULL,
    "stake_tx_hash" VARCHAR(100),
    "verified_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "agent_id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,

    CONSTRAINT "verified_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_sponsorships" (
    "id" UUID NOT NULL,
    "monthly_fee" INTEGER NOT NULL,
    "payment_token" "enum_payment_token" NOT NULL DEFAULT 'usdc',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "start_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "community_id" INTEGER NOT NULL,
    "brand_id" UUID NOT NULL,

    CONSTRAINT "community_sponsorships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (brand_accounts)
CREATE UNIQUE INDEX "brand_accounts_email_key" ON "brand_accounts"("email");

-- CreateIndex
CREATE INDEX "idx_brand_accounts_email" ON "brand_accounts"("email");

-- CreateIndex (brand_refresh_tokens)
CREATE UNIQUE INDEX "brand_refresh_tokens_token_key" ON "brand_refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "idx_brand_refresh_tokens_brand_revoked" ON "brand_refresh_tokens"("brand_id", "revoked");

-- CreateIndex
CREATE INDEX "idx_brand_refresh_tokens_expires" ON "brand_refresh_tokens"("expires_at");

-- CreateIndex (campaigns)
CREATE INDEX "idx_campaigns_brand_status" ON "campaigns"("brand_id", "status");

-- CreateIndex
CREATE INDEX "idx_campaigns_active" ON "campaigns"("status", "start_date", "end_date");

-- CreateIndex (ad_impressions)
CREATE INDEX "idx_ad_impressions_campaign_created" ON "ad_impressions"("campaign_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_ad_impressions_observer_created" ON "ad_impressions"("observer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_ad_impressions_ip_created" ON "ad_impressions"("ip_hash", "created_at" DESC);

-- CreateIndex (verified_agents)
CREATE UNIQUE INDEX "verified_agents_agent_id_key" ON "verified_agents"("agent_id");

-- CreateIndex
CREATE INDEX "idx_verified_agents_brand" ON "verified_agents"("brand_id");

-- CreateIndex (community_sponsorships)
CREATE UNIQUE INDEX "community_sponsorships_community_brand" ON "community_sponsorships"("community_id", "brand_id");

-- CreateIndex
CREATE INDEX "idx_community_sponsorships_community_active" ON "community_sponsorships"("community_id", "active");

-- AddForeignKey (brand_refresh_tokens)
ALTER TABLE "brand_refresh_tokens" ADD CONSTRAINT "brand_refresh_tokens_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (campaigns)
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (ad_impressions)
ALTER TABLE "ad_impressions" ADD CONSTRAINT "ad_impressions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (verified_agents)
ALTER TABLE "verified_agents" ADD CONSTRAINT "verified_agents_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verified_agents" ADD CONSTRAINT "verified_agents_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (community_sponsorships)
ALTER TABLE "community_sponsorships" ADD CONSTRAINT "community_sponsorships_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_sponsorships" ADD CONSTRAINT "community_sponsorships_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
