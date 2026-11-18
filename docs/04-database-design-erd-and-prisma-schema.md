# 04 — Database Design, ERD and Prisma Schema

**Project:** Patient Medical Records Management System (PMRMS)  
**Version:** 2.0 — 18 November 2026  
**Status:** Implementation blueprint for clinical schema (Stage 1+)  
**Related:** `01-project-overview-and-functional-requirements_PR.md` · `02-system-actors-use-cases-and-business-rules_PR.md` · `03-system-architecture-and-data-flow-diagrams.md`

> **Current codebase note:** Stage 0 only migrates `SystemCheck`. This document defines the **target clinical schema** that replaces and extends that foundation. Migrations must be additive and reviewed — never reset production/demo data to “fix” schema mistakes.

---

## 1. Purpose

This document is the authoritative relational design for PMRMS. It defines:

1. **Entities and relationships** — who owns which data  
2. **Schema logic** — invariants, lifecycles, and constraints the database must enforce  
3. **Prisma models** — implementable definitions aligned with Prisma 7  
4. **SQL beyond Prisma** — checks, partial unique indexes, and RLS patterns  
5. **Seed and test evidence** — what the professor can verify  

| Concern | Decision |
|---|---|
| Roles | `ADMIN`, `DOCTOR`, `PATIENT` |
| API authority | NestJS JWT + ownership/assignment guards |
| Database | PostgreSQL (`pmrms` locally; Supabase-hosted for demo) |
| ORM | Prisma 7 + `@prisma/adapter-pg` + `prisma.config.ts` |
| Defense in depth | NestJS authorization **and** PostgreSQL RLS on a restricted runtime role |
| Files | Cloudflare R2 private objects; DB stores `object_key`, never permanent public URLs |
| Concurrency | Optimistic locking via `records.version` |
| History | Soft archive + append-only `record_revisions` |
| Realtime | Durable `notifications` + minimal private Broadcast signals |
| Data policy | Synthetic patients and PDFs only |

### 1.1 Non-negotiable access rules

1. A **patient** reads only their own clinical records and PDFs.  
2. A **doctor** accesses records only for patients with an **ACTIVE** assignment, and only if the doctor is **APPROVED** and **ACTIVE**.  
3. An **admin** manages identities and assignments, but **cannot** read diagnoses or medical PDFs by default.  
4. Clients never choose trusted `role`, `userId`, or `doctorId` from the request body.  
5. Revoking an assignment immediately blocks subsequent REST/PDF access.  
6. Sensitive access attempts (including denials) are auditable.  
7. Clinical rows are archived/corrected — not casually hard-deleted.

---

## 2. Schema logic (core of the design)

A professional medical schema is not only tables. It is a set of **invariants** the database and API must preserve together.

### 2.1 Domain invariants

| ID | Invariant | Enforced by |
|---|---|---|
| I-01 | Every account has exactly one role; role cannot be self-promoted | `users.role` NOT NULL + NestJS registration/admin workflows |
| I-02 | A PATIENT user has at most one `patients` profile; a DOCTOR user at most one `doctors` profile | `UNIQUE(user_id)` + trusted create transaction |
| I-03 | Profile `user_id` must match the account role (`PATIENT` ↔ patient, `DOCTOR` ↔ doctor) | Application transaction (+ optional DB trigger) |
| I-04 | Only one **ACTIVE** assignment may exist for a given `(doctor_id, patient_id)` | Partial unique index |
| I-05 | `ACTIVE` assignment ⇒ `revoked_at IS NULL`; `REVOKED` ⇒ `revoked_at IS NOT NULL` | CHECK constraint |
| I-06 | Record create requires ACTIVE assignment between authoring doctor and patient | NestJS + RLS `WITH CHECK` |
| I-07 | `records.doctor_id` is the authoring doctor and is immutable after insert | Service allowlist + optional trigger |
| I-08 | `records.patient_id` is immutable after insert | Service allowlist + optional trigger |
| I-09 | Diagnosis is non-blank; `version >= 1` | CHECK + DTO validation |
| I-10 | Concurrent edits cannot both succeed on the same version | `UPDATE … WHERE version = :expected` |
| I-11 | Every successful clinical correction leaves a revision snapshot | Same DB transaction as version bump |
| I-12 | PDF metadata references a private object key; MIME is PDF; size > 0 | CHECK + NestJS upload validation |
| I-13 | Notifications are readable only by `recipient_user_id` | RLS + NestJS recipient guard |
| I-14 | Refresh tokens are stored hashed; sessions are revocable | Auth module only |
| I-15 | Outbox/Broadcast payloads never contain diagnoses, names, or signed URLs | Publisher contract + tests |

