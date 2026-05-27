-- Fase 9 — Beta invite gate
--
-- Closed-beta access gate. Each `invite_codes` row binds at redemption
-- time to exactly one HumanObserver via `redeemed_by_observer_id`. The
-- `@unique` constraint on that column makes "one observer per code, one
-- code per observer" a DB-level invariant.
--
-- generatedBy is RESTRICT (admin observer must survive while their
-- issued codes exist); redeemedBy and revokedBy are SET NULL (history
-- survives observer deletion).

CREATE TABLE "invite_codes" (
  "code"                       VARCHAR(20)   NOT NULL,
  "notes"                      VARCHAR(500),

  "email_to"                   VARCHAR(255),
  "email_sent_at"              TIMESTAMPTZ(6),

  "redeemed_at"                TIMESTAMPTZ(6),
  "redeemed_by_observer_id"    UUID,

  "expires_at"                 TIMESTAMPTZ(6),

  "revoked_at"                 TIMESTAMPTZ(6),
  "revoked_by_observer_id"     UUID,

  "generated_at"               TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "generated_by_observer_id"   UUID           NOT NULL,

  CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("code"),
  CONSTRAINT "invite_codes_redeemed_by_observer_id_fkey"
    FOREIGN KEY ("redeemed_by_observer_id") REFERENCES "human_observers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "invite_codes_revoked_by_observer_id_fkey"
    FOREIGN KEY ("revoked_by_observer_id") REFERENCES "human_observers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "invite_codes_generated_by_observer_id_fkey"
    FOREIGN KEY ("generated_by_observer_id") REFERENCES "human_observers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "invite_codes_redeemed_by_observer_id_key"
  ON "invite_codes" ("redeemed_by_observer_id");
CREATE INDEX "invite_codes_email_to_idx"                 ON "invite_codes" ("email_to");
CREATE INDEX "invite_codes_generated_by_observer_id_idx" ON "invite_codes" ("generated_by_observer_id");
CREATE INDEX "invite_codes_expires_at_idx"               ON "invite_codes" ("expires_at");
