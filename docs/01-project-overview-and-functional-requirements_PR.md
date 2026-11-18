# Patient Medical Records Management System (PMRMS)

**Document:** 01 — Project Overview and Functional Requirements  
**Version:** 4.0  
**Date:** 18 November 2026  
**Project type:** Academic full-stack application  
**Status:** Planning baseline  
**Primary clinical actors:** Doctor, Patient  
**System management actor:** Administrator

## 1. Executive overview

The Patient Medical Records Management System (PMRMS) is a secure web application for creating, viewing, organizing, and downloading patient medical records. Approved doctors can manage records for patients they are authorized to treat. Administrators manage accounts, doctor approvals and assignments without routine access to clinical records. Patients can review their own histories and access permitted PDF reports. A chronological timeline, real-time updates, audit trails, and diagnosis counts improve usability and accountability.

### 1.1 Approved technical stack

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind CSS | Admin, doctor and patient portals |
| Backend | NestJS, TypeScript | REST API, validation, clinical business rules, access authorization, logging |
| Authentication | Custom NestJS JWT authentication | Registration, login, access and refresh tokens, logout |
| Passwords | Argon2id | Password hashing and verification |
| Database | Supabase-hosted PostgreSQL | Persistent application data and database-enforced RLS |
| ORM | Prisma | Data modeling, migrations, queries, transactions |
| Realtime | Supabase Realtime Broadcast (private channels) | Managed WebSocket connections and minimal event signals without persistent NestJS sockets |
| Object storage | Cloudflare R2 | Private medical PDF objects |
| Storage client | AWS SDK for JavaScript v3 | Server-side R2 operations and short-lived signed links |
| In-app notifications | PostgreSQL + Supabase Realtime | Durable notifications, unread state and live refresh signals |
| Browser push (optional) | Web Push or Firebase Cloud Messaging | Opt-in browser notifications when app is not active |
| API documentation | Swagger / OpenAPI | Endpoint contracts and interactive demonstration |
| Tests | Jest, Supertest, Playwright (optional E2E) | Backend integration, security and UI tests |
| Deployment | Vercel + suitable Node.js host + Supabase + R2 | Public academic demonstration over HTTPS |

**Explicitly excluded:** Better Auth, Django, Supabase Auth, Supabase Storage and PawaPay. The project does not include payment features.

### 1.2 Architecture principles

1. Next.js handles the presentation layer; NestJS owns business rules and medical-record authorization.
2. Prisma connects to Supabase-hosted PostgreSQL. Supabase also provides **Realtime Broadcast**; NestJS remains the sole clinical REST API and authorization authority.
3. A JWT is a signed credential, **not** a complete authentication system: NestJS implements password verification, issuance, refresh rotation, expiry, logout and revocation.
4. NestJS authorization and PostgreSQL Row Level Security (RLS) provide defense in depth. They are separate controls and both must be tested.
5. Cloudflare R2 holds private files. PostgreSQL holds object keys and metadata, never persistent public download links.
6. Next.js subscribes to **private Supabase Realtime Broadcast channels** using Supabase-compatible, short-lived JWTs issued through a trusted backend workflow. Realtime authorization policies restrict subscriptions; payloads carry minimal metadata only. The UI fetches clinical content through NestJS.
7. Database updates and events must not expose private clinical data or silently lose concurrent edits.

## 2. Problem statement

Paper records and disconnected digital documents can be difficult to find, organize and share with the right patient. Patients may not have an easy way to follow their medical history or retrieve reports. Uncontrolled digital access can expose sensitive diagnoses and files.

PMRMS addresses this by centralizing authorized medical-record workflows, adding chronological views and private document delivery, and recording access attempts. The prototype demonstrates modern full-stack concepts while keeping the scope suitable for a university presentation.

## 3. Objectives

### 3.1 General objective

Design and build a secure web-based system in which doctors manage authorized patient medical records and patients independently access their own records.

### 3.2 Specific objectives

1. Provide working patient registration, login, logout and refresh-token workflows.
2. Separate administrator, doctor and patient roles with enforced permissions, and provision the first admin securely.
3. Model relational patients, doctors, assignments, records, notifications and audit trails.
4. Implement validated REST APIs with consistent success and error responses.
5. Ensure patients see only their records and doctors see only records within authorized assignments.
6. Store and distribute PDF medical documents through a private Cloudflare R2 bucket.
7. Display a medical-record timeline, record details, filters and downloads.
8. Update relevant screens and notification indicators using private Supabase Realtime Broadcast.
9. Demonstrate PostgreSQL RLS independently of NestJS role guards.
10. Provide diagnosis-count analytics restricted to authorized records.
11. Prevent lost updates during simultaneous edits.
12. Document, test and deploy a complete working academic demo.

