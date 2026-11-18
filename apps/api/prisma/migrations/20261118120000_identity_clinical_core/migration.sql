-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'DOCTOR', 'PATIENT');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'PENDING', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'DENIED', 'ERROR');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('RECORD_CREATED', 'RECORD_UPDATED', 'ASSIGNMENT_CHANGED', 'ACCOUNT_STATUS_CHANGED', 'GENERIC');

-- CreateEnum
CREATE TYPE "SessionRevocationReason" AS ENUM ('ROTATED', 'LOGOUT', 'LOGOUT_ALL', 'REUSE_DETECTED', 'ACCOUNT_SUSPENDED', 'PASSWORD_CHANGED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'PENDING',
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "password_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "birth_date" DATE NOT NULL,
    "phone" VARCHAR(30),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "specialty" VARCHAR(120) NOT NULL,
    "license_number" VARCHAR(60),
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verified_at" TIMESTAMPTZ(6),
    "verified_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "doctors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_patients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "doctor_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "active_lock" BOOLEAN DEFAULT true,
    "note" VARCHAR(500),
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by_user_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by_user_id" UUID,

    CONSTRAINT "doctor_patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "diagnosis" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "record_date" DATE NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "file_url" VARCHAR(700),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "record_id" UUID NOT NULL,
    "object_key" VARCHAR(700) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum_sha256" VARCHAR(64),
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "record_id" UUID NOT NULL,
    "changed_by_id" UUID NOT NULL,
    "old_version" INTEGER NOT NULL,
    "new_version" INTEGER NOT NULL,
    "previous_data" JSONB NOT NULL,
    "change_summary" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "record_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_user_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "resource_type" VARCHAR(50) NOT NULL,
    "resource_id" UUID,
    "outcome" "AuditOutcome" NOT NULL,
    "reason_code" VARCHAR(80),
    "request_id" VARCHAR(100),
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(300),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipient_user_id" UUID NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "related_resource_id" UUID,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "replaced_by_id" UUID,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_reason" "SessionRevocationReason",
    "user_agent" VARCHAR(300),
    "ip_address" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_user_id" UUID,
    "event_type" VARCHAR(80) NOT NULL,
    "topic" VARCHAR(200) NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "patients_user_id_key" ON "patients"("user_id");

-- CreateIndex
CREATE INDEX "patients_full_name_idx" ON "patients"("full_name");

-- CreateIndex
CREATE UNIQUE INDEX "doctors_user_id_key" ON "doctors"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "doctors_license_number_key" ON "doctors"("license_number");

-- CreateIndex
CREATE INDEX "doctors_verification_status_idx" ON "doctors"("verification_status");

-- CreateIndex
CREATE INDEX "doctor_patients_doctor_id_status_idx" ON "doctor_patients"("doctor_id", "status");

-- CreateIndex
CREATE INDEX "doctor_patients_patient_id_status_idx" ON "doctor_patients"("patient_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_patients_one_active_pair" ON "doctor_patients"("doctor_id", "patient_id", "active_lock");

-- CreateIndex
CREATE INDEX "records_patient_id_record_date_idx" ON "records"("patient_id", "record_date" DESC);

-- CreateIndex
CREATE INDEX "records_doctor_id_record_date_idx" ON "records"("doctor_id", "record_date" DESC);

-- CreateIndex
CREATE INDEX "records_diagnosis_idx" ON "records"("diagnosis");

-- CreateIndex
CREATE INDEX "records_status_idx" ON "records"("status");

-- CreateIndex
CREATE UNIQUE INDEX "medical_files_object_key_key" ON "medical_files"("object_key");

-- CreateIndex
CREATE INDEX "medical_files_record_id_idx" ON "medical_files"("record_id");

-- CreateIndex
CREATE INDEX "record_revisions_record_id_created_at_idx" ON "record_revisions"("record_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "record_revisions_record_id_new_version_key" ON "record_revisions"("record_id", "new_version");

-- CreateIndex
CREATE INDEX "access_logs_actor_user_id_created_at_idx" ON "access_logs"("actor_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "access_logs_resource_type_resource_id_created_at_idx" ON "access_logs"("resource_type", "resource_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "access_logs_action_created_at_idx" ON "access_logs"("action", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_recipient_user_id_read_at_created_at_idx" ON "notifications"("recipient_user_id", "read_at", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_sessions_token_hash_key" ON "refresh_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_sessions_user_id_revoked_at_idx" ON "refresh_sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "refresh_sessions_family_id_idx" ON "refresh_sessions"("family_id");

-- CreateIndex
CREATE INDEX "refresh_sessions_expires_at_idx" ON "refresh_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "outbox_events_published_at_created_at_idx" ON "outbox_events"("published_at", "created_at");

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_verified_by_user_id_fkey" FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_patients" ADD CONSTRAINT "doctor_patients_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_patients" ADD CONSTRAINT "doctor_patients_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_patients" ADD CONSTRAINT "doctor_patients_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_patients" ADD CONSTRAINT "doctor_patients_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_files" ADD CONSTRAINT "medical_files_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_files" ADD CONSTRAINT "medical_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_revisions" ADD CONSTRAINT "record_revisions_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_revisions" ADD CONSTRAINT "record_revisions_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================================
-- Integrity rules Prisma cannot express (see docs/04 section 5).
-- CHECK constraints and triggers are not tracked by Prisma diffing, so
-- later `prisma migrate dev` runs leave them in place.
-- =====================================================================

-- Identity
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email") AND length(btrim("email")) > 0),
  ADD CONSTRAINT "users_name_nonblank" CHECK (length(btrim("name")) > 0),
  ADD CONSTRAINT "users_failed_attempts_nonnegative" CHECK ("failed_login_attempts" >= 0);

ALTER TABLE "patients"
  ADD CONSTRAINT "patients_full_name_nonblank" CHECK (length(btrim("full_name")) > 0),
  ADD CONSTRAINT "patients_birth_date_plausible" CHECK ("birth_date" >= DATE '1900-01-01');

ALTER TABLE "doctors"
  ADD CONSTRAINT "doctors_full_name_nonblank" CHECK (length(btrim("full_name")) > 0),
  ADD CONSTRAINT "doctors_verification_decided" CHECK ("verification_status" = 'PENDING' OR "verified_at" IS NOT NULL);

-- Care relationships: one ACTIVE pair at a time, consistent revocation fields
ALTER TABLE "doctor_patients"
  ADD CONSTRAINT "doctor_patients_revocation_consistency" CHECK (
    ("status" = 'ACTIVE'  AND "active_lock" IS TRUE AND "revoked_at" IS NULL) OR
    ("status" = 'REVOKED' AND "active_lock" IS NULL AND "revoked_at" IS NOT NULL)
  );

-- Clinical records
ALTER TABLE "records"
  ADD CONSTRAINT "records_nonblank_diagnosis" CHECK (length(btrim("diagnosis")) > 0),
  ADD CONSTRAINT "records_positive_version" CHECK ("version" >= 1),
  ADD CONSTRAINT "records_record_date_plausible" CHECK ("record_date" >= DATE '1900-01-01');

ALTER TABLE "medical_files"
  ADD CONSTRAINT "medical_files_size_range" CHECK ("size_bytes" > 0 AND "size_bytes" <= 10485760),
  ADD CONSTRAINT "medical_files_pdf_mime" CHECK ("mime_type" = 'application/pdf'),
  ADD CONSTRAINT "medical_files_checksum_format" CHECK ("checksum_sha256" IS NULL OR "checksum_sha256" ~ '^[0-9a-f]{64}$');

ALTER TABLE "record_revisions"
  ADD CONSTRAINT "record_revisions_version_step" CHECK ("new_version" = "old_version" + 1);

-- Sessions and outbox
ALTER TABLE "refresh_sessions"
  ADD CONSTRAINT "refresh_sessions_revocation_consistency" CHECK (("revoked_at" IS NULL) = ("revoked_reason" IS NULL)),
  ADD CONSTRAINT "refresh_sessions_expiry_after_creation" CHECK ("expires_at" > "created_at");

ALTER TABLE "outbox_events"
  ADD CONSTRAINT "outbox_events_attempts_nonnegative" CHECK ("attempts" >= 0);

-- Profile rows must point at a user with the matching role (I-03)
CREATE FUNCTION "enforce_profile_role"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  expected "UserRole" := TG_ARGV[0]::"UserRole";
  actual "UserRole";
BEGIN
  SELECT "role" INTO actual FROM "users" WHERE "id" = NEW."user_id";
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'profile in % requires a % user (found %)', TG_TABLE_NAME, expected, actual
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "patients_enforce_role"
  BEFORE INSERT OR UPDATE OF "user_id" ON "patients"
  FOR EACH ROW EXECUTE FUNCTION "enforce_profile_role"('PATIENT');

CREATE TRIGGER "doctors_enforce_role"
  BEFORE INSERT OR UPDATE OF "user_id" ON "doctors"
  FOR EACH ROW EXECUTE FUNCTION "enforce_profile_role"('DOCTOR');

-- A user's role cannot drift away from an existing profile
CREATE FUNCTION "prevent_role_change_with_profile"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."role" IS DISTINCT FROM OLD."role" AND (
    EXISTS (SELECT 1 FROM "patients" WHERE "user_id" = NEW."id") OR
    EXISTS (SELECT 1 FROM "doctors" WHERE "user_id" = NEW."id")
  ) THEN
    RAISE EXCEPTION 'role of user % cannot change while a profile exists', NEW."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "users_role_locked_by_profile"
  BEFORE UPDATE OF "role" ON "users"
  FOR EACH ROW EXECUTE FUNCTION "prevent_role_change_with_profile"();

-- Record ownership is fixed at insert time (I-07, I-08)
CREATE FUNCTION "prevent_record_ownership_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."patient_id" IS DISTINCT FROM OLD."patient_id"
     OR NEW."doctor_id" IS DISTINCT FROM OLD."doctor_id" THEN
    RAISE EXCEPTION 'record ownership columns are immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "records_immutable_ownership"
  BEFORE UPDATE OF "patient_id", "doctor_id" ON "records"
  FOR EACH ROW EXECUTE FUNCTION "prevent_record_ownership_change"();

-- Audit history is append-only
CREATE FUNCTION "prevent_audit_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "access_logs_append_only"
  BEFORE UPDATE OR DELETE ON "access_logs"
  FOR EACH ROW EXECUTE FUNCTION "prevent_audit_mutation"();

CREATE TRIGGER "record_revisions_append_only"
  BEFORE UPDATE OR DELETE ON "record_revisions"
  FOR EACH ROW EXECUTE FUNCTION "prevent_audit_mutation"();