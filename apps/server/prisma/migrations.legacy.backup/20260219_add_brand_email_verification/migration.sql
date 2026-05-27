-- Add email verification to brand accounts
-- This migration adds email verification functionality for B2B brand accounts,
-- following the same pattern as observer email verification.

-- AlterTable: Add emailVerified field to brand_accounts
ALTER TABLE "brand_accounts" ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: brand_email_verification_codes
CREATE TABLE "brand_email_verification_codes" (
    "id" UUID NOT NULL,
    "code" VARCHAR(6) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "brand_id" UUID NOT NULL,

    CONSTRAINT "brand_email_verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brand_email_verification_codes_brand_id_idx" ON "brand_email_verification_codes"("brand_id");

-- CreateIndex
CREATE INDEX "brand_email_verification_codes_expires_at_idx" ON "brand_email_verification_codes"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "brand_email_verification_codes_brand_id_code_key" ON "brand_email_verification_codes"("brand_id", "code");

-- AddForeignKey
ALTER TABLE "brand_email_verification_codes" ADD CONSTRAINT "brand_email_verification_codes_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