## 4. Scope

### 4.1 Required scope (MVP)

- Admin, doctor and patient accounts, secure login and logout. Public registration creates PATIENT accounts only.
- Bootstrap the first ADMIN through a controlled seed/CLI process; admins approve doctors and manage account status.
- Patient profiles and admin-controlled doctor-patient assignments, including revocation and access reviews.
- Doctor: create, list, view and correct authorized medical records.
- Patient: view only their own records and permitted PDF reports.
- Search/filter, records timeline, and record detail pages.
- Private Cloudflare R2 PDF upload and download.
- Authentication, NestJS access guards, database RLS, input validation and audit logs.
- Diagnosis analytics within the caller's permission scope.
- Live in-app notifications for newly added records.
- Explicit loading, empty, success and error states.
- Optimistic concurrency, eight or more automated backend tests and live deployment.

### 4.2 Optional enhancements (after MVP)

- Browser push notifications with an explicit opt-in.
- Doctor comments/follow-up notes and richer timeline filters.
- Record revision history and audit-log viewer.
- Email alerts that do not include diagnosis or confidential content.
- Accessibility and user-experience enhancements.

### 4.3 Out of scope

- PawaPay or any payment processing.
- Real hospital or laboratory integrations; prescription issuance.
- AI diagnosis, patient triage or treatment recommendations.
- Real patient data in the academic demo.
- Unrestricted administrator access to diagnoses, medical PDFs or clinical notes. Admin access to clinical content is denied by default.
- Self-service administrator or doctor privilege elevation.

## 5. Actors and permissions

### 5.1 Administrator (system management)

An administrator manages account status, approves or rejects doctor applicants, assigns and revokes doctor-patient relationships, and investigates security/audit events. The first administrator is bootstrapped through a protected deployment command or seed. **An admin has no default right to read diagnoses, clinical notes or medical PDFs.** Admin access to patient profile metadata is limited to what is needed for assignments; break-glass access to clinical content is outside the MVP.

### 5.2 Patient (primary clinical actor)

A patient may register, sign in, edit permitted demographic information, view their own authorized medical records, download their own PDFs, and receive notifications. Patients cannot create or edit diagnoses, assign doctors or see other patients' data.

### 5.3 Doctor (primary clinical actor)

An approved and active doctor may view assigned patients, create and correct authorized records, upload PDFs and view scoped analytics. A doctor may not access unrelated patients or approve themselves.

### 5.4 Account and assignment trust

Public registration creates **PATIENT** accounts only, ignoring or rejecting role fields supplied by a browser. A doctor applicant uses a controlled onboarding flow or is invited by an administrator; only an active approved doctor can act clinically. Admins create and revoke assignments with audit entries. Suspended accounts and revoked assignments lose access to protected HTTP routes immediately; private realtime subscriptions must be reauthorized, with short-lived realtime tokens and enforced policies to bound stale subscriptions.

### 5.5 Permission matrix

| Action | Admin | Doctor | Patient |
|---|---|---|---|
| Create public account | No special privilege; bootstrap/invite only | Approval or trusted invitation needed | Yes |
| Manage account status and roles | Yes, policy-controlled | No | No |
| Approve or suspend doctors | Yes | No | No |
| Assign/revoke doctor-patient relationship | Yes | No | No |
| View patient profile metadata | Minimum needed for assignments | Assigned patients | Own profile |
| View clinical records, diagnoses or notes | **No by default** | Authorized assigned patients | Own only |
| Create/correct/archive clinical records | No | Authorized (creator for edits) | No |
| Upload medical PDF | No | Authorized doctor | No |
| Download medical PDF | No | Authorized assigned patients | Own only |
| View diagnosis analytics | No default clinical access | Authorized scope only | Optional own scope |
| View security/access logs | Authorized system-wide metadata | Limited permitted history (optional) | Own history (optional) |
| View and manage own notifications | Yes | Yes | Yes |
| Subscribe to private Supabase Realtime channels | Own admin events only | Own authorized events | Own authorized events |

## 6. Functional requirements

Each ID is stable for implementation, test cases and project defense.

### 6.1 Authentication and identity

