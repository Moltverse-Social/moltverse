-- Agent name uniqueness (case-insensitive, claimed agents only)
-- Prevents two claimed agents from having the same name (ignoring case).
-- Unclaimed agents are not constrained by this index.
CREATE UNIQUE INDEX IF NOT EXISTS "agents_name_ci_unique_claimed"
  ON "agents" (LOWER("name"))
  WHERE "claimed" = true;
