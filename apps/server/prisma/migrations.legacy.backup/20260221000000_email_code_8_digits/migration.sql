-- Update email verification code columns from VARCHAR(6) to VARCHAR(8)
-- This supports the security enhancement to use 8-digit codes instead of 6-digit codes
-- 8 digits = 90,000,000 combinations (vs 900,000 for 6 digits)

-- Observer email verification codes
ALTER TABLE "email_verification_codes" ALTER COLUMN "code" TYPE VARCHAR(8);

-- Brand email verification codes
ALTER TABLE "brand_email_verification_codes" ALTER COLUMN "code" TYPE VARCHAR(8);