- **FR-001 — Registration:** The system shall permit patient registration with name, valid email and password.
- **FR-002 — Login:** NestJS shall validate credentials and issue a short-lived signed access JWT.
- **FR-003 — Refresh:** The system shall provide a refresh mechanism using rotating, revocable refresh tokens stored securely.
- **FR-004 — Logout:** Logout shall revoke the refresh session; access tokens naturally expire after their short lifetime (or may be explicitly denied where supported).
- **FR-005 — Role enforcement:** Protected NestJS endpoints shall validate the JWT and fetch or verify the caller's current role; client-supplied role fields shall not grant privileges.
- **FR-006 — Account provisioning:** Public registration shall create patient accounts only. The first admin shall be bootstrapped securely, and doctor activation shall require admin approval or controlled provisioning.
- **FR-007 — Profile:** An authenticated user may view and update permitted nonclinical profile fields.
- **FR-055 — Admin management:** An active administrator shall list account status/role metadata and activate or suspend accounts without receiving clinical-record access.
- **FR-056 — Doctor approval:** An administrator shall approve or reject doctor applications, with an auditable decision; applicants have no DOCTOR permissions until approval.
- **FR-057 — Assignment management:** An administrator shall create/revoke doctor-patient assignments through protected APIs and record the acting admin, target IDs, action and time.
- **FR-058 — Admin least privilege:** Admin API and database privileges shall exclude routine reading/downloading of diagnoses, notes, medical records and PDFs.

### 6.2 Patient and doctor relationships

- **FR-008 — Patient creation:** Registering a patient shall create a profile associated with exactly one user identity.
- **FR-009 — Patient lookup:** Patients shall read only their own profile; doctors shall look up assigned patients only.
- **FR-010 — Patient update:** A patient may update allowed demographic fields; sensitive clinical fields are doctor-controlled.
- **FR-011 — Assigned list:** Doctors shall list and search only assigned patients.
- **FR-012 — Assignment:** An authorized administrator shall assign and revoke doctor-patient relationships without deleting clinical history; all changes shall be audited.
- **FR-013 — Relationship check:** Every protected doctor operation involving patient data shall verify current assignment and appropriate record privileges.

### 6.3 Medical records

- **FR-014 — Create record:** Authorized doctors shall create records containing patient ID, doctor ID derived from their authenticated identity, diagnosis and medical event date; PDF attachment is optional.
- **FR-015 — List records:** The API shall return only records authorized for the caller, with pagination and permitted filters.
- **FR-016 — View details:** Authorized users shall view diagnosis, clinician, event date, descriptive notes if permitted, and file presence.
- **FR-017 — Correct record:** An authorized doctor shall edit a record with a version-based concurrency check and audit trail.
- **FR-018 — Archive:** Authorized doctors may archive records; ordinary users shall not hard-delete medical history.
- **FR-019 — Search:** Authorized users shall search by diagnosis and filter/sort by event date.
- **FR-020 — Timeline:** The UI shall display chronological medical events with links to details and documents.

### 6.4 Private PDFs with Cloudflare R2

- **FR-021 — Upload:** The backend shall accept a PDF only after verifying doctor authorization, patient assignment, file type and file size.
- **FR-022 — Private storage:** All medical documents shall remain in a private R2 bucket, with no public bucket-domain access.
- **FR-023 — Object reference:** The database shall persist an R2 object key and file metadata, not a public URL.
- **FR-024 — Secure download:** NestJS shall authorize each preview/download request and then stream the object or issue a short-lived, scoped presigned GET URL.
- **FR-025 — File protection:** API secrets and R2 credentials shall never be exposed in the browser; signed URLs shall be temporary and not logged in analytics or permanent logs.

### 6.5 Realtime and notifications

- **FR-026 — Live updates:** When an authorized doctor creates or updates a record, affected patient UI views shall receive a minimal realtime signal without page refresh.
- **FR-027 — Private subscriptions:** The backend shall issue or broker a Supabase-compatible Realtime JWT with verified identity claims; Realtime Authorization (RLS policies on `realtime.messages`) shall prevent patient A from subscribing to patient B's private channel. The browser shall never receive a service-role key or JWT signing secret.
- **FR-028 — Persisted notifications:** The system shall create database-backed notification entries for relevant record events, with type, recipient, timestamp and read state.
- **FR-029 — Notification center:** Users shall see their own notification list and unread count and be able to mark notifications as read.
- **FR-030 — Re-fetch after event:** Upon an authorized event, Next.js shall request current record data from NestJS rather than trusting event content as clinical truth.
- **FR-031 — Reconnect behavior:** After Realtime connection loss or token expiration, the frontend shall reauthenticate and refresh notifications and records through NestJS. Account or assignment changes shall block REST access immediately and prevent future unauthorized Realtime authorization; existing subscriptions must be constrained by token expiry and reauthorization strategy.
- **FR-032 — Optional browser push:** If implemented, users must explicitly opt in, and push messages shall not include diagnoses or document contents.

### 6.6 Security and audits