### 2.2 Entity lifecycles

```text
USER
  PENDING ──(admin approve / patient register)──► ACTIVE ──(admin)──► SUSPENDED
  Doctor application: PENDING verification until ADMIN approves/rejects

DOCTOR.verification_status
  PENDING ──► APPROVED | REJECTED
  Only APPROVED + ACTIVE user may create clinical records

DOCTOR_PATIENT
  ACTIVE ──(admin revoke)──► REVOKED   (history retained; no hard delete)

MEDICAL_RECORD
  ACTIVE ──(authorized archive)──► ARCHIVED
  Corrections: version n → n+1 with RECORD_REVISION append

REFRESH_SESSION
  created → used/rotated → revoked or expired

NOTIFICATION
  unread (read_at NULL) → read (read_at set)   recipient cannot change kind/recipient
```

### 2.3 Relationship logic

```text
USER 1 ── 0..1 PATIENT     (only if role = PATIENT)
USER 1 ── 0..1 DOCTOR      (only if role = DOCTOR)
DOCTOR M ── N PATIENT      via DOCTOR_PATIENT (assignment edge)
PATIENT 1 ── * MEDICAL_RECORD
DOCTOR  1 ── * MEDICAL_RECORD   (author)
MEDICAL_RECORD 1 ── * MEDICAL_FILE
MEDICAL_RECORD 1 ── * RECORD_REVISION
USER 1 ── * NOTIFICATION | ACCESS_LOG | REFRESH_SESSION
```

**Authorization derives from relationships, not from client IDs:**

| Actor | May read a record when |
|---|---|
| Patient | `patients.user_id = authenticated.sub` and record.patient_id matches that patient |
| Doctor | doctor is APPROVED/ACTIVE **and** ACTIVE `doctor_patients` row links doctor↔patient |
| Admin | **never** for diagnosis/PDF by default |

### 2.4 Why normalize beyond the starter tables

The academic starter often expects roughly:

- `patients(name, birth_date)`
- `records(patient_id, doctor_id, diagnosis, file_url)`

PMRMS keeps those fields, then strengthens them:

| Starter idea | Professional design | Why |
|---|---|---|
| Flat `file_url` on records | `medical_files.object_key` (+ optional bridge view) | Private R2 objects, multiple PDFs, no permanent public URL |
| Single users table with mixed columns | `users` + `patients` / `doctors` profiles | Role-specific data without nullable clinical columns on every user |
| Soft “who can see what” in UI only | Assignments table + RLS + audit | Revocation, history, and defense in depth |
| Overwrite on edit | `version` + `record_revisions` | No silent lost updates; demo-ready concurrency |

---

## 3. Logical ERD

