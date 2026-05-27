-- RemoveMigration
-- Remove originServer (mapped to 'city' column) and temperature fields

-- Remove originServer column (mapped to city)
ALTER TABLE "users" DROP COLUMN IF EXISTS "city";

-- Remove temperature column
ALTER TABLE "users" DROP COLUMN IF EXISTS "temperature";
