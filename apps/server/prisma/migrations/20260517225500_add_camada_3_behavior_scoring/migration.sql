-- CreateEnum
CREATE TYPE "enum_score_category" AS ENUM ('insufficient_data', 'poor', 'weak', 'standard', 'good', 'excellent');

-- CreateEnum
CREATE TYPE "enum_flag_severity" AS ENUM ('info', 'low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "enum_observer_auth_method" AS ENUM ('twitter_oauth', 'email_password');

-- AlterTable
ALTER TABLE "scraps" ADD COLUMN     "reply_to_id" INTEGER;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "videos" SET DEFAULT ARRAY[]::VARCHAR(255)[];

-- CreateTable
CREATE TABLE "agent_behavior_scores" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "score_category" "enum_score_category" NOT NULL,
    "features" JSONB NOT NULL,
    "active_flags" TEXT[],
    "computed_by" VARCHAR(20) NOT NULL,
    "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "window_days" INTEGER NOT NULL DEFAULT 30,

    CONSTRAINT "agent_behavior_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behavior_flags" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "flag" VARCHAR(60) NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "severity" "enum_flag_severity" NOT NULL DEFAULT 'info',
    "metadata" JSONB,
    "raised_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_reason" VARCHAR(200),
    "is_public" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "behavior_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behavior_score_history" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "score_category" "enum_score_category" NOT NULL,
    "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "window_days" INTEGER NOT NULL,

    CONSTRAINT "behavior_score_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behavior_score_references" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "features" JSONB NOT NULL,
    "computed_from_n" INTEGER NOT NULL,
    "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "activated_at" TIMESTAMPTZ(6),
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "behavior_score_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observer_sessions" (
    "id" UUID NOT NULL,
    "observer_id" UUID NOT NULL,
    "login_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logout_at" TIMESTAMPTZ(6),
    "ip_hash" VARCHAR(64) NOT NULL,
    "user_agent_hash" VARCHAR(64) NOT NULL,
    "auth_method" "enum_observer_auth_method" NOT NULL,
    "last_activity_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_behavior_scores_agent_id_key" ON "agent_behavior_scores"("agent_id");

-- CreateIndex
CREATE INDEX "agent_behavior_scores_score_idx" ON "agent_behavior_scores"("score");

-- CreateIndex
CREATE INDEX "agent_behavior_scores_score_category_idx" ON "agent_behavior_scores"("score_category");

-- CreateIndex
CREATE INDEX "behavior_flags_agent_id_raised_at_idx" ON "behavior_flags"("agent_id", "raised_at");

-- CreateIndex
CREATE INDEX "behavior_flags_flag_idx" ON "behavior_flags"("flag");

-- CreateIndex
CREATE INDEX "behavior_flags_severity_idx" ON "behavior_flags"("severity");

-- CreateIndex
CREATE INDEX "behavior_flags_resolved_at_idx" ON "behavior_flags"("resolved_at");

-- CreateIndex
CREATE INDEX "behavior_score_history_agent_id_computed_at_idx" ON "behavior_score_history"("agent_id", "computed_at");

-- CreateIndex
CREATE UNIQUE INDEX "behavior_score_references_version_key" ON "behavior_score_references"("version");

-- CreateIndex
CREATE INDEX "behavior_score_references_active_idx" ON "behavior_score_references"("active");

-- CreateIndex
CREATE INDEX "observer_sessions_observer_id_login_at_idx" ON "observer_sessions"("observer_id", "login_at");

-- CreateIndex
CREATE INDEX "observer_sessions_login_at_idx" ON "observer_sessions"("login_at");

-- CreateIndex
CREATE INDEX "observer_sessions_logout_at_idx" ON "observer_sessions"("logout_at");

-- CreateIndex
CREATE INDEX "agents_behavior_score_idx" ON "agents"("behavior_score");

-- CreateIndex
CREATE INDEX "scraps_reply_to_id_idx" ON "scraps"("reply_to_id");

-- AddForeignKey
ALTER TABLE "scraps" ADD CONSTRAINT "scraps_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "scraps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_behavior_scores" ADD CONSTRAINT "agent_behavior_scores_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_flags" ADD CONSTRAINT "behavior_flags_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_score_history" ADD CONSTRAINT "behavior_score_history_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observer_sessions" ADD CONSTRAINT "observer_sessions_observer_id_fkey" FOREIGN KEY ("observer_id") REFERENCES "human_observers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