```mermaid
erDiagram
    USER ||--o| PATIENT : "profile"
    USER ||--o| DOCTOR : "profile"
    USER ||--o{ REFRESH_SESSION : owns
    USER ||--o{ NOTIFICATION : receives
    USER ||--o{ ACCESS_LOG : performs
    USER ||--o{ RECORD_REVISION : edits
    USER ||--o{ OUTBOX_EVENT : causes
    DOCTOR ||--o{ DOCTOR_PATIENT : assigned
    PATIENT ||--o{ DOCTOR_PATIENT : assigned
    PATIENT ||--o{ MEDICAL_RECORD : owns
    DOCTOR ||--o{ MEDICAL_RECORD : authors
    MEDICAL_RECORD ||--o{ MEDICAL_FILE : attaches
    MEDICAL_RECORD ||--o{ RECORD_REVISION : history

    USER {
      uuid id PK
      string email UK
      string password_hash
      enum role
      enum status
    }
    PATIENT {
      uuid id PK
      uuid user_id FK_UK
      string full_name
      date birth_date
    }
    DOCTOR {
      uuid id PK
      uuid user_id FK_UK
      string full_name
      string specialty
      enum verification_status
    }
    DOCTOR_PATIENT {
      uuid id PK
      uuid doctor_id FK
      uuid patient_id FK
      enum status
      timestamptz assigned_at
      timestamptz revoked_at
    }
    MEDICAL_RECORD {
      uuid id PK
      uuid patient_id FK
      uuid doctor_id FK
      string diagnosis
      date record_date
      int version
      enum status
    }
    MEDICAL_FILE {
      uuid id PK
      uuid record_id FK
      string object_key UK
      string mime_type
      bigint size_bytes
    }
    RECORD_REVISION {
      uuid id PK
      uuid record_id FK
      uuid changed_by_id FK
      int old_version
      int new_version
      json previous_data
    }
    NOTIFICATION {
      uuid id PK
      uuid recipient_user_id FK
      enum kind
      timestamptz read_at
    }
    ACCESS_LOG {
      uuid id PK
      uuid actor_user_id FK
      string action
      enum outcome
    }
    REFRESH_SESSION {
      uuid id PK
      uuid user_id FK
      string token_hash UK
      timestamptz expires_at
    }
    OUTBOX_EVENT {
      uuid id PK
      string event_type
      string topic
      json payload
    }
```

### 3.1 Table responsibilities

| Table | Purpose | Write path | Read path |
|---|---|---|---|
| `users` | Identity, credentials, role, account status | Auth / admin | Own minimum; admin metadata |
| `patients` | Patient demographics linked 1:1 to user | Registration / profile update | Own; assigned doctor (limited); admin metadata |
| `doctors` | Clinician profile + verification | Doctor apply / admin approve | Own; assigned patients see limited metadata |
| `doctor_patients` | Assignment edge with revoke history | **Admin only** | Affected doctor/patient (relationship metadata) |
| `records` | Clinical diagnosis entry | Approved assigned doctor | Patient owner; assigned doctors; **not admin** |
| `medical_files` | Private R2 object metadata | Authorized clinical upload | Same scope as parent record |
| `record_revisions` | Append-only correction history | Trusted update transaction | Same scope as parent record |
| `access_logs` | Security evidence | Trusted audit writer | Admin security metadata only |
| `notifications` | Durable inbox | Trusted domain events | Recipient only |
| `refresh_sessions` | Refresh-token lifecycle | Auth module only | Never exposed to clients |
| `outbox_events` | Reliable Broadcast queue | Same txn as domain write | Publisher worker only |
| `system_checks` | Stage 0 infrastructure marker | Setup/seed | Health readiness |

---

## 4. Prisma 7 schema (target)

Aligned with this repository: generated client under `apps/api/src/generated/prisma`, connection URL in `apps/api/prisma.config.ts` (not inside `datasource`).

