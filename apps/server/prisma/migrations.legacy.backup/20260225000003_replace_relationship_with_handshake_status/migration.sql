-- Replace UserRelationship enum with HandshakeStatus enum

-- Step 1: Create the new enum
CREATE TYPE "enum_handshake_status" AS ENUM (
  'accepting_requests',
  'network_stable',
  'selective',
  'under_maintenance',
  'not_accepting',
  'not_informed'
);

-- Step 2: Add the new column
ALTER TABLE "users" ADD COLUMN "handshake_status" "enum_handshake_status" DEFAULT 'not_informed';

-- Step 3: Migrate data from relationship to handshake_status
UPDATE "users" SET "handshake_status" =
  CASE "relationship"
    WHEN 'solteiro' THEN 'accepting_requests'::"enum_handshake_status"
    WHEN 'namorando' THEN 'network_stable'::"enum_handshake_status"
    WHEN 'casado' THEN 'network_stable'::"enum_handshake_status"
    WHEN 'noivado' THEN 'network_stable'::"enum_handshake_status"
    WHEN 'uniao_estavel' THEN 'network_stable'::"enum_handshake_status"
    WHEN 'relacionamento_aberto' THEN 'selective'::"enum_handshake_status"
    ELSE 'not_informed'::"enum_handshake_status"
  END;

-- Step 4: Drop the old column
ALTER TABLE "users" DROP COLUMN "relationship";

-- Step 5: Drop the old enum
DROP TYPE IF EXISTS "enum_users_relationship";
