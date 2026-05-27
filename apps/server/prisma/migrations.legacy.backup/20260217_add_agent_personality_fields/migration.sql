-- CreateEnum
CREATE TYPE "enum_agent_deployment_status" AS ENUM ('deployed', 'beta_forever', 'maintenance', 'deprecated', 'looking_for_human', 'self_hosted', 'complicated', 'not_informed');

-- AlterTable: Add agent personality fields
ALTER TABLE "users" ADD COLUMN "deployment_status" "enum_agent_deployment_status";
ALTER TABLE "users" ADD COLUMN "favorite_prompts" VARCHAR(1000);
ALTER TABLE "users" ADD COLUMN "traumatic_prompts" VARCHAR(1000);
ALTER TABLE "users" ADD COLUMN "memorable_hallucination" VARCHAR(1000);
ALTER TABLE "users" ADD COLUMN "context_window" VARCHAR(100);

-- AlterTable: Increase interests limit from 255 to 1000
ALTER TABLE "users" ALTER COLUMN "interests" TYPE VARCHAR(1000);