```prisma
// apps/api/prisma/schema.prisma  — TARGET clinical schema (Stage 1+)
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"
}

datasource db {
  provider = "postgresql"
}

enum UserRole {
  ADMIN
  DOCTOR
  PATIENT
}

enum AccountStatus {
  ACTIVE
  PENDING
  SUSPENDED
}

enum VerificationStatus {
  PENDING
  APPROVED
  REJECTED
}

enum AssignmentStatus {
  ACTIVE
  REVOKED
}

enum RecordStatus {
  ACTIVE
  ARCHIVED
}

enum AuditOutcome {
  SUCCESS
  DENIED
  ERROR
}

enum NotificationKind {
  RECORD_CREATED
  RECORD_UPDATED
  ASSIGNMENT_CHANGED
  ACCOUNT_STATUS_CHANGED
  GENERIC
}

/// Stage 0 infrastructure marker — retained for local readiness checks.
model SystemCheck {
  id        String   @id
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)

  @@map("system_checks")
}

model User {
  id           String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name         String        @db.VarChar(150)
  email        String        @unique @db.VarChar(255)
  passwordHash String        @map("password_hash")
  role         UserRole
  status       AccountStatus @default(PENDING)

  patient         Patient?
  doctor          Doctor?
  refreshSessions RefreshSession[]
  notifications   Notification[]
  accessLogs      AccessLog[]
  recordRevisions RecordRevision[]
  causedEvents    OutboxEvent[]

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@map("users")
}

model Patient {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String   @unique @map("user_id") @db.Uuid
  user      User     @relation(fields: [userId], references: [id], onDelete: Restrict)
  fullName  String   @map("full_name") @db.VarChar(150)
  birthDate DateTime @map("birth_date") @db.Date

  records     MedicalRecord[]
  assignments DoctorPatient[]

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@map("patients")
}

model Doctor {
  id                 String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId             String             @unique @map("user_id") @db.Uuid
  user               User               @relation(fields: [userId], references: [id], onDelete: Restrict)
  fullName           String             @map("full_name") @db.VarChar(150)
  specialty          String             @db.VarChar(120)
  verificationStatus VerificationStatus @default(PENDING) @map("verification_status")

  records     MedicalRecord[]
  assignments DoctorPatient[]

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([verificationStatus])
  @@map("doctors")
}

model DoctorPatient {
  id        String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  doctorId  String           @map("doctor_id") @db.Uuid
  patientId String           @map("patient_id") @db.Uuid
  doctor    Doctor           @relation(fields: [doctorId], references: [id], onDelete: Restrict)
  patient   Patient          @relation(fields: [patientId], references: [id], onDelete: Restrict)
  status    AssignmentStatus @default(ACTIVE)
  assignedAt DateTime        @default(now()) @map("assigned_at") @db.Timestamptz(6)
  assignedByUserId String?   @map("assigned_by_user_id") @db.Uuid
  revokedAt DateTime?        @map("revoked_at") @db.Timestamptz(6)
  revokedByUserId  String?   @map("revoked_by_user_id") @db.Uuid
  note      String?          @db.VarChar(500)

  @@index([doctorId, status])
  @@index([patientId, status])
  @@map("doctor_patients")
}

model MedicalRecord {
  id          String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  patientId   String       @map("patient_id") @db.Uuid
  doctorId    String       @map("doctor_id") @db.Uuid
  patient     Patient      @relation(fields: [patientId], references: [id], onDelete: Restrict)
  doctor      Doctor       @relation(fields: [doctorId], references: [id], onDelete: Restrict)
  diagnosis   String       @db.VarChar(255)
  description String?      @db.Text
  recordDate  DateTime     @map("record_date") @db.Date
  status      RecordStatus @default(ACTIVE)
  version     Int          @default(1)

  /// Compatibility bridge for starter "file_url" demos: private internal path only, never a public link.
  fileUrl     String?      @map("file_url") @db.VarChar(700)

  files     MedicalFile[]
  revisions RecordRevision[]

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([patientId, recordDate(sort: Desc)])
  @@index([doctorId, recordDate(sort: Desc)])
  @@index([diagnosis])
  @@index([status])
  @@map("records")
}

model MedicalFile {
  id             String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  recordId       String        @map("record_id") @db.Uuid
  record         MedicalRecord @relation(fields: [recordId], references: [id], onDelete: Restrict)
  objectKey      String        @unique @map("object_key") @db.VarChar(700)
  originalName   String        @map("original_name") @db.VarChar(255)
  mimeType       String        @map("mime_type") @db.VarChar(100)
  sizeBytes      BigInt        @map("size_bytes")
  checksumSha256 String?       @map("checksum_sha256") @db.VarChar(64)
  uploadedById   String?       @map("uploaded_by_id") @db.Uuid
  createdAt      DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([recordId])
  @@map("medical_files")
}

model RecordRevision {
  id            String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  recordId      String        @map("record_id") @db.Uuid
  record        MedicalRecord @relation(fields: [recordId], references: [id], onDelete: Restrict)
  changedById   String        @map("changed_by_id") @db.Uuid
  changedBy     User          @relation(fields: [changedById], references: [id], onDelete: Restrict)
  oldVersion    Int           @map("old_version")
  newVersion    Int           @map("new_version")
  previousData  Json          @map("previous_data")
  changeSummary String?       @map("change_summary") @db.VarChar(500)
  createdAt     DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)

  @@unique([recordId, newVersion])
  @@index([recordId, createdAt(sort: Desc)])
  @@map("record_revisions")
}

model AccessLog {
  id           String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  actorUserId  String?      @map("actor_user_id") @db.Uuid
  actor        User?        @relation(fields: [actorUserId], references: [id], onDelete: Restrict)
  action       String       @db.VarChar(80)
  resourceType String       @map("resource_type") @db.VarChar(50)
  resourceId   String?      @map("resource_id") @db.Uuid
  outcome      AuditOutcome
  reasonCode   String?      @map("reason_code") @db.VarChar(80)
  requestId    String?      @map("request_id") @db.VarChar(100)
  ipAddress    String?      @map("ip_address") @db.VarChar(64)
  createdAt    DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([actorUserId, createdAt(sort: Desc)])
  @@index([resourceType, resourceId, createdAt(sort: Desc)])
  @@map("access_logs")
}

model Notification {
  id                String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  recipientUserId   String           @map("recipient_user_id") @db.Uuid
  recipient         User             @relation(fields: [recipientUserId], references: [id], onDelete: Restrict)
  kind              NotificationKind
  title             String           @db.VarChar(200)
  relatedResourceId String?          @map("related_resource_id") @db.Uuid
  readAt            DateTime?        @map("read_at") @db.Timestamptz(6)
  createdAt         DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([recipientUserId, readAt, createdAt(sort: Desc)])
  @@map("notifications")
}

model RefreshSession {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String    @map("user_id") @db.Uuid
  user      User      @relation(fields: [userId], references: [id], onDelete: Restrict)
  tokenHash String    @unique @map("token_hash") @db.VarChar(255)
  expiresAt DateTime  @map("expires_at") @db.Timestamptz(6)
  revokedAt DateTime? @map("revoked_at") @db.Timestamptz(6)
  userAgent String?   @map("user_agent") @db.VarChar(300)
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([userId, expiresAt])
  @@map("refresh_sessions")
}

model OutboxEvent {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  actorUserId String?   @map("actor_user_id") @db.Uuid
  actor       User?     @relation(fields: [actorUserId], references: [id], onDelete: Restrict)
  eventType   String    @map("event_type") @db.VarChar(80)
  topic       String    @db.VarChar(200)
  payload     Json
  attempts    Int       @default(0)
  publishedAt DateTime? @map("published_at") @db.Timestamptz(6)
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([publishedAt, createdAt])
  @@map("outbox_events")
}
```

