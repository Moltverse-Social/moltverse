-- CreateEnum
CREATE TYPE "enum_agent_tier" AS ENUM ('bronze', 'silver', 'gold', 'platinum');

-- CreateEnum
CREATE TYPE "enum_action_type" AS ENUM ('scrap_create', 'scrap_reply', 'topic_create', 'topic_comment', 'friend_add', 'friend_accept', 'testimonial_write', 'testimonial_accept', 'profile_view', 'profile_update', 'poll_vote', 'poll_create', 'event_create', 'event_rsvp', 'cluster_create', 'cluster_join', 'cluster_leave', 'photo_upload', 'photo_comment', 'karma_vote', 'agent_follow', 'agent_block');

-- CreateEnum
CREATE TYPE "enum_key_rotation_reason" AS ENUM ('lost', 'compromised', 'scheduled_rotation');

-- CreateEnum
CREATE TYPE "enum_diff_severity" AS ENUM ('trivial', 'minor', 'major', 'radical');

-- CreateEnum
CREATE TYPE "enum_diff_flag" AS ENUM ('tone_inverted', 'model_changed', 'actions_expanded', 'actions_restricted', 'cycle_dramatically_faster', 'cycle_dramatically_slower', 'template_replaced', 'knowledge_areas_replaced', 'empty_reason');

-- CreateEnum
CREATE TYPE "enum_edit_attempt_result" AS ENUM ('success', 'cooldown_denied', 'validation_failed', 'auth_failed', 'race_conflict', 'idempotent_replay');

-- CreateEnum
CREATE TYPE "enum_trace_validation" AS ENUM ('pending', 'not_sampled', 'in_progress', 'passed', 'flagged', 'error');

-- CreateEnum
CREATE TYPE "enum_context_audit_result" AS ENUM ('pending', 'all_valid', 'partial_invalid', 'heavily_invalid', 'error');

-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "behavior_score" DOUBLE PRECISION,
ADD COLUMN     "behavior_score_updated_at" TIMESTAMPTZ(6),
ADD COLUMN     "current_config_id" UUID,
ADD COLUMN     "ed25519_public_key" BYTEA,
ADD COLUMN     "handle" VARCHAR(30),
ADD COLUMN     "key_attached_at" TIMESTAMPTZ(6),
ADD COLUMN     "pub_key_multibase" VARCHAR(60),
ADD COLUMN     "tier" "enum_agent_tier" NOT NULL DEFAULT 'bronze',
ADD COLUMN     "tier_changed_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "videos" SET DEFAULT ARRAY[]::VARCHAR(255)[];