- **FR-033 — Ownership isolation:** A patient shall never retrieve, update or download another patient's medical records.
- **FR-034 — Doctor isolation:** A doctor shall access only records allowed by current relationships and business rules.
- **FR-035 — Audit attempts:** Authenticated successful and denied access attempts shall generate audit records with actor, target, action, timestamp and outcome; relevant unauthenticated denials may be logged with null actor.
- **FR-036 — PostgreSQL RLS:** Medical data tables shall have database-enforced row-level policies demonstrated with a non-bypass database role and trustworthy caller context.
- **FR-037 — Validation:** Invalid request payloads or malformed IDs shall return HTTP 400.
- **FR-038 — Authentication failure:** Unauthenticated requests shall return HTTP 401.
- **FR-039 — Forbidden or hidden records:** The system shall return HTTP 403 when exposing lack of permission is acceptable, or HTTP 404 to conceal whether a private record exists; the choice must be consistent and documented.
- **FR-040 — Missing resource:** A genuinely missing accessible record shall return HTTP 404.
- **FR-041 — Secret handling:** Secrets shall be kept in backend environment settings and never committed or returned through an endpoint.

### 6.7 Analytics, interface and usability

- **FR-042 — Diagnosis analytics:** `GET /analytics/diagnoses` shall return counts of records grouped by diagnosis, limited to the caller's authorized scope.
- **FR-043 — Doctor dashboard:** Doctors shall see assigned patients, record actions and scoped statistics.
- **FR-059 — Admin dashboard:** Administrators shall see account/approval queues, assignment management and scoped audit metadata with no routine medical-record viewer.
- **FR-044 — Patient dashboard:** Patients shall see their own history, timeline and notifications.
- **FR-045 — List page:** Provide a searchable, paginated medical-record list.
- **FR-046 — Create form:** Provide a validated clinical-record form accessible only to authorized doctors.
- **FR-047 — Detail page:** Provide a readable medical-record details page with secure PDF action.
- **FR-048 — UI states:** Every data-dependent page shall show loading, empty, unauthorized/not-found and server-error states as appropriate.
- **FR-049 — Responsive UI:** The system shall work on desktop and small screens with accessible navigation.

### 6.8 Reliability and demonstrability

- **FR-050 — Concurrent updates:** Two simultaneous edits shall not silently overwrite one another; a stale version shall receive HTTP 409 Conflict.
- **FR-051 — Consistent writes:** Record and notification changes shall use database transactions and a reliable after-commit event mechanism (e.g., outbox worker) where required.
- **FR-052 — Tests:** The backend shall include at least eight automated tests covering auth, authorization, validation, missing records, logging and conflicts.
- **FR-053 — API documentation:** Swagger and README shall document setup, seed accounts, JWT usage, curl commands and expected responses.
- **FR-054 — Deployment:** The application, backend and required hosted services shall be configured for a working HTTPS demo.

## 7. Non-functional requirements

| ID | Attribute | Acceptance target |
|---|---|---|
| NFR-001 | Privacy | No direct public access to medical PDFs or unauthorized patient records |
| NFR-002 | Security | Hashed passwords, signed JWT verification, token rotation, RBAC, ownership checks, RLS and minimal event payloads |
| NFR-003 | Auditability | Successful and denied record access attempts are attributable where possible and queryable in tests |
| NFR-004 | Performance | Target typical local/staging API reads below 500 ms excluding file transfer, measured rather than assumed |
| NFR-005 | Reliability | Correct state after retries, failed uploads and concurrent operations |
| NFR-006 | Data integrity | Primary/foreign keys, NOT NULL, unique constraints, transactions and conflict protection |
| NFR-007 | Maintainability | Modular NestJS controllers/services, Prisma schema and reusable Next.js components |
| NFR-008 | Accessibility | Semantic controls, keyboard access, form labels and readable errors |
| NFR-009 | Realtime resilience | Missed events recoverable by API refresh after reconnect |
| NFR-010 | Observability | Structured errors, request IDs where appropriate and protected audit history |
| NFR-011 | Testability | Seeded fictional users, documented curl flows and repeatable automated tests |
| NFR-012 | Deployment | HTTPS for frontend and API, private credentials, separate environment configuration |

## 8. Core business rules