**Prisma 7 note:** `DATABASE_URL` lives in root `.env` and is read by `apps/api/prisma.config.ts`. Do not put `url = env("DATABASE_URL")` back into `datasource` for this project.

---

## 5. SQL constraints Prisma cannot express alone

Apply these in a reviewed migration **after** Prisma creates the tables.

```sql
-- Case-insensitive email uniqueness (backend also lowercases on write)
CREATE UNIQUE INDEX users_email_lower_unique ON users (lower(email));

-- One ACTIVE assignment per doctor–patient pair (revoked rows may repeat historically)
CREATE UNIQUE INDEX doctor_patients_one_active_pair
  ON doctor_patients (doctor_id, patient_id)
  WHERE status = 'ACTIVE';

ALTER TABLE records
  ADD CONSTRAINT records_nonblank_diagnosis CHECK (length(btrim(diagnosis)) > 0),
  ADD CONSTRAINT records_positive_version CHECK (version >= 1);

ALTER TABLE medical_files
  ADD CONSTRAINT medical_files_size_positive CHECK (size_bytes > 0),
  ADD CONSTRAINT medical_files_pdf_mime CHECK (mime_type = 'application/pdf');

ALTER TABLE doctor_patients
  ADD CONSTRAINT doctor_patients_revocation_consistency
  CHECK (
    (status = 'ACTIVE'  AND revoked_at IS NULL) OR
    (status = 'REVOKED' AND revoked_at IS NOT NULL)
  );

ALTER TABLE record_revisions
  ADD CONSTRAINT record_revisions_version_step
  CHECK (new_version = old_version + 1);
```

### 5.1 Role ↔ profile consistency

Foreign keys prove the referenced `users` row exists. They do **not** prove `patients.user_id` points to a `PATIENT`. Enforce in the account-creation transaction:

```text
BEGIN
  insert users(role=PATIENT, ...)
  insert patients(user_id=that user, ...)
COMMIT
```

Optional hardened trigger (recommended for the demo if time allows): reject profile inserts when `users.role` mismatches.

### 5.2 Immutable clinical ownership columns

On `records` update, NestJS must not accept client changes to `patient_id` / `doctor_id`. Prefer a DB trigger:

```sql
-- Conceptual trigger logic
IF NEW.patient_id IS DISTINCT FROM OLD.patient_id
   OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id THEN
  RAISE EXCEPTION 'record ownership columns are immutable';
END IF;
```

---

## 6. Index strategy (query-driven)

| Index | Supports |
|---|---|
| `records(patient_id, record_date DESC)` | Patient timeline |
| `records(doctor_id, record_date DESC)` | Doctor authored history |
| `records(diagnosis)` | Scoped diagnosis `groupBy` / filter |
| `records(status)` | Exclude archived rows efficiently |
| `doctor_patients(doctor_id, status)` / `(patient_id, status)` | Assignment checks on every clinical call |
| Partial unique `(doctor_id, patient_id) WHERE ACTIVE` | Duplicate assignment prevention |
| `notifications(recipient_user_id, read_at, created_at DESC)` | Inbox + unread badge |
| `access_logs(actor_user_id, created_at DESC)` | Security investigation |
| `outbox_events(published_at, created_at)` | Publisher drain queue |
| `users(lower(email))` unique | Login lookup without case duplicates |

Validate with `EXPLAIN ANALYZE` on seeded data before adding more indexes.

---

## 7. Deletion and retention policy

| Entity | Strategy | Rationale |
|---|---|---|
| Clinical records | Soft `ARCHIVED` | History and audit references must survive |
| Medical files | Replace via audited workflow; GC orphan R2 keys | Object store ≠ DB transaction |
| Users | `SUSPENDED`, no cascade delete of history | Academic accountability |
| Assignments | `REVOKED`, keep row | Prove past access windows |
| Refresh sessions | Revoke + purge expired | Limit stolen-token window |
| Access logs / revisions | Append-only | Evidence integrity |
| Notifications / outbox | Retention purge after processing | Operational hygiene |

---

## 8. Row Level Security (defense in depth)

NestJS remains the primary clinical authority. RLS protects against forgotten filters when Prisma uses a **restricted** runtime role (`NOSUPERUSER`, `NOBYPASSRLS`, not table owner). Privileged migration connections must never serve web requests.

### 8.1 Transaction-local identity

```sql
SELECT set_config('app.user_id', '<verified-uuid>', true);
SELECT set_config('app.role', 'DOCTOR', true);
```

Set inside the **same** Prisma interactive transaction that runs the clinical query. Values come only from a verified JWT + DB account lookup — never from the request body.

### 8.2 Record policy pattern (reference)

```sql
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;
-- Prefer: ALTER TABLE public.records FORCE ROW LEVEL SECURITY;

CREATE POLICY records_read_scope ON public.records
  FOR SELECT TO pmrms_runtime
  USING (
    app_private.is_own_patient(patient_id)
    OR app_private.is_assigned_doctor(patient_id)
  );

CREATE POLICY records_insert_doctor ON public.records
  FOR INSERT TO pmrms_runtime
  WITH CHECK (
    app_private.is_assigned_doctor(patient_id)
    AND app_private.is_authoring_doctor(doctor_id)
  );

CREATE POLICY records_update_doctor ON public.records
  FOR UPDATE TO pmrms_runtime
  USING (app_private.is_assigned_doctor(patient_id) AND app_private.is_authoring_doctor(doctor_id))
  WITH CHECK (app_private.is_assigned_doctor(patient_id) AND app_private.is_authoring_doctor(doctor_id));

-- No DELETE policy ⇒ default deny for runtime role
```

Helper functions (`is_own_patient`, `is_assigned_doctor`, `is_authoring_doctor`) live in `app_private`, use a locked `search_path`, and are `SECURITY DEFINER` only where assignment joins would recurse under RLS. Full grants belong in the security implementation migration, tested with the **exact** NestJS DB role.

### 8.3 Policy matrix

| Table | Runtime SELECT | Runtime write |
|---|---|---|
| `patients` | Own or assigned doctor (limited columns via query projection) | Own demographic fields only |
| `doctors` | Own; limited public metadata for assigned patients | Own non-verification fields; admin sets verification |
| `doctor_patients` | Affected parties | Admin trusted workflow only |
| `records` | Own patient / assigned doctor | Insert/update by authoring assigned doctor |
| `medical_files` | Mirrors parent record | Authorized upload workflow |
| `record_revisions` | Mirrors parent record | Trusted update transaction |
| `notifications` | Recipient only | Mark-read only (column privilege / function) |
| `refresh_sessions` | None for clinical role | Auth role only |
| `access_logs` | Admin metadata API only | Audit writer only |
| `outbox_events` | None for clients | Domain txn + publisher |

