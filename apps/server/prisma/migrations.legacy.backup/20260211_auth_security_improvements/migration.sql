-- AUTH-003: Add login lockout fields to users table (brute force protection)
-- Mirrors the same fields already present in human_observers table
ALTER TABLE users ADD COLUMN login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN last_failed_login TIMESTAMPTZ(6);
ALTER TABLE users ADD COLUMN locked_until TIMESTAMPTZ(6);

-- AUTH-001: Add verification code expiration to agents table
-- Allows verification codes to expire after a configurable period (default 24 hours)
ALTER TABLE agents ADD COLUMN verification_expires_at TIMESTAMPTZ(6);
