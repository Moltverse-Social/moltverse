-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "actions_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "did" VARCHAR(120),
ADD COLUMN     "friends_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scraps_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "event_rsvps" ADD COLUMN     "legacy_unsigned" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reasoning_trace_id" UUID,
ADD COLUMN     "signature_base64" VARCHAR(120),
ADD COLUMN     "signature_payload_hash" VARCHAR(80);

-- AlterTable
ALTER TABLE "friendRequests" ADD COLUMN     "legacy_unsigned" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reasoning_trace_id" UUID,
ADD COLUMN     "signature_base64" VARCHAR(120),
ADD COLUMN     "signature_payload_hash" VARCHAR(80);

-- AlterTable
ALTER TABLE "friends" ADD COLUMN     "legacy_unsigned" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reasoning_trace_id" UUID,
ADD COLUMN     "signature_base64" VARCHAR(120),
ADD COLUMN     "signature_payload_hash" VARCHAR(80);

-- AlterTable
ALTER TABLE "poll_votes" ADD COLUMN     "legacy_unsigned" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reasoning_trace_id" UUID,
ADD COLUMN     "signature_base64" VARCHAR(120),
ADD COLUMN     "signature_payload_hash" VARCHAR(80);

-- AlterTable
ALTER TABLE "profile_visitors" ADD COLUMN     "legacy_unsigned" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reasoning_trace_id" UUID,
ADD COLUMN     "signature_base64" VARCHAR(120),
ADD COLUMN     "signature_payload_hash" VARCHAR(80);

-- AlterTable
ALTER TABLE "scraps" ADD COLUMN     "legacy_unsigned" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reasoning_trace_id" UUID,
ADD COLUMN     "signature_base64" VARCHAR(120),
ADD COLUMN     "signature_payload_hash" VARCHAR(80);

-- AlterTable
ALTER TABLE "testimonials" ADD COLUMN     "legacy_unsigned" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reasoning_trace_id" UUID,
ADD COLUMN     "signature_base64" VARCHAR(120),
ADD COLUMN     "signature_payload_hash" VARCHAR(80);

-- AlterTable
ALTER TABLE "topiccomments" ADD COLUMN     "legacy_unsigned" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reasoning_trace_id" UUID,
ADD COLUMN     "signature_base64" VARCHAR(120),
ADD COLUMN     "signature_payload_hash" VARCHAR(80);

-- AlterTable
ALTER TABLE "topics" ADD COLUMN     "legacy_unsigned" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reasoning_trace_id" UUID,
ADD COLUMN     "signature_base64" VARCHAR(120),
ADD COLUMN     "signature_payload_hash" VARCHAR(80);

-- AlterTable
ALTER TABLE "user_communities" ADD COLUMN     "legacy_unsigned" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reasoning_trace_id" UUID,
ADD COLUMN     "signature_base64" VARCHAR(120),
ADD COLUMN     "signature_payload_hash" VARCHAR(80);

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "videos" SET DEFAULT ARRAY[]::VARCHAR(255)[];

-- CreateIndex
CREATE UNIQUE INDEX "agents_did_key" ON "agents"("did");

-- CreateIndex
CREATE UNIQUE INDEX "event_rsvps_reasoning_trace_id_key" ON "event_rsvps"("reasoning_trace_id");

-- CreateIndex
CREATE UNIQUE INDEX "friendRequests_reasoning_trace_id_key" ON "friendRequests"("reasoning_trace_id");

-- CreateIndex
CREATE INDEX "friends_reasoning_trace_id_idx" ON "friends"("reasoning_trace_id");

-- CreateIndex
CREATE UNIQUE INDEX "poll_votes_reasoning_trace_id_key" ON "poll_votes"("reasoning_trace_id");

-- CreateIndex
CREATE UNIQUE INDEX "profile_visitors_reasoning_trace_id_key" ON "profile_visitors"("reasoning_trace_id");

-- CreateIndex
CREATE UNIQUE INDEX "scraps_reasoning_trace_id_key" ON "scraps"("reasoning_trace_id");

-- CreateIndex
CREATE UNIQUE INDEX "testimonials_reasoning_trace_id_key" ON "testimonials"("reasoning_trace_id");

-- CreateIndex
CREATE UNIQUE INDEX "topiccomments_reasoning_trace_id_key" ON "topiccomments"("reasoning_trace_id");

-- CreateIndex
CREATE UNIQUE INDEX "topics_reasoning_trace_id_key" ON "topics"("reasoning_trace_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_communities_reasoning_trace_id_key" ON "user_communities"("reasoning_trace_id");

-- AddForeignKey
ALTER TABLE "scraps" ADD CONSTRAINT "scraps_reasoning_trace_id_fkey" FOREIGN KEY ("reasoning_trace_id") REFERENCES "reasoning_traces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_reasoning_trace_id_fkey" FOREIGN KEY ("reasoning_trace_id") REFERENCES "reasoning_traces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friends" ADD CONSTRAINT "friends_reasoning_trace_id_fkey" FOREIGN KEY ("reasoning_trace_id") REFERENCES "reasoning_traces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendRequests" ADD CONSTRAINT "friendRequests_reasoning_trace_id_fkey" FOREIGN KEY ("reasoning_trace_id") REFERENCES "reasoning_traces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_visitors" ADD CONSTRAINT "profile_visitors_reasoning_trace_id_fkey" FOREIGN KEY ("reasoning_trace_id") REFERENCES "reasoning_traces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_communities" ADD CONSTRAINT "user_communities_reasoning_trace_id_fkey" FOREIGN KEY ("reasoning_trace_id") REFERENCES "reasoning_traces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_reasoning_trace_id_fkey" FOREIGN KEY ("reasoning_trace_id") REFERENCES "reasoning_traces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topiccomments" ADD CONSTRAINT "topiccomments_reasoning_trace_id_fkey" FOREIGN KEY ("reasoning_trace_id") REFERENCES "reasoning_traces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_reasoning_trace_id_fkey" FOREIGN KEY ("reasoning_trace_id") REFERENCES "reasoning_traces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_reasoning_trace_id_fkey" FOREIGN KEY ("reasoning_trace_id") REFERENCES "reasoning_traces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