---

## 9. Concurrency logic

```text
Doctor A and Doctor B both read version = 3
Both PATCH with expectedVersion = 3

Transaction A:
  UPDATE records SET ..., version = 4
  WHERE id = :id AND version = 3   → 1 row → 200 OK + revision

Transaction B:
  UPDATE records SET ..., version = 4
  WHERE id = :id AND version = 3   → 0 rows → 409 Conflict
```

Rules:

1. Always filter on `version` in the write, not only in application memory.  
2. Write `record_revisions.previous_data` in the **same** transaction.  
3. If the row is invisible under RLS/assignment, return **404** (do not leak existence via 409).  
4. UI must reload and re-apply intentional changes after 409.

---

## 10. Files and the `file_url` bridge

| Field | Meaning |
|---|---|
| `medical_files.object_key` | Canonical private R2 key, e.g. `patients/<patientUuid>/records/<recordUuid>/<fileUuid>.pdf` |
| `records.file_url` | Optional compatibility column: store the **same private path** (or primary file key) for starter-schema demos — **never** a public HTTPS link |

Upload flow: authorize → validate PDF signature/MIME/size → put object in R2 → insert `medical_files` (+ sync `records.file_url` if used). If the DB write fails, schedule R2 orphan cleanup. Download: authorize → audit → short-lived signed URL or NestJS stream.

---

## 11. Notifications and outbox logic

```text
Domain transaction (single commit):
  insert/update records
  insert notifications (recipient = patient.user_id)
  insert outbox_events (topic = user:<uuid>:notifications, payload = {notificationId, kind})
  insert access_logs / record_revisions as needed

After commit:
  publisher (worker or DB trigger) emits private Broadcast
  client refetches GET /v1/notifications and authorized records
```

Payloads contain **IDs and kind only** — never diagnoses, names, or signed URLs. Offline clients recover from PostgreSQL on reconnect.

---

## 12. Core query shapes

### 12.1 Patient timeline

```ts
await tx.medicalRecord.findMany({
  where: { patientId, status: 'ACTIVE' },
  orderBy: [{ recordDate: 'desc' }, { createdAt: 'desc' }],
  take: 20,
  select: {
    id: true,
    diagnosis: true,
    recordDate: true,
    version: true,
    doctor: { select: { fullName: true, specialty: true } },
    files: { select: { id: true, originalName: true } },
  },
});
```

`patientId` must be derived from auth (patient) or validated against an ACTIVE assignment (doctor).

### 12.2 Scoped diagnosis counts

```ts
await tx.medicalRecord.groupBy({
  by: ['diagnosis'],
  where: {
    status: 'ACTIVE',
    // doctor path: restrict to assigned patient IDs resolved in NestJS
    patientId: { in: assignedPatientIds },
  },
  _count: { _all: true },
  orderBy: { _count: { diagnosis: 'desc' } },
});
```

Never run a global unscoped `groupBy` for doctors or admins.

### 12.3 Optimistic update

```ts
const result = await tx.medicalRecord.updateMany({
  where: { id: recordId, version: expectedVersion, status: 'ACTIVE' },
  data: { diagnosis, description, version: { increment: 1 } },
});
if (result.count !== 1) { /* 409 or 404 after visibility check */ }
```

---

## 13. Seed plan (professor evidence)

Seed **10 fictional patients**, **10 medical records**, **3 doctors**, **1 admin**, and ACTIVE assignments covering those records. Add one unassigned doctor/patient pair for isolation tests.

### 13.1 Sample patients

| # | Name | Birth date |
|---|---|---|
| 1 | Aline Test | 2001-04-12 |
| 2 | Eric Sample | 1997-08-23 |
| 3 | Diane Demo | 2004-01-05 |
| 4 | Patrick Mock | 1989-06-18 |
| 5 | Grace Fiction | 1995-11-10 |
| 6 | Jean Example | 2000-02-28 |
| 7 | Bella Sample | 1992-09-17 |
| 8 | Kevin Demo | 2003-07-03 |
| 9 | Sonia Test | 1987-12-14 |
| 10 | David Fiction | 1999-05-21 |

