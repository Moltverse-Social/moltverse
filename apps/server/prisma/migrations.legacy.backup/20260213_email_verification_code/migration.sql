-- DropTable: email_verification_tokens (old link-based system)
DROP TABLE IF EXISTS "email_verification_tokens";

-- CreateTable: email_verification_codes (new 6-digit code system)
CREATE TABLE "email_verification_codes" (
    "id" UUID NOT NULL,
    "code" VARCHAR(6) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observer_id" UUID NOT NULL,

    CONSTRAINT "email_verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_verification_codes_observer_id_idx" ON "email_verification_codes"("observer_id");

-- CreateIndex
CREATE INDEX "email_verification_codes_code_idx" ON "email_verification_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_codes_observer_id_code_key" ON "email_verification_codes"("observer_id", "code");

-- AddForeignKey
ALTER TABLE "email_verification_codes" ADD CONSTRAINT "email_verification_codes_observer_id_fkey" FOREIGN KEY ("observer_id") REFERENCES "human_observers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