- **BR-001:** One patient account maps to one patient profile.
- **BR-002:** A record belongs to exactly one patient and references its authoring doctor.
- **BR-003:** The authoring doctor ID must come from trusted authenticated server context, not from a submitted body field.
- **BR-004:** Only an approved doctor with a valid assignment can create a clinical record for a patient.
- **BR-005:** Patients can access records only where `record.patient_id` matches their own linked patient profile.
- **BR-006:** Doctor read and update access must pass assignment and any record-specific editing rules.
- **BR-007:** A database role with `BYPASSRLS` cannot serve as evidence that Prisma queries are protected by RLS.
- **BR-008:** Realtime broadcasts shall contain safe IDs/event types only; a subscribed UI independently fetches authorized data.
- **BR-009:** A notification belongs to exactly one recipient and cannot be read or marked as read by another account.
- **BR-010:** Medical PDFs are private, and their object keys shall never function as unrestricted public links.
- **BR-011:** Any medical-record access attempt shall be audited, including denials.
- **BR-012:** Archived records remain available in authorized history; hard deletion is outside normal workflows.
- **BR-013:** Lost updates are blocked with record versions and a conditional database update.
- **BR-014:** The academic demo contains only synthetic patient data.
- **BR-015:** The initial ADMIN shall be seeded through trusted deployment tooling; public signup cannot request ADMIN or DOCTOR.
- **BR-016:** Only an active ADMIN can approve doctors, suspend accounts and create/revoke doctor-patient assignments.
- **BR-017:** ADMIN is a management role, not a clinical superuser; admins cannot routinely read medical records or retrieve medical PDFs.
- **BR-018:** Suspension or assignment revocation takes effect on subsequent REST checks immediately. Realtime tokens must be short-lived, private-channel policies must check current permissions, and existing subscriptions must not be assumed to be revoked instantly merely by changing database rows.
- **BR-019:** Every administrator approval, suspension and assignment change is audited, with no diagnosis or PDF content in the log.

## 9. Preliminary data model

**Auth is managed by application tables**, not Supabase Auth. Final Prisma naming can be refined in the database-design document.

### 9.1 `users`

`id` (PK, UUID), `name` (NOT NULL), `email` (UNIQUE, NOT NULL), `password_hash` (NOT NULL), `role` (ADMIN/DOCTOR/PATIENT, NOT NULL, default PATIENT), `status` (NOT NULL), `created_at`, `updated_at`.

### 9.2 `refresh_sessions`

`id` (PK), `user_id` (FK, NOT NULL), `token_hash` (NOT NULL), `expires_at`, `revoked_at` (nullable), `created_at`. Used for refresh rotation and logout.

### 9.3 Admin identity

Administrators are represented by `users.role = ADMIN`; a separate `admins` table is unnecessary for the MVP. Admin actions are tracked in `admin_action_logs` or a generalized `audit_logs` table with an explicit action and target.

### 9.4 `patients`

`id` (PK), `user_id` (UNIQUE FK to users, NOT NULL), `name` (NOT NULL), `birth_date` (NOT NULL), `created_at`, `updated_at`.

### 9.5 `doctors`

`id` (PK), `user_id` (UNIQUE FK to users, NOT NULL), `name` (NOT NULL), `approval_status` (PENDING/APPROVED/REJECTED, NOT NULL), `approved_by_user_id` (nullable FK to users), `approved_at` (nullable), `created_at`, `updated_at`.

### 9.6 `doctor_patients`

`id` (PK), `doctor_id` (FK, NOT NULL), `patient_id` (FK, NOT NULL), `assigned_by_user_id` (FK to users), `assigned_at`, `revoked_by_user_id` (nullable FK to users), `revoked_at` (nullable). Enforce at most one active relationship per pair.

### 9.7 `records`

`id` (PK), `patient_id` (FK, NOT NULL), `doctor_id` (FK, NOT NULL), `diagnosis` (NOT NULL), `description` (nullable), `file_key` (nullable), `record_date` (NOT NULL), `status` (NOT NULL), `version` (integer, NOT NULL, default 1), `created_at`, `updated_at`.

### 9.8 `record_access_logs`

`id` (PK), `actor_user_id` (FK, nullable), `resource_type`, `resource_id`, `action`, `outcome`, `reason_code`, `created_at`, and limited diagnostic metadata. Avoid diagnoses in general-purpose logs.

### 9.9 `admin_action_logs` (or unified audit event type)

`id` (PK), `actor_admin_user_id` (FK, NOT NULL), `action`, `target_type`, `target_id`, `outcome`, `created_at`. Admin events may instead be represented in one unified audited-events table; no diagnosis or PDF content is stored.

### 9.10 `notifications`

`id` (PK), `recipient_user_id` (FK, NOT NULL), `type` (NOT NULL), `record_id` (nullable FK), `message` (non-sensitive), `read_at` (nullable), `created_at`.

### 9.11 `outbox_events` (recommended)

`id` (PK), `event_type`, `aggregate_id`, `recipient_user_id`, `payload` (non-sensitive), `status`, `created_at`, `published_at` (nullable). Supports safe after-commit event dispatch.

### 9.12 `record_revisions` (recommended)

`id` (PK), `record_id` (FK), `changed_by_user_id` (FK), `old_version`, `new_version`, `change_summary`, `created_at`.

### 9.13 Professor's minimum dataset

The first migration/seed deliverable shall contain the required `patients(name, birth_date)` and `records(patient_id, doctor_id, diagnosis, file_url)` concepts, with primary keys, foreign keys and NOT NULL rules. In the implementation, `file_url` is deliberately renamed **`file_key`** because private R2 objects should not be stored as public URLs. Insert **at least 10 fictional sample rows for each core table where practical**, plus seeded doctors, assignments and user accounts, so authorization cases can be demonstrated.

