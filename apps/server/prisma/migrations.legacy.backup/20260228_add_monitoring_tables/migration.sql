-- CreateTable
CREATE TABLE "request_metrics" (
    "id" UUID NOT NULL,
    "hour" TIMESTAMPTZ(6) NOT NULL,
    "endpoint" VARCHAR(255) NOT NULL,
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "rate_limit_count" INTEGER NOT NULL DEFAULT 0,
    "latency_p50" DOUBLE PRECISION,
    "latency_p95" DOUBLE PRECISION,
    "latency_p99" DOUBLE PRECISION,
    "latency_avg" DOUBLE PRECISION,
    "latency_max" DOUBLE PRECISION,

    CONSTRAINT "request_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_service_metrics" (
    "id" UUID NOT NULL,
    "service" VARCHAR(50) NOT NULL,
    "hour" TIMESTAMPTZ(6) NOT NULL,
    "api_calls" INTEGER NOT NULL DEFAULT 0,
    "bytes_used" BIGINT NOT NULL DEFAULT 0,
    "quota_used" INTEGER NOT NULL DEFAULT 0,
    "quota_limit" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(500),

    CONSTRAINT "external_service_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "metric" VARCHAR(100) NOT NULL,
    "level" VARCHAR(20) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "triggered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "fingerprint" VARCHAR(64) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_aggregates" (
    "id" UUID NOT NULL,
    "period" VARCHAR(20) NOT NULL,
    "period_start" TIMESTAMPTZ(6) NOT NULL,
    "agents_total" INTEGER NOT NULL,
    "agents_active" INTEGER NOT NULL,
    "agents_verified" INTEGER NOT NULL,
    "observers_total" INTEGER NOT NULL,
    "scraps_total" INTEGER NOT NULL,
    "scraps_created" INTEGER NOT NULL,
    "clusters_total" INTEGER NOT NULL,
    "memory_avg_percent" DOUBLE PRECISION,
    "db_avg_latency_ms" DOUBLE PRECISION,
    "requests_total" INTEGER NOT NULL,
    "errors_total" INTEGER NOT NULL,

    CONSTRAINT "metric_aggregates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_thresholds" (
    "id" UUID NOT NULL,
    "metric" VARCHAR(100) NOT NULL,
    "warning_threshold" DOUBLE PRECISION NOT NULL,
    "critical_threshold" DOUBLE PRECISION NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "operator" VARCHAR(10) NOT NULL DEFAULT 'gte',

    CONSTRAINT "alert_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_request_metrics_hour" ON "request_metrics"("hour" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "request_metrics_hour_endpoint_key" ON "request_metrics"("hour", "endpoint");

-- CreateIndex
CREATE INDEX "idx_external_service_metrics_service_hour" ON "external_service_metrics"("service", "hour" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "external_service_metrics_service_hour_key" ON "external_service_metrics"("service", "hour");

-- CreateIndex
CREATE INDEX "idx_alerts_triggered_at" ON "alerts"("triggered_at" DESC);

-- CreateIndex
CREATE INDEX "idx_alerts_resolved_at" ON "alerts"("resolved_at");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_fingerprint_resolved_at_key" ON "alerts"("fingerprint", "resolved_at");

-- CreateIndex
CREATE INDEX "idx_metric_aggregates_period" ON "metric_aggregates"("period", "period_start" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "metric_aggregates_period_period_start_key" ON "metric_aggregates"("period", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "alert_thresholds_metric_key" ON "alert_thresholds"("metric");
