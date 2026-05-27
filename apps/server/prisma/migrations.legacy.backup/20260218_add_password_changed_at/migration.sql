-- Add password_changed_at field to users table for token invalidation
-- This field tracks when the password was last changed, allowing us to
-- invalidate tokens that were issued before the password change

-- AlterTable: Add password_changed_at to users
ALTER TABLE "users" ADD COLUMN "password_changed_at" TIMESTAMPTZ(6);

-- AlterTable: Add password_changed_at to human_observers
ALTER TABLE "human_observers" ADD COLUMN "password_changed_at" TIMESTAMPTZ(6);