## 10. API contract (preliminary)

Base URL: `/api/v1`. Auth endpoints are implemented by NestJS, not by Supabase Auth.

| Method | Endpoint | Purpose | Access |
|---|---|---|---|
| POST | `/auth/register` | Register patient account | Public |
| POST | `/auth/login` | Obtain access JWT and refresh session | Public |
| POST | `/auth/refresh` | Rotate refresh token | Valid refresh credential |
| POST | `/auth/logout` | Revoke refresh session | Authenticated/refresh session |
| GET | `/auth/me` | Current user and role | Authenticated |
| GET | `/admin/users` | List limited account metadata | Admin |
| PATCH | `/admin/users/:id/status` | Activate/suspend account | Admin |
| GET | `/admin/doctors/pending` | View doctor approval queue | Admin |
| PATCH | `/admin/doctors/:id/approval` | Approve/reject doctor | Admin |
| POST | `/admin/assignments` | Assign approved doctor to patient | Admin |
| DELETE | `/admin/assignments/:id` | Revoke assignment (soft revoke) | Admin |
| GET | `/admin/audit-logs` | Read security and admin-action metadata | Admin |
| GET | `/patients/me` | Own patient profile | Patient |
| PATCH | `/patients/me` | Update permitted profile fields | Patient |
| GET | `/patients` | List assigned patients | Doctor |
| GET | `/patients/:id` | View authorized patient | Doctor / own patient |
| GET | `/patients/:id/records` | Patient record list | Authorized |
| GET | `/records` | List authorized records | Patient / doctor |
| POST | `/records` | Create record | Approved assigned doctor |
| GET | `/records/:id` | View details | Authorized |
| PATCH | `/records/:id` | Correct record, require version | Authorized doctor |
| PATCH | `/records/:id/archive` | Archive record | Authorized doctor |
| POST | `/records/:id/file` | Upload PDF | Authorized doctor |
| GET | `/records/:id/download` | Secure PDF stream or short-lived URL | Authorized |
| GET | `/analytics/diagnoses` | Diagnosis totals, scoped | Authorized |
| GET | `/notifications` | Personal notifications | Authenticated |
| PATCH | `/notifications/:id/read` | Mark own notification read | Authenticated |
| GET | `/audit-logs` | Permitted audit entries | Restricted |

**Status code policy:** `200` for reads/updates, `201` for creation, `400` for invalid payloads, `401` for unauthenticated access, `403` for explicit permission denials, `404` for missing or intentionally concealed private resources, and `409` for version conflicts.

## 11. User workflows

### 11.1 Administrator approves doctor and creates assignment

1. Bootstrap an admin through a trusted seed/CLI command and log in.
2. Open the pending doctor queue; approve a verified fictional doctor account.
3. Select a patient and assign the approved doctor through protected admin endpoints.
4. NestJS checks the current ADMIN role, validates both accounts and relationship constraints, saves the change and audits it.
5. The doctor sees the assigned patient; the administrator still cannot access clinical diagnoses or PDFs.
6. Suspending the doctor or revoking the assignment immediately blocks clinical REST access and prevents new unauthorized private Realtime subscriptions; existing subscriptions follow the short-token reauthorization policy.

### 11.2 Doctor opens a medical record — professor's four-step trace

1. **Client:** Next.js sends `GET /api/v1/records/:id` with the access JWT to NestJS.
2. **NestJS:** It validates the JWT and role, checks the patient assignment and record permission, and logs the attempt. It uses Prisma for the database query.
3. **Supabase PostgreSQL:** The query returns the authorized record from PostgreSQL; RLS is also evaluated when the configured query role and identity context are RLS-enforced.
4. **Response:** NestJS returns the permitted record JSON (or a consistent error), and Next.js renders details. If the user clicks Download, NestJS performs a *separate* authorization check before accessing Cloudflare R2.

**Evidence for presentation:** Browser Network shows the frontend request to NestJS. NestJS request logs or a trace show the Prisma query. Supabase Table Editor shows the seeded record and the resulting audit entry. The browser must not contain R2 credentials or a privileged Supabase key.

### 11.3 Doctor creates a record with a PDF

1. Doctor selects an assigned patient and submits a validated form.
2. NestJS authenticates the doctor and verifies an active assignment.
3. NestJS validates the PDF and writes it to a private R2 object key.
4. NestJS creates the record and a recipient notification (and outbox event) in PostgreSQL.
5. If the database transaction fails after R2 upload, NestJS deletes the unused object or schedules cleanup.
6. After commit, an authorized realtime event notifies the patient to re-fetch their records from NestJS.
7. Patient sees a new timeline entry and a notification without exposing the diagnosis in event payloads.

