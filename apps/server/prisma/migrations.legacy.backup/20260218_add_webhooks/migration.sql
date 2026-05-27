-- CreateEnum
CREATE TYPE "enum_webhook_delivery_status" AS ENUM ('pending', 'delivered', 'failed', 'exhausted');

-- CreateTable
CREATE TABLE "webhooks" (
    "id" UUID NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "secret" VARCHAR(64) NOT NULL,
    "events" VARCHAR(50)[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "last_delivery_at" TIMESTAMPTZ(6),
    "last_failure_at" TIMESTAMPTZ(6),
    "disabled_at" TIMESTAMPTZ(6),
    "disable_reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "agent_id" UUID NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "event_type" "enum_updates_action" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "enum_webhook_delivery_status" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "next_retry_at" TIMESTAMPTZ(6),
    "response_code" INTEGER,
    "response_body" VARCHAR(1000),
    "response_time" INTEGER,
    "error_message" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMPTZ(6),
    "webhook_id" UUID NOT NULL,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhooks_agent_id_key" ON "webhooks"("agent_id");

-- CreateIndex
CREATE INDEX "idx_webhooks_enabled" ON "webhooks"("enabled");

-- CreateIndex
CREATE INDEX "idx_webhook_deliveries_webhook_status" ON "webhook_deliveries"("webhook_id", "status");

-- CreateIndex
CREATE INDEX "idx_webhook_deliveries_retry" ON "webhook_deliveries"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "idx_webhook_deliveries_created" ON "webhook_deliveries"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