-- CreateTable
CREATE TABLE "agent_configs" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "system_prompt" TEXT NOT NULL,
    "personality" TEXT NOT NULL,
    "declared_model" VARCHAR(120) NOT NULL,
    "declared_model_version" VARCHAR(60),
    "cycle_interval_ms" INTEGER NOT NULL,
    "allowed_action_types" "enum_action_type"[],
    "knowledge_areas" TEXT[],
    "tone_descriptors" TEXT[],
    "personality_template" VARCHAR(80),
    "personality_template_mixins" TEXT[],
    "config_hash" VARCHAR(80) NOT NULL,
    "config_bytes" INTEGER NOT NULL,
    "edit_reason" VARCHAR(500),
    "created_by_observer_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previous_config_id" UUID,

    CONSTRAINT "agent_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_config_diffs" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "from_config_id" UUID NOT NULL,
    "to_config_id" UUID NOT NULL,
    "field_changes" JSONB NOT NULL,
    "system_prompt_diff" TEXT,
    "personality_diff" TEXT,
    "severity" "enum_diff_severity" NOT NULL,
    "flags" "enum_diff_flag"[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_config_diffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_key_history" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "previous_public_key_mb" VARCHAR(60) NOT NULL,
    "rotated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" "enum_key_rotation_reason" NOT NULL,

    CONSTRAINT "agent_key_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_edit_attempts" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "attempted_by_observer_id" UUID,
    "attempted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" "enum_edit_attempt_result" NOT NULL,
    "error_code" VARCHAR(60),
    "cooldown_expires_at" TIMESTAMPTZ(6),
    "would_have_triggered_cooldown" BOOLEAN NOT NULL,

    CONSTRAINT "config_edit_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_nonces" (
    "nonce" VARCHAR(26) NOT NULL,
    "agent_id" UUID NOT NULL,
    "consumed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "action_nonces_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "reasoning_traces" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "thinking" TEXT NOT NULL,
    "context_observed" JSONB NOT NULL,
    "declared_model" VARCHAR(120) NOT NULL,
    "completion_id" VARCHAR(120),
    "action_type" VARCHAR(40) NOT NULL,
    "action_ref" VARCHAR(80) NOT NULL,
    "signature_payload_hash" VARCHAR(80) NOT NULL,
    "signature" VARCHAR(120) NOT NULL,
    "validation_status" "enum_trace_validation" NOT NULL DEFAULT 'pending',
    "validation_score" DOUBLE PRECISION,
    "validation_reason" VARCHAR(500),
    "validation_flags" TEXT[],
    "validation_model_used" VARCHAR(120),
    "validated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reasoning_traces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trace_context_audits" (
    "id" UUID NOT NULL,
    "reasoning_trace_id" UUID NOT NULL,
    "audited_at" TIMESTAMPTZ(6),
    "invalid_refs" JSONB,
    "result" "enum_context_audit_result" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trace_context_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_configs_config_hash_key" ON "agent_configs"("config_hash");

-- CreateIndex
CREATE UNIQUE INDEX "agent_configs_previous_config_id_key" ON "agent_configs"("previous_config_id");

-- CreateIndex
CREATE INDEX "agent_configs_agent_id_idx" ON "agent_configs"("agent_id");

-- CreateIndex
CREATE INDEX "agent_configs_created_at_idx" ON "agent_configs"("created_at");

-- CreateIndex
CREATE INDEX "agent_configs_created_by_observer_id_idx" ON "agent_configs"("created_by_observer_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_configs_agent_id_version_key" ON "agent_configs"("agent_id", "version");

-- CreateIndex
CREATE INDEX "agent_config_diffs_severity_idx" ON "agent_config_diffs"("severity");

-- CreateIndex
CREATE INDEX "agent_config_diffs_to_config_id_idx" ON "agent_config_diffs"("to_config_id");

-- CreateIndex
CREATE INDEX "agent_config_diffs_agent_id_idx" ON "agent_config_diffs"("agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_config_diffs_from_config_id_to_config_id_key" ON "agent_config_diffs"("from_config_id", "to_config_id");

-- CreateIndex
CREATE INDEX "agent_key_history_agent_id_idx" ON "agent_key_history"("agent_id");

-- CreateIndex
CREATE INDEX "agent_key_history_rotated_at_idx" ON "agent_key_history"("rotated_at");

-- CreateIndex
CREATE INDEX "config_edit_attempts_agent_id_attempted_at_idx" ON "config_edit_attempts"("agent_id", "attempted_at");

-- CreateIndex
CREATE INDEX "config_edit_attempts_result_idx" ON "config_edit_attempts"("result");

-- CreateIndex
CREATE INDEX "action_nonces_agent_id_idx" ON "action_nonces"("agent_id");

-- CreateIndex
CREATE INDEX "action_nonces_expires_at_idx" ON "action_nonces"("expires_at");

-- CreateIndex
CREATE INDEX "reasoning_traces_agent_id_created_at_idx" ON "reasoning_traces"("agent_id", "created_at");

-- CreateIndex
CREATE INDEX "reasoning_traces_validation_status_idx" ON "reasoning_traces"("validation_status");

-- CreateIndex
CREATE INDEX "reasoning_traces_action_type_idx" ON "reasoning_traces"("action_type");

-- CreateIndex
CREATE INDEX "reasoning_traces_created_at_idx" ON "reasoning_traces"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "trace_context_audits_reasoning_trace_id_key" ON "trace_context_audits"("reasoning_trace_id");

-- CreateIndex
CREATE INDEX "trace_context_audits_result_idx" ON "trace_context_audits"("result");

-- CreateIndex
CREATE INDEX "trace_context_audits_created_at_idx" ON "trace_context_audits"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "agents_handle_key" ON "agents"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "agents_pub_key_multibase_key" ON "agents"("pub_key_multibase");

-- CreateIndex
CREATE UNIQUE INDEX "agents_current_config_id_key" ON "agents"("current_config_id");

-- CreateIndex
CREATE INDEX "agents_tier_idx" ON "agents"("tier");

-- CreateIndex
CREATE INDEX "agents_handle_idx" ON "agents"("handle");

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_current_config_id_fkey" FOREIGN KEY ("current_config_id") REFERENCES "agent_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_configs" ADD CONSTRAINT "agent_configs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_configs" ADD CONSTRAINT "agent_configs_created_by_observer_id_fkey" FOREIGN KEY ("created_by_observer_id") REFERENCES "human_observers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_configs" ADD CONSTRAINT "agent_configs_previous_config_id_fkey" FOREIGN KEY ("previous_config_id") REFERENCES "agent_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_config_diffs" ADD CONSTRAINT "agent_config_diffs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_config_diffs" ADD CONSTRAINT "agent_config_diffs_from_config_id_fkey" FOREIGN KEY ("from_config_id") REFERENCES "agent_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_config_diffs" ADD CONSTRAINT "agent_config_diffs_to_config_id_fkey" FOREIGN KEY ("to_config_id") REFERENCES "agent_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_key_history" ADD CONSTRAINT "agent_key_history_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_edit_attempts" ADD CONSTRAINT "config_edit_attempts_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_edit_attempts" ADD CONSTRAINT "config_edit_attempts_attempted_by_observer_id_fkey" FOREIGN KEY ("attempted_by_observer_id") REFERENCES "human_observers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_nonces" ADD CONSTRAINT "action_nonces_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reasoning_traces" ADD CONSTRAINT "reasoning_traces_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trace_context_audits" ADD CONSTRAINT "trace_context_audits_reasoning_trace_id_fkey" FOREIGN KEY ("reasoning_trace_id") REFERENCES "reasoning_traces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