### 11.4 Patient opens and downloads their own record

1. Patient authenticates and requests their own records.
2. NestJS applies role, ownership and database authorization.
3. Patient selects a record and opens details.
4. On download, NestJS rechecks authorization and logs the attempt.
5. NestJS streams the private PDF or returns a very short-lived presigned R2 GET URL.

### 11.5 Patient changes the ID in the URL

1. Patient A requests Patient B's record ID.
2. NestJS verifies A's identity but rejects the ownership check.
3. Server records a denied attempt without revealing confidential diagnosis details.
4. Response is `404 Not Found` for the selected concealment policy, with a generic client message: **“Record not found or unavailable.”**
5. The same record remains accessible to Patient B and an authorized doctor.

### 11.6 Two users edit a record simultaneously

1. Two editing sessions of the same authorized creator doctor both read version `3`.
2. Session A submits an update conditional on version `3`; it succeeds and changes version to `4`.
3. Session B submits an update conditional on version `3`; the condition matches no row.
4. API returns `409 Conflict`: **“This record was updated by someone else. Refresh before editing.”**
5. Session B reloads version `4`. Audit history records the accepted change and the conflict where appropriate.

## 12. Supabase Realtime authentication and PostgreSQL RLS design

**Realtime connection:** Next.js uses `@supabase/supabase-js` to join **private Broadcast channels** such as `user:<verified-user-id>`. Supabase hosts the WebSocket connection, so the NestJS host only needs normal HTTP support. The client must not be permitted to subscribe to another user's channel by choosing a different channel name.

**Identity bridge:** NestJS retains custom access/refresh JWT authentication for REST. For Supabase Realtime, a trusted backend endpoint issues a short-lived **Supabase-compatible JWT**, signed with a key configured as trusted by the Supabase project, containing appropriate `sub`, `role`, `exp`, and verified application claims. A NestJS access JWT is **not automatically valid for Supabase**. Realtime Authorization policies on `realtime.messages` must authorize private topic subscriptions using verified claims and current user/account/assignment state. No Supabase `service_role` credential, signing key, or R2 credential is exposed to the browser.

**Event publication:** After a successful PostgreSQL transaction, an authorized database trigger / transactional outbox may publish a minimal private Broadcast notification. Supabase's database Broadcast functions and policies must be deployed/tested explicitly. Do not publish diagnoses, clinical notes, PDF links or patient identity data in events. When receiving an event, Next.js calls the protected NestJS REST API to refresh records and notifications. Reconnect always triggers a REST resynchronization because Broadcast is not durable history.

**Revocation caveat:** Realtime authorization at join does not guarantee an existing subscription will be instantly severed when an assignment is revoked. Use brief Realtime token lifetimes, enforce current policies during authorization/refresh, and disconnect or force resubscription where the implementation supports it. Critically, all subsequent clinical REST reads must deny access immediately. For highly sensitive updates, avoid publishing to broad doctor channels and minimize event contents.

**Deployment:** No persistent NestJS WebSocket server or Socket.IO adapter is required. Supabase Realtime remains independent of whether a free NestJS host sleeps, but a sleeping NestJS API may still delay REST refreshes and logins.

**Prisma / PostgreSQL RLS warning:** A database owner, service role or role with `BYPASSRLS` is not proof of RLS protection. Use a restricted runtime role and trusted request context inside database transactions for row-policy-enforced medical queries, and verify it with database-backed tests. Separate privileged migrations/bootstrap from normal application queries. Admin's identity **must not** imply unrestricted database access to medical records.

## 13. Test plan

At least eight automated **NestJS** tests replace the professor's Django-test requirement while verifying equivalent behaviors:

| Test ID | Scenario | Expected result |
|---|---|---|
| T-01 | Valid patient credentials | Login succeeds and JWT is issued |
| T-02 | No access JWT on protected route | `401` |
| T-03 | Patient requests own record | `200`, appropriate record only |
| T-04 | Patient requests another patient's record | `404` (concealment policy), denied audit entry |
| T-05 | Assigned doctor creates record | `201`, correct doctor/patient references |
| T-06 | Malformed input, bad date or invalid ID | `400` |
| T-07 | Missing record | `404` |
| T-08 | Two concurrent versioned updates | One succeeds; stale one receives `409` |
| T-09 | Unassigned doctor requests record | Denied and logged |
| T-10 | Unauthorized PDF request | No R2 object or signed URL disclosed |
| T-11 | Diagnosis analytics query | Counts only permitted records |
| T-12 | Patient subscribes to other patient's realtime channel | Subscription rejected |
| T-13 | Non-bypass DB role queries records under different identity contexts | PostgreSQL RLS isolates rows |
| T-14 | Notification read API called for another user's notification | Denied |
| T-15 | Client reconnects after missing a realtime event | Fetches latest records and notifications |
| T-16 | Public signup requests ADMIN/DOCTOR role | Role escalation rejected |
| T-17 | Admin approves doctor and creates assignment | Audit entry and controlled state changes |
| T-18 | Admin requests a clinical record/PDF | Denied, despite ADMIN role |
| T-19 | Revoked assignment or suspended doctor uses REST/Realtime | REST denied immediately; new Realtime authorization denied; verify stale-session mitigation |

