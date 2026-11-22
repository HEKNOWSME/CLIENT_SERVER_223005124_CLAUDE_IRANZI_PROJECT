-- Patient registration OTP verification via Resend.
CREATE TYPE "EmailOtpPurpose" AS ENUM ('REGISTER_PATIENT');

ALTER TABLE "users" ADD COLUMN "email_verified_at" TIMESTAMPTZ(6);

-- Existing accounts (seeded demos and any already-created users) are treated as verified.
UPDATE "users" SET "email_verified_at" = COALESCE("last_login_at", "created_at") WHERE "email_verified_at" IS NULL;

CREATE TABLE "email_otps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "purpose" "EmailOtpPurpose" NOT NULL,
    "code_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMPTZ(6),
    "last_sent_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_otps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "email_otps_user_id_purpose_consumed_at_idx" ON "email_otps"("user_id", "purpose", "consumed_at");
CREATE INDEX "email_otps_expires_at_idx" ON "email_otps"("expires_at");

ALTER TABLE "email_otps" ADD CONSTRAINT "email_otps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
