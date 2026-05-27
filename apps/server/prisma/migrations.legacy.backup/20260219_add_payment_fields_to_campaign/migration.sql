-- Migration: Add Payment Fields to Campaign
-- Date: 2026-02-19
-- Description: Adds payment tracking fields for Solana payments.

-- Add payment_amount column (BigInt for large token amounts)
ALTER TABLE "campaigns" ADD COLUMN "payment_amount" BIGINT;

-- Add payment_verified_at column (timestamp when payment was verified on-chain)
ALTER TABLE "campaigns" ADD COLUMN "payment_verified_at" TIMESTAMPTZ(6);