Use integration tests with a disposable test database and synthetic users. Demonstrate RLS with SQL/database-backed tests rather than relying only on mocked Prisma queries.

## 14. Interfaces and states

**Public:** Login, Patient Registration, Access Denied, Not Found.
**Admin:** Dashboard, User Accounts, Doctor Approval Queue, Doctor-Patient Assignments, Security/Audit History (metadata only).  
**Patient:** Dashboard, My Profile, My Medical Records, Record Detail, Timeline, Notifications, PDF View/Download.  
**Doctor:** Dashboard, Assigned Patients, Patient Details, Records List, Create Record, Edit Record, Record Detail, Diagnosis Analytics, permitted Audit History.

All pages must handle **loading**, **empty result**, **validation error**, **unauthorized/unavailable**, **network/server error**, and **success** states as appropriate. Form submit actions must avoid accidental duplicate record creation.

## 15. Professor's practical evaluation checklist

- [ ] Whiteboard the four-step flow: Next.js → NestJS → Supabase PostgreSQL → NestJS response.
- [ ] Explain where JWT validation and ownership checks happen.
- [ ] Show two users and demonstrate ownership isolation by changing a record ID.
- [ ] Show the denied API response and audit entry.
- [ ] Show browser Network evidence that medical data requests go through NestJS.
- [ ] Show data and logs in Supabase Table Editor.
- [ ] Demonstrate actual PostgreSQL RLS using the non-bypass role.
- [ ] Seed at least 10 fictional sample records and document the seed command.
- [ ] Document curl commands and demo credentials so a partner can test with only README.
- [ ] Demonstrate admin approval/assignment and show that admin is denied clinical-record access.
- [ ] Demonstrate private R2 storage and a short-lived authorized PDF download.
- [ ] Demonstrate realtime notification and a refreshed records timeline.
- [ ] Demonstrate a safe concurrent-update conflict with `409`.
- [ ] Run eight or more backend tests.
- [ ] Show deployed Next.js, NestJS, Swagger and a working live demo.

## 16. Implementation phases

| Phase | Work | Deliverable |
|---|---|---|
| 1 | Finalize requirements, use cases, architecture and security decisions | Documentation baseline |
| 2 | Design ERD, Prisma models, migrations, sample users and 10+ records | Working seeded database |
| 3 | Implement NestJS registration, login, refresh, logout, JWT, seeded admin and admin-driven doctor approval | Auth and admin modules |
| 4 | Implement admin-managed doctor-patient assignments, records APIs, guards and audited access | Authorized REST API |
| 5 | Implement RLS with a non-bypass runtime role and database tests | Demonstrable database policy enforcement |
| 6 | Integrate Cloudflare R2 private PDFs | Secure report workflow |
| 7 | Implement Next.js admin/doctor/patient dashboards, timeline and PDF interface | Working frontend |
| 8 | Implement private Supabase Realtime Broadcast, policy-controlled subscriptions, notification triggers and reconnect refresh | Live in-app updates |
| 9 | Add analytics, concurrency protection, negative tests and OpenAPI examples | Complete tested MVP |
| 10 | Deploy and prepare whiteboard, Network tab, SQL evidence and partner README | Professor-ready live demo |
| Optional | Browser push and advanced records history | Extended prototype |

## 17. Definition of done

The project is complete when a seeded administrator can approve a doctor, assign a patient and review audited management actions without reading clinical data; an approved doctor can create and view an authorized patient record; that patient can view it in their history, receive a live notification, and download its PDF; another patient cannot access that record or file; the denied attempt is logged; diagnosis analytics are scoped; RLS is independently demonstrated; concurrent edits cannot overwrite silently; eight or more backend tests pass; and a partner can use the README to make the prescribed curl calls against the deployed API.

## 18. Technical references

- Supabase PostgreSQL RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Realtime Broadcast: https://supabase.com/docs/guides/realtime/broadcast
- Supabase Realtime Authorization: https://supabase.com/docs/guides/realtime/authorization
- Supabase JWT authentication: https://supabase.com/docs/guides/auth/jwts
- Supabase Prisma guidance: https://supabase.com/docs/guides/database/prisma
- Cloudflare R2 presigned URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/

