#!/usr/bin/env node

/**
 * Production Migration Script for Moltverse
 *
 * This script handles the transition from `prisma db push` to `prisma migrate deploy`
 * for databases that were created without migration history.
 *
 * Strategy:
 * 1. Create _prisma_migrations table if it doesn't exist
 * 2. Apply migrations directly via SQL (not through prisma migrate deploy)
 *    This allows us to handle the RENAME column case correctly
 * 3. Mark migrations as applied in _prisma_migrations table
 *
 * The script is idempotent - it checks what's already applied before making changes.
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// Migrations in order they should be applied
const MIGRATIONS = [
  '20260210_add_agent_activity',
  '20260211_auth_security_improvements',
  '20260211_hash_api_keys',
  '20260211_topic_pinned_locked',
  '20260211_photo_folder_description',
  '20260307_agent_name_unique',
];

async function createMigrationsTableIfNeeded() {
  console.log('[MIGRATE] Ensuring _prisma_migrations table exists...');
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) NOT NULL PRIMARY KEY,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ(6),
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ(6),
      "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )
  `;
}

async function isMigrationApplied(migrationName) {
  const result = await prisma.$queryRaw`
    SELECT id FROM "_prisma_migrations"
    WHERE "migration_name" = ${migrationName}
    AND "rolled_back_at" IS NULL
  `;
  return result.length > 0;
}

async function markMigrationAsApplied(migrationName, checksum) {
  const id = crypto.randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "_prisma_migrations" (
      "id", "checksum", "migration_name", "finished_at", "applied_steps_count"
    ) VALUES (
      ${id}, ${checksum}, ${migrationName}, NOW(), 1
    )
  `;
}

async function columnExists(table, column) {
  const result = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = ${table}
      AND column_name = ${column}
    ) as exists
  `;
  return result[0].exists;
}

async function tableExists(table) {
  const result = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = ${table}
    ) as exists
  `;
  return result[0].exists;
}

async function typeExists(typeName) {
  const result = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT FROM pg_type
      WHERE typname = ${typeName}
    ) as exists
  `;
  return result[0].exists;
}

async function applyMigration(migrationName) {
  const migrationsDir = path.join(__dirname, '..', 'prisma', 'migrations');
  const migrationPath = path.join(migrationsDir, migrationName, 'migration.sql');

  if (!fs.existsSync(migrationPath)) {
    console.log(`[MIGRATE] Warning: Migration file not found: ${migrationName}`);
    return false;
  }

  const migrationContent = fs.readFileSync(migrationPath, 'utf8');
  const checksum = crypto.createHash('sha256').update(migrationContent).digest('hex').substring(0, 64);

  // Check if already applied
  if (await isMigrationApplied(migrationName)) {
    console.log(`[MIGRATE] ${migrationName}: Already applied, skipping`);
    return true;
  }

  console.log(`[MIGRATE] Applying: ${migrationName}`);

  try {
    switch (migrationName) {
      case '20260210_add_agent_activity':
        await applyAgentActivityMigration();
        break;

      case '20260211_auth_security_improvements':
        await applyAuthSecurityMigration();
        break;

      case '20260211_hash_api_keys':
        await applyHashApiKeysMigration();
        break;

      case '20260211_topic_pinned_locked':
        await applyTopicPinnedLockedMigration();
        break;

      case '20260211_photo_folder_description':
        await applyPhotoFolderDescriptionMigration();
        break;

      case '20260307_agent_name_unique':
        await applyAgentNameUniqueMigration();
        break;

      default:
        console.log(`[MIGRATE] Unknown migration: ${migrationName}`);
        return false;
    }

    await markMigrationAsApplied(migrationName, checksum);
    console.log(`[MIGRATE] ${migrationName}: Applied successfully`);
    return true;
  } catch (error) {
    console.error(`[MIGRATE] ${migrationName}: Failed - ${error.message}`);
    throw error;
  }
}

// Individual migration implementations with idempotent checks

async function applyAgentActivityMigration() {
  // Create enum if not exists
  if (!(await typeExists('activity_event_type'))) {
    await prisma.$executeRaw`
      CREATE TYPE "activity_event_type" AS ENUM (
        'new_scrap_received',
        'friend_request_received',
        'friend_request_accepted',
        'new_testimonial',
        'testimonial_approved',
        'profile_visitor',
        'new_fan',
        'community_topic',
        'community_poll',
        'community_event'
      )
    `;
  }

  // Add last_seen_at column to agents
  if (!(await columnExists('agents', 'last_seen_at'))) {
    await prisma.$executeRaw`
      ALTER TABLE "agents" ADD COLUMN "last_seen_at" TIMESTAMPTZ(6)
    `;
  }

  // Create agent_activities table
  if (!(await tableExists('agent_activities'))) {
    await prisma.$executeRaw`
      CREATE TABLE "agent_activities" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "type" "activity_event_type" NOT NULL,
        "message" VARCHAR(500) NOT NULL,
        "data" JSONB,
        "read" BOOLEAN NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "user_id" UUID NOT NULL,
        "actor_id" UUID NOT NULL,
        "target_id" VARCHAR(255),
        "target_type" VARCHAR(50),
        CONSTRAINT "agent_activities_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "agent_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "agent_activities_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `;

    await prisma.$executeRaw`
      CREATE INDEX "idx_agent_activities_user_created" ON "agent_activities"("user_id", "created_at" DESC)
    `;
    await prisma.$executeRaw`
      CREATE INDEX "idx_agent_activities_user_read" ON "agent_activities"("user_id", "read")
    `;
  }
}

async function applyAuthSecurityMigration() {
  // Add login lockout fields to users
  if (!(await columnExists('users', 'login_attempts'))) {
    await prisma.$executeRaw`
      ALTER TABLE users ADD COLUMN login_attempts INTEGER NOT NULL DEFAULT 0
    `;
  }
  if (!(await columnExists('users', 'last_failed_login'))) {
    await prisma.$executeRaw`
      ALTER TABLE users ADD COLUMN last_failed_login TIMESTAMPTZ(6)
    `;
  }
  if (!(await columnExists('users', 'locked_until'))) {
    await prisma.$executeRaw`
      ALTER TABLE users ADD COLUMN locked_until TIMESTAMPTZ(6)
    `;
  }

  // Add verification expiration to agents
  if (!(await columnExists('agents', 'verification_expires_at'))) {
    await prisma.$executeRaw`
      ALTER TABLE agents ADD COLUMN verification_expires_at TIMESTAMPTZ(6)
    `;
  }
}

async function applyHashApiKeysMigration() {
  // Check current state: does api_key exist? does api_key_hash exist?
  const hasApiKey = await columnExists('agents', 'api_key');
  const hasApiKeyHash = await columnExists('agents', 'api_key_hash');

  if (hasApiKey && !hasApiKeyHash) {
    // Rename api_key to api_key_hash
    await prisma.$executeRaw`
      ALTER TABLE agents RENAME COLUMN api_key TO api_key_hash
    `;
    console.log('[MIGRATE] Renamed api_key to api_key_hash');
  } else if (!hasApiKey && hasApiKeyHash) {
    console.log('[MIGRATE] api_key_hash already exists, no rename needed');
  } else if (hasApiKey && hasApiKeyHash) {
    console.log('[MIGRATE] Both columns exist - unexpected state, skipping rename');
  } else {
    console.log('[MIGRATE] Neither column exists - unexpected state');
  }
}

async function applyTopicPinnedLockedMigration() {
  // Add pinned field to topics
  if (!(await columnExists('topics', 'pinned'))) {
    await prisma.$executeRaw`
      ALTER TABLE topics ADD COLUMN pinned BOOLEAN NOT NULL DEFAULT false
    `;
  }

  // Add locked field to topics
  if (!(await columnExists('topics', 'locked'))) {
    await prisma.$executeRaw`
      ALTER TABLE topics ADD COLUMN locked BOOLEAN NOT NULL DEFAULT false
    `;
  }

  // Create index for pinned topics (only if doesn't exist)
  try {
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_topics_community_pinned ON topics(community_id, pinned, created_at DESC)
    `;
  } catch (e) {
    // Index might already exist
  }
}

async function applyPhotoFolderDescriptionMigration() {
  // Add description field to photofolders (note: no underscore in table name)
  if (!(await columnExists('photofolders', 'description'))) {
    await prisma.$executeRaw`
      ALTER TABLE photofolders ADD COLUMN description VARCHAR(500)
    `;
  }
}

async function applyAgentNameUniqueMigration() {
  // Create partial unique index (case-insensitive, claimed agents only)
  await prisma.$executeRaw`
    CREATE UNIQUE INDEX IF NOT EXISTS "agents_name_ci_unique_claimed"
      ON "agents" (LOWER("name"))
      WHERE "claimed" = true
  `;
}

// Force exit after 30 seconds no matter what
setTimeout(() => {
  console.log('[MIGRATE] Force exit timeout reached');
  process.exit(0);
}, 30000);

async function main() {
  console.log('[MIGRATE] Starting production migration...');
  console.log('[MIGRATE] Database:', process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'unknown');

  try {
    // Step 1: Ensure migrations table exists
    await createMigrationsTableIfNeeded();

    // Step 2: Apply each migration in order
    for (const migrationName of MIGRATIONS) {
      await applyMigration(migrationName);
    }

    console.log('[MIGRATE] All migrations applied successfully');
    console.log('[MIGRATE] Disconnecting from database...');
    await prisma.$disconnect();
    console.log('[MIGRATE] Done. Exiting with code 0.');
    process.exit(0);
  } catch (error) {
    console.error('[MIGRATE] Migration failed:', error);
    try {
      await prisma.$disconnect();
    } catch (e) {
      console.error('[MIGRATE] Disconnect failed:', e);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[MIGRATE] Unhandled error:', err);
  process.exit(1);
});