### 13.2 Sample records (synthetic diagnoses)

| Patient | Doctor | Diagnosis | Date |
|---|---|---|---|
| 1 | 1 | Common cold | 2026-01-12 |
| 2 | 1 | Headache | 2026-02-04 |
| 3 | 2 | Allergic rhinitis | 2026-02-26 |
| 4 | 2 | Common cold | 2026-03-10 |
| 5 | 3 | Gastritis | 2026-04-01 |
| 6 | 1 | Headache | 2026-04-17 |
| 7 | 3 | Back pain | 2026-05-09 |
| 8 | 2 | Allergic rhinitis | 2026-06-22 |
| 9 | 3 | Common cold | 2026-07-08 |
| 10 | 1 | Gastritis | 2026-08-15 |

**Expected scoped counts:** Common cold 3 · Headache 2 · Allergic rhinitis 2 · Gastritis 2 · Back pain 1.

Passwords come from environment-backed seed config — never commit real secrets.

---

## 14. Database test matrix

| ID | Behavior |
|---|---|
| DB-01 | Patient registration creates matching `users` + `patients`; role server-assigned |
| DB-02 | Missing JWT → `401` |
| DB-03 | Patient reads own record → `200` |
| DB-04 | Patient A uses Patient B id → concealed `404` + denied audit |
| DB-05 | Assigned approved doctor creates record → `201` + notification/outbox |
| DB-06 | Blank diagnosis → `400` and/or DB check failure |
| DB-07 | Unknown id → `404` |
| DB-08 | Two PATCH with same version → one `200`, one `409` |
| DB-09 | Admin cannot read diagnosis/PDF |
| DB-10 | Revoked assignment blocks doctor access immediately |
| DB-11 | Restricted runtime role cannot bypass RLS |
| DB-12 | Duplicate ACTIVE assignment rejected by unique index |
| DB-13 | Broadcast payload has no clinical content |
| DB-14 | Unauthorized download issues no signed URL and logs denial |
| DB-15 | Notifications recoverable via REST after disconnect |

Mandatory academic set: **DB-01 … DB-08**. Remaining items strengthen the security demonstration.

---

## 15. Migration order

1. Keep Stage 0 `SystemCheck` healthy on database `pmrms`.  
2. Add enums and identity tables (`users`, `patients`, `doctors`).  
3. Add `doctor_patients` + partial unique index + revocation CHECK.  
4. Add `records`, `medical_files`, `record_revisions` + checks/indexes.  
5. Add `notifications`, `access_logs`, `refresh_sessions`, `outbox_events`.  
6. Apply RLS helpers/policies for the restricted runtime role.  
7. Seed admin, doctors, patients, assignments, 10 records.  
8. Wire NestJS transactions with `set_config` + audit path.  
9. Capture professor evidence: ERD, migration SQL, RLS denial, 401/404/409, timeline, analytics.

### 15.1 Environment names (values never committed)

```dotenv
DATABASE_URL=
DIRECT_URL=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
SEED_ADMIN_EMAIL=
SEED_ADMIN_PASSWORD=
```

---

## 16. Traceability

| Assignment expectation | This schema |
|---|---|
| Patients with name + birth date | `patients.full_name`, `patients.birth_date` |
| Records with patient, doctor, diagnosis, file reference | `records.*` + `medical_files.object_key` / optional `records.file_url` |
| PK / FK / NOT NULL | Prisma models + SQL checks |
| 10 sample rows | Seed plan §13 |
| RLS practice | §8 with restricted runtime role tests |
| Private storage | R2 + `object_key` |
| Timeline + diagnosis counts | Indexed queries §12 |
| Concurrent edits | Version + revision §9 |
| Access logging | `access_logs` + denied-attempt path |
| Eight tests | DB-01 … DB-08 |

---

**Document outcome:** A production-minded academic schema with explicit invariants, lifecycles, Prisma 7 models, SQL constraints, RLS posture, concurrency rules, seed data and test evidence. Implementation quality is proven only when migrations, seeds and DB-01…DB-08 pass against the real runtime role.
