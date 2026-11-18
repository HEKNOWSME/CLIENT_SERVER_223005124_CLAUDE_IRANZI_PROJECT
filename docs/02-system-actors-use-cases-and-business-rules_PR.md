# 02 — System Actors, Use Cases and Business Rules

**Project:** Patient Medical Records Management System (PMRMS)  
**Document version:** 3.0  
**Date:** 18 November 2026  
**Status:** Proposed specification for academic implementation  
**Related document:** `01-project-overview-and-functional-requirements.md`

## 1. Purpose

This document defines who uses PMRMS, what each person is allowed to do, how the main activities work, and the rules that the server must enforce. It is written to guide the Next.js interfaces, NestJS endpoints, Prisma database design, and automated tests.

The project has **three application roles: ADMIN, DOCTOR and PATIENT**. Doctor and patient are the clinical actors; administrator is a least-privilege management actor who approves doctors, manages account status and controls doctor-patient assignments. ADMIN cannot read clinical records or PDFs by default. The initial administrator is created through a trusted deployment seed/CLI command, never public registration.

### 1.1 Agreed technical baseline

| Concern | Choice | Responsibility |
|---|---|---|
| Web UI | Next.js, TypeScript | Pages, forms, timelines, status messages |
| API | NestJS, TypeScript | Validation, authentication, authorization, business rules, audit logs |
| Identity | Custom JWT authentication | Short-lived access JWTs; refresh-session rotation and revocation |
| Database | PostgreSQL (hosted on Supabase) | Persistent users, assignments, records, logs, notifications |
| ORM | Prisma | Queries, migrations, transactions and concurrency control |
| Defense in depth | PostgreSQL RLS | Database row restrictions when using a non-bypass application role |
| Realtime | Supabase Realtime Broadcast | Private managed WebSocket channels for minimal notifications and update signals |
| File storage | Cloudflare R2 | Private PDF objects, served through authorized backend flows |
| API documentation | Swagger / OpenAPI | Partner curl testing and presentation |
| Tests | Jest + Supertest | Functional, authorization, race-condition and error tests |

**Supabase hosts PostgreSQL and provides Realtime Broadcast only.** Custom authentication remains in NestJS, and PDF storage remains in Cloudflare R2. There are no payment features in scope.

### 1.2 Realtime security boundary

The NestJS access JWT and the Supabase Realtime JWT are separate trust concerns, even if both use JWT format. The NestJS server must issue a Realtime token only to an authenticated active user, with claims Supabase can verify against configured signing keys. Realtime channel names are not security boundaries by themselves: private-channel access is controlled by Supabase Realtime Authorization policies on `realtime.messages`. The frontend retrieves every medical record through NestJS; it does not query clinical tables through the Supabase browser SDK.

## 2. Actors

### 2.1 Patient (primary actor)

A patient is a person with an authenticated account and one linked patient profile.

**Goals:** access their own medical history, view diagnosis and record metadata, follow a chronological timeline, download authorized reports, and receive notifications.

**Allowed:** register as a patient; log in/out; view/update permitted demographic fields; list/view/search own records; download own PDFs; see and mark their own notifications read.

**Not allowed:** see another patient's details; create/edit diagnoses; change clinician identity; assign doctors; view staff-only logs; gain the DOCTOR role by editing a request.

### 2.2 Doctor (primary actor)

A doctor is an authenticated, approved clinician with a linked doctor profile.

**Goals:** manage assigned patients, create and correct medical records, attach PDF reports, review permitted medical history and scoped diagnosis analytics.

**Allowed:** log in/out; view assigned patient profiles; list/view records of authorized assigned patients; create records; update records within policy; attach PDFs; view scoped analytics; receive relevant notifications.

**Not allowed:** access unrelated patients; self-approve a doctor role; change another clinician's records without a defined authorization rule; delete medical history permanently in normal operation; bypass patient assignment checks.

### 2.3 Administrator (management actor)

**Goals:** safely manage users and clinical access assignments without viewing medical data.

**Allowed:** sign in, review minimal user identity/status fields, approve/reject doctor applications, activate/suspend accounts, assign/revoke doctor-patient access, inspect security and management audit metadata, manage own notifications.

**Not allowed:** routine reading of diagnoses, clinical notes, patient PDFs or unrestricted analytics; create clinical records; self-register an ADMIN role. No break-glass clinical-access feature is included in the MVP.

### 2.4 Supporting systems (not user roles)

- **NestJS API:** sole authority for clinical business actions and authorization.
- **PostgreSQL:** stores application data and may enforce native RLS.
- **Cloudflare R2:** stores PDF objects privately; R2 does not decide patient ownership.
- **Supabase Realtime:** hosts private Broadcast subscriptions; Realtime Authorization policies check subscription permissions; database broadcasts send minimal event signals.
- **Browser / Next.js:** displays data and sends requests; never trusted as the enforcement layer.
- **Trusted bootstrap/maintainer:** creates only the first administrator account through a secured seed/CLI process; normal doctor approval and assignments happen through admin endpoints.

## 3. Authorization model

### 3.1 Permission matrix

Legend: **Own** = own personal data; **Assigned** = active doctor-patient relationship; **Creator** = authored record; **Metadata** = minimum information needed to manage relationships; **No** = denied.

| Action | Administrator | Doctor | Patient | Enforcement |
|---|---|---|---|---|
| Public registration | No special role | Cannot self-approve | Yes | Server fixes public role to PATIENT |
| Login/logout | Yes | Yes | Yes | Verified JWT and active account |
| Read/edit own profile | Own | Own | Own | Field allowlist |
| List accounts and statuses | Yes (minimum metadata) | No | No | Admin guard and projected fields |
| Approve/reject doctor | Yes | No | No | Active ADMIN and audit |
| Activate/suspend user | Yes | No | No | Active ADMIN and audit |
| Assign/revoke doctor-patient relationship | Yes | No | No | Active ADMIN and audit |
| List/view patient demographics | Metadata only for assignments | Assigned | Own | Scoped query and RLS |
| List/view medical records | **No** | Assigned | Own | Clinical guard and RLS |
| Create medical record | No | Assigned | No | Approved doctor and assignment |
| Edit/archive clinical record | No | Creator + assignment | No | Version and audit |
| Upload/download medical PDF | **No** | Authorized | Own download only | Backend-authorized R2 access |
| View diagnosis analytics | No default access | Assigned scope | Own scope optional | Scoped aggregate |
| View security/admin audit metadata | Yes | Limited optionally | Own optionally | Filtered audit API |
| View/mark own notifications | Own | Own | Own | Recipient ownership |
| Subscribe to private Realtime channel | Own events only | Own authorized events | Own authorized events | Verified JWT + Realtime RLS policies |

### 3.2 Authorization decision

For every protected medical-record request:

1. Verify access JWT and find the active user.
2. Determine their current role and status from trusted server-side data (not a client-submitted role claim alone); ADMIN is not equivalent to clinical permission.
3. Locate the record through an **authorized, scoped query**; check the patient ownership or active doctor assignment.
4. Enforce creator-only write rules where applicable.
5. Record the attempt and outcome, including denied attempts when technically feasible.
6. Return appropriate status and a safe response without revealing unrelated patient data.

**Concealment policy:** For record IDs that exist but are outside the actor's scope, return `404 RECORD_NOT_FOUND` to avoid confirming existence; record the internal denial reason in the audit log. Use `403` for known operations prohibited for the actor's role (such as a patient POST to create a clinical record). Use `401` for missing/invalid authentication, `400` for invalid input, and `409` for stale updates.

### 3.3 PostgreSQL RLS and Prisma caveat

Application authorization is mandatory even if RLS is enabled. Prisma can use database credentials that bypass RLS if configured incorrectly. The design must use a restricted non-owner database role where appropriate, set trusted user context **within a transaction**, and test the actual connection mode. Do not claim RLS is enforced until verified by integration tests. Security-definer functions and elevated service credentials must be strictly controlled.

## 4. Use-case catalogue

| ID | Use case | Primary actor | Priority | Core outcome |
|---|---|---|---|---|
| UC-01 | Register patient account | Patient | Must | Patient account created securely |
| UC-02 | Sign in and sign out | Both | Must | Authenticated session / revocation |
| UC-03 | View/edit personal profile | Both | Must | Allowed personal fields updated |
| UC-04 | View assigned patient list | Doctor | Must | Only assigned patients listed |
| UC-05 | View patient profile and timeline | Doctor | Must | Authorized clinical history displayed |
| UC-06 | Create medical record | Doctor | Must | New record committed and logged |
| UC-07 | Attach PDF report | Doctor | Must | Private R2 object linked to record |
| UC-08 | List/search/filter records | Both | Must | Authorized results only |
| UC-09 | Open record details | Both | Must | Protected details returned and logged |
| UC-10 | Preview/download PDF | Both | Must | Authorized private file delivered |
| UC-11 | Correct existing record | Doctor | Must | Concurrency-safe update and revision |
| UC-12 | Archive record | Doctor | Should | Historical record preserved |
| UC-13 | View diagnosis analytics | Doctor | Must | Scoped diagnosis counts |
| UC-14 | Receive realtime update | Both | Must | Private event signals fresh data |
| UC-15 | View/manage notifications | Both | Must | Persisted read/unread state |
| UC-16 | Reject unauthorized record access | Both | Must | No data leak and logged denial |
| UC-17 | Concurrent record modification | Doctor | Must | Stale write rejected with 409 |
| UC-18 | Partner executes API with README | Test partner | Must | Independently reproducible curl calls |
| UC-19 | Browser push | Both | Could | Push with opt-in, separate from Supabase Realtime |
| UC-20 | List/manage account status | Admin | Must | Account visibility limited; suspension audited |
| UC-21 | Approve or reject a doctor | Admin | Must | Only approved active doctors gain clinical permissions |
| UC-22 | Assign/revoke a doctor-patient relationship | Admin | Must | Membership controls access and revocation is audited |
| UC-23 | View security/management audit trail | Admin | Must | Safe investigation metadata, no clinical document contents |
| UC-24 | Attempt admin access to clinical record | Admin | Must | Denied by default and attempt audited |

## 5. Detailed use cases

### UC-01 — Register a patient

**Actor:** Patient  
**Preconditions:** Email is not registered.  
**Trigger:** User submits signup form.

**Normal flow:** (1) Enter name, email, password and birth date; (2) Next.js sends form to NestJS; (3) backend validates and hashes password; (4) a USER with role PATIENT and linked PATIENT row is created in a transaction; (5) backend returns a safe account response and starts authentication according to policy.

**Alternatives:** Duplicate email → `409`; invalid fields → `400`; failed transaction → no half-created profile; role `DOCTOR` submitted in payload → ignored/rejected.

**Acceptance:** No public request can create or elevate a doctor or administrator account.

### UC-02 — Login, token refresh and logout

**Actor:** Doctor or patient  
**Preconditions:** Active user account.

**Normal flow:** (1) Submit credentials; (2) verify password hash; (3) issue short-lived NestJS access JWT and refresh session/token; (4) protected REST calls use the access JWT; (5) a trusted backend flow issues a separate Supabase-compatible short-lived Realtime token; (6) refresh rotates session tokens; (7) logout revokes refresh session, clears client subscriptions and limits residual Realtime access through token expiry and reauthorization.

**Alternatives:** Invalid credentials → generic `401`; suspended account → denied; expired access JWT → `401` then controlled refresh; invalid refresh token → re-login.

**Acceptance:** Passwords are never stored in plain text; access tokens are not trusted without signature, issuer, audience and expiry verification; cookies are HttpOnly/Secure where used and CSRF controls apply to cookie-authenticated actions.

### UC-04 — Doctor lists assigned patients

**Actor:** Doctor  
**Normal flow:** Doctor requests `GET /api/v1/patients`; NestJS resolves doctor identity and filters by active assignments; paginated patient summaries are returned.

**Alternatives:** No assignments → `200 []` plus an empty-state message; patient account calls endpoint → `403`.

**Acceptance:** Changing query parameters cannot list unrelated patients; total counts are scoped.

### UC-05 — Doctor opens a patient and views timeline

**Actor:** Doctor  
**Normal flow:** Doctor selects an assigned patient; NestJS checks assignment; loads permitted profile and medical history sorted by `record_date` descending; records are displayed on Next.js timeline.

**Alternatives:** Assignment revoked → concealed `404`; records empty → helpful empty state.

**Acceptance:** Doctor cannot use a changed `patientId` to access unrelated history.

### UC-06 — Doctor creates medical record

**Actor:** Doctor  
**Preconditions:** Approved doctor, active patient assignment.

**Normal flow:** (1) Select assigned patient; (2) enter diagnosis, optional description and record date; (3) POST to NestJS; (4) validate fields, role and assignment; (5) derive `doctor_id` server-side; (6) insert record and audit event; (7) create persisted notification for patient; (8) after commit, publish a minimal private Supabase Broadcast event; (9) Next.js refreshes authorized list/timeline.

**Alternatives:** Invalid diagnosis/date → `400`; no assignment → concealed `404` for patient resource; database error → no success event.

**Acceptance:** Patient never creates diagnoses; doctor ID cannot be spoofed in request body; a notification does not leak diagnosis text.

### UC-07 — Upload a PDF

**Actor:** Doctor  
**Preconditions:** Authorized to edit target record.

**Normal flow:** Doctor chooses PDF; NestJS checks access and validates actual file content, extension, MIME and size; backend uploads to private R2 object key; saves key/metadata with record; logs operation.

**Alternatives:** Invalid file → `400` or `413` depending on payload size; R2 upload fails → record unchanged; database write fails after upload → compensating cleanup of orphan object or a retryable cleanup job.

**Acceptance:** No public bucket; no permanently exposed URL; server credentials never appear in browser.

### UC-08 — List/search/filter records

**Actor:** Doctor or patient  
**Normal flow:** Request `GET /api/v1/records?search=...&page=...`; backend applies authorization scope first, then filtering/sorting/pagination; frontend shows list or empty state.

**Acceptance:** Search and pagination metadata never reveal other patients' record totals.

### UC-09 — Open record detail

**Actor:** Doctor or patient  
**Normal flow:** Click record; Next.js requests `GET /api/v1/records/:id`; NestJS validates token and ownership/assignment, logs access and returns permitted fields.

**Alternatives:** Malformed ID → `400`; missing or concealed record → `404`; invalid JWT → `401`.

**Acceptance:** Direct URL manipulation cannot expose another patient's information. A denied attempt is visible in the audit table to a trusted investigator.

### UC-10 — Download PDF

**Actor:** Doctor or patient  
**Normal flow:** Click download; backend verifies record access and file association; logs access decision; returns a controlled file stream or a very short-lived R2 signed URL; browser downloads PDF.

**Alternatives:** No attachment → `404`; forbidden record → concealed `404`; object missing → safe error and server log.

**Acceptance:** Old signed URLs expire quickly and are treated as bearer credentials; no PDF key or URL grants indefinite public access.

### UC-11 — Correct a record

**Actor:** Creator doctor with current assignment  
**Preconditions:** Record version known.

**Normal flow:** Doctor opens edit form with current `version`; submits PATCH including expected version; NestJS checks permission, attempts atomic conditional update where `id` and `version` match and increments version; records revision and audit event in a transaction; emits an update signal after commit.

**Alternatives:** Version stale → `409 RECORD_CONFLICT`, frontend offers reload; malformed input → `400`; record hidden → `404`.

**Acceptance:** Two parallel updates using the same version cannot both silently succeed.

### UC-12 — Archive record

**Actor:** Creator doctor with current assignment  
**Normal flow:** Request archive; server marks `status=ARCHIVED` with an auditable change rather than deleting medical history.

**Acceptance:** Archived records remain available to authorized historical views with clear labeling.

### UC-13 — Diagnosis analytics

**Actor:** Doctor  
**Normal flow:** Request `GET /api/v1/analytics/diagnoses`; backend groups medical records by normalized diagnosis **only within current doctor's authorized patient scope**; frontend shows chart or empty state.

**Acceptance:** Counts never include unrelated patients; diagnoses remain free-text in MVP, so spelling variants may be separate categories.

### UC-14 — Receive realtime medical updates

**Actor:** Doctor or patient  
**Normal flow:** Next.js obtains a short-lived Supabase-compatible Realtime JWT from the trusted backend, connects to Supabase Realtime and subscribes to a private `user:{verifiedUserId}` channel; RLS policies on `realtime.messages` authorize the topic. After the database transaction commits, a trusted database-trigger/outbox workflow publishes a minimal Broadcast event (such as `record.created`, `record.updated` or `notification.created`); Next.js fetches current authorized data via NestJS REST.

**Alternatives:** Invalid or untrusted Realtime JWT → subscription rejected; revoked assignment → REST denied immediately and new private subscriptions denied; existing subscriptions are constrained by short token expiry/re-authorization (not assumed to vanish instantly); disconnected client → notifications fetched from REST on reconnect.

**Acceptance:** One patient never receives another patient's events or diagnosis content. Realtime is an update signal, not a separate path to bypass API permissions.

### UC-15 — Manage notifications

**Actor:** Doctor or patient  
**Normal flow:** List own notifications; show unread badge; mark chosen notification read using authenticated API; update UI in realtime when connected.

**Acceptance:** API only returns and modifies rows with `recipient_user_id = currentUser.id`.

### UC-16 — Attempt to open someone else's record

**Actor:** Patient  
**Normal flow:** Patient A changes record ID in URL to one owned by Patient B; backend checks authorized scope; returns `404` and logs DENIED (internal reason `OWNERSHIP_MISMATCH`); Next.js displays "Record not found or unavailable".

**Acceptance:** Response must not contain patient B's name, diagnosis, PDF key, doctor name or any confirmation that the record exists.

### UC-17 — Two users edit simultaneously

**Actor:** Authorized doctor sessions  
**Normal flow:** Two sessions load version 3; first PATCH succeeds and increments version to 4; second PATCH with expected version 3 returns `409`; second user refreshes and decides whether to reapply changes.

**Acceptance:** Final data reflects only a valid committed update; no silent lost update.

### UC-18 — Partner validates API from README

**Actor:** Fellow student/test partner  
**Normal flow:** Partner follows setup/seed instructions, obtains a demo token with curl, lists their own records, opens an allowed record, requests a forbidden record, creates a doctor record, and observes expected status codes.

**Acceptance:** No undocumented manual database step is needed; all sample accounts use synthetic data.

### UC-20 — Manage account status

**Actor:** Administrator  
**Preconditions:** Active ADMIN account created by trusted bootstrap.  
**Normal flow:** Admin opens account-management page; NestJS returns limited user metadata; admin suspends or reactivates an eligible account; NestJS validates the change, writes an audit entry and revokes active sessions and prevents new Realtime authorization; existing subscriptions are constrained through short token lifetimes and reauthorization.  
**Alternatives:** Non-admin → `403`; missing user → `404`; invalid transition or attempted self-lockout → `400`/`409` under documented policy.  
**Acceptance:** Suspended users cannot call protected REST endpoints or continue receiving private realtime events.

### UC-21 — Approve or reject a doctor

**Actor:** Administrator  
**Preconditions:** Doctor applicant account exists in PENDING status through controlled onboarding/invitation.  
**Normal flow:** Admin reviews nonclinical applicant details; submits approve/reject decision; NestJS verifies ADMIN role, updates approval state, records who decided and when, and notifies the applicant.  
**Alternatives:** Unapproved doctor attempts clinical API → `403`; non-admin approval request → `403`; repeat decision handled idempotently or with `409`.  
**Acceptance:** No doctor gets clinical permissions from public registration or an unapproved account.

### UC-22 — Assign or revoke a doctor-patient relationship

**Actor:** Administrator  
**Preconditions:** Doctor is APPROVED and ACTIVE; patient account is valid.  
**Normal flow:** Admin selects doctor and patient by limited identity metadata; submits assignment; NestJS checks uniqueness, saves actor/time and audits; an authorized doctor subsequently sees the assigned patient. For revocation, NestJS records the revocation and updates relevant Realtime authorization state and prevents new unauthorized subscriptions; existing subscriptions follow the token-expiry mitigation policy.  
**Alternatives:** Duplicate active assignment → `409`; unauthorized admin action → `403`; missing doctor/patient → `404`.  
**Acceptance:** A revoked assignment immediately blocks API reads and new private channel authorization. Existing Realtime subscriptions are not assumed to be revoked instantaneously; sensitive payloads remain minimal and token lifetime is bounded.

### UC-23 — Review security and management audit entries

**Actor:** Administrator  
**Normal flow:** Admin opens filtered audit table; NestJS returns action, actor, target reference, timestamp and outcome only; admin may search denied requests and role/assignment changes.  
**Acceptance:** No diagnoses, clinical notes, PDF bytes, tokens or reusable signed links appear in audit results.

### UC-24 — Admin attempts to open a clinical record

**Actor:** Administrator  
**Normal flow:** Admin directly requests `GET /api/v1/records/:id` or `/download`; NestJS denies clinical permission, logs outcome and returns safe `403` (role-denied) without querying the file from R2.  
**Acceptance:** ADMIN cannot bypass patient ownership merely because they manage accounts.

## 6. Business rules

### Identity and roles

- **BR-001:** One user ID identifies a single application account; one patient profile maps to exactly one patient user.
- **BR-002:** A user has one active application role: DOCTOR or PATIENT.
- **BR-003:** Public registration only creates PATIENT accounts; doctor provisioning requires a trusted approval method.
- **BR-004:** All protected operations derive actor identity from server-verified credentials.
- **BR-005:** Password hashes use an appropriate password hashing algorithm (Argon2id recommended); never log passwords or raw tokens.
- **BR-006:** Refresh sessions can be revoked; suspended users lose access through server-side checks.

### Patient and doctor authorization

- **BR-007:** A patient may read only the patient profile linked to their authenticated user ID.
- **BR-008:** A patient may read and download only records belonging to their patient profile.
- **BR-009:** A doctor may view patient information only when an active authorized assignment exists.
- **BR-010:** Only an authorized doctor may create clinical records, and the server sets the author ID.
- **BR-011:** In MVP, only the creating doctor with an active assignment may edit or archive a record.
- **BR-012:** Revocation of a doctor-patient assignment blocks future reads, downloads, writes and realtime access to that patient's data by that doctor.
- **BR-013:** A doctor-patient assignment cannot be created by an ordinary doctor or patient endpoint.

### Medical records and files

- **BR-014:** Every record has one valid patient ID, one valid doctor ID, a nonempty diagnosis and record date.
- **BR-015:** Records include created and updated timestamps, status and monotonically increasing version.
- **BR-016:** Clinical corrections must be attributable to a doctor and retain change history.
- **BR-017:** Normal operation archives records rather than hard-deleting clinical history.
- **BR-018:** Each private PDF object has a unique key associated with an authorized record; direct public access is disabled.
- **BR-019:** NestJS authorizes every file action, including preview and download.
- **BR-020:** Never place clinical diagnosis or full patient details inside realtime event payloads or generic push notifications.

### Audit, errors and consistency

- **BR-021:** Record detail views, downloads, creation, modification, archives and denied access attempts are audited where identifiable; login failures are separately security-logged without medical details.
- **BR-022:** Audit records store actor, action, target reference, outcome, time and safe reason code. They must not be editable by patients or doctors.
- **BR-023:** `400` invalid input; `401` missing/invalid login; `403` role/action denied; `404` missing/concealed resource; `409` conflicting update.
- **BR-024:** NestJS enforces HTTP clinical access, PostgreSQL RLS protects database rows with a non-bypass role, and Supabase Realtime authorization policies separately protect private Broadcast subscriptions.
- **BR-025:** Notifications are created transactionally with the corresponding database event where practical; event delivery occurs only after commit.
- **BR-026:** Supabase Realtime private channels must use a trusted Supabase-compatible JWT and `realtime.messages` RLS authorization, never a client-provided role or unverified patient/doctor ID.
- **BR-027:** Concurrent record updates use an atomic expected-version check; stale writes are rejected.
- **BR-028:** All analytics queries are restricted to the authenticated requester's authorized scope.
- **BR-029:** All demos, seeds and screenshots use synthetic medical data, not real patient information.

### Administrator-specific business rules

- **BR-030:** Only a securely bootstrapped active ADMIN may approve doctors, change account statuses, or create/revoke assignments.
- **BR-031:** Public registration always creates PATIENT accounts; a client-supplied ADMIN or DOCTOR role has no authority.
- **BR-032:** ADMIN is not a clinical superuser and has no routine access to records, diagnoses, PDFs or global clinical analytics.
- **BR-033:** Every admin approval, suspension, account-role change and assignment operation is auditable, with minimal metadata.
- **BR-034:** An administrator cannot grant clinical access to a pending/rejected/suspended doctor.
- **BR-035:** Role/status changes or assignment revocation must immediately invalidate relevant HTTP authorization and prevent new unauthorized Realtime subscriptions; short-lived Realtime tokens and reauthorization bound stale sessions.
- **BR-036:** Account management must guard against accidentally suspending the last active administrator; admin bootstrap secrets must stay server-side.

## 7. State and lifecycle rules

### 7.1 Administrator account

`BOOTSTRAPPED_ACTIVE -> SUSPENDED` (no public admin registration; changes restricted to controlled administration).

### 7.2 Doctor account

`PENDING -> APPROVED/REJECTED`; approved doctors may be `ACTIVE -> SUSPENDED`. Only administrators approve; public registration never grants active DOCTOR permissions.

### 7.3 Doctor-patient assignment

`ACTIVE -> REVOKED`. Historical relationships may be retained for audit, but revoked assignments grant no access.

### 7.4 Medical record

`ACTIVE -> ARCHIVED`. Corrections increase version and add revision entries; archiving does not erase it.

### 7.5 Notification

`UNREAD -> READ`, owned by one recipient. Offline users can retrieve pending notifications after they return.

## 8. Realtime event contracts (minimal payloads)

| Event | Recipient | Payload suggestion | Client behavior |
|---|---|---|---|
| `notification.created` | Recipient private channel | `{ notificationId, type, createdAt }` | Refresh notification list |
| `record.created` | Patient channel and authorized doctor channel(s) | `{ recordId, eventId }` | Refresh authorized record list |
| `record.updated` | Authorized private channels | `{ recordId, eventId, version }` | Re-fetch details via REST |
| `record.archived` | Authorized private channels | `{ recordId, eventId }` | Re-fetch list |

**Event delivery rules:** private Supabase Realtime Broadcast only, after a committed database change; select authorized recipients using trusted database state. Realtime JWTs are issued by a backend process and must be verifiable by Supabase. Realtime RLS policies on `realtime.messages` deny cross-user topic access. Refresh from NestJS REST on reconnect because Broadcast is not durable history. Use event IDs for deduplication and persisted notification rows for offline users; add a transactional outbox if stronger delivery guarantees are required. No always-on NestJS websocket server is needed.

**Confidentiality:** Event payloads contain IDs, event types and version numbers only, never diagnosis text, names, PDFs or presigned URLs. Supabase client keys can be public only when they are intended publishable/anon keys; `service_role` credentials and JWT signing keys always stay server-side.

**Revocation:** A policy change may not instantly eject an existing channel subscriber. Enforce REST revocation immediately, prevent new unauthorized subscriptions and use short-lived Realtime tokens plus reauthorization to reduce exposure.

## 9. UI implications and states

| View | Normal | Empty | Error / security |
|---|---|---|---|
| Admin approval queue | Pending doctor applications | "No pending approvals" | Unauthorized role shows 403; failed approval shows retry |
| Admin assignments | Searchable minimum patient/doctor metadata | "No active assignments" | Invalid pair or duplicate assignment |
| Patient medical timeline | Date-ordered own records | "No medical records yet" | "Could not load your records" |
| Doctor assigned patients | Searchable authorized patients | "No assigned patients" | "Could not load patients" |
| Create record | Validated form, optional PDF | N/A | Inline validation; forbidden assignment error |
| Record detail | Diagnosis, date, doctor, PDF | "No document attached" | "Record not found or unavailable" |
| Notifications | Unread count/list | "You're all caught up" | Retry load; reconnect indicator |
| Edit record | Current version displayed | N/A | `409`: "This record changed. Reload before saving." |
| Analytics | Diagnosis counts/chart | "No records to analyze" | "Unable to load analytics" |

All pages must show loading states where network calls occur. UI-level role hiding is usability only and cannot replace server authorization.

## 10. Database entities implied by these use cases

1. `users` (credentials or auth identities, ADMIN/DOCTOR/PATIENT role and status)
2. `refresh_sessions` (hashed refresh identifiers, revocation, expiry)
3. `patients` (user FK, name, birth date)
4. `doctors` (user FK, approval status)
5. `doctor_patients` (doctor FK, patient FK, status, assignment timestamps)
6. `records` (patient FK, doctor FK, diagnosis, record_date, private file key, status, version)
7. `record_revisions` (who changed what and when)
8. `record_access_logs` (actor, resource, action, outcome and time)
9. `notifications` (recipient FK, type, message summary, read timestamp)
10. `admin_action_logs` (or generalized audit entries for administrative changes; actor, target, decision, time)

The original professor-required `patients(name, birth_date)` and `records(patient_id, doctor_id, diagnosis, file_url)` fields remain represented; `file_url` is implemented as a private storage object key rather than a public link. Seed at least ten synthetic patient/record rows as specified in the assignment.

## 11. Acceptance scenarios / verification checklist

| Scenario | Setup and action | Expected result |
|---|---|---|
| AC-01 | Patient A requests own record | `200`; own fields only; access logged |
| AC-02 | Patient A requests Patient B's record ID | Concealed `404`; no leaked fields; denied event logged |
| AC-03 | Unauthenticated request for medical record | `401`; no data |
| AC-04 | Patient POSTs diagnosis | `403`; no record created |
| AC-05 | Doctor opens assigned patient's record | `200`; access logged |
| AC-06 | Doctor opens unrelated patient's record | Concealed `404`; no data |
| AC-07 | Bad date or malformed ID | `400`; validation response |
| AC-08 | Missing accessible record | `404` |
| AC-09 | Authorized doctor creates record | `201`; patient notification stored; realtime signal after commit |
| AC-10 | Patient receives event while online | Updated bell / timeline after authorized REST refetch |
| AC-11 | Patient offline when doctor creates record | Notification appears on next login without relying on past Realtime event |
| AC-12 | Patient tries to download unrelated PDF | Denied; no file contents or reusable access URL |
| AC-13 | Two doctors/sessions edit same version | One succeeds; stale request receives `409` |
| AC-14 | Doctor's assignment revoked | Further HTTP and realtime access blocked |
| AC-15 | Diagnosis analytics | Counts only authorized records |
| AC-16 | Partner uses README and curl | Can reproduce allowed, denied, 400 and 404 scenarios |
| AC-17 | Public sign-up attempts `role: ADMIN` or `DOCTOR` | Privilege elevation refused |
| AC-18 | Admin approves pending doctor | Doctor becomes approved with audit metadata |
| AC-19 | Admin assigns doctor then revokes access | Authorized access exists only while assignment is active |
| AC-20 | Admin directly requests clinical record/PDF | `403`, no clinical data or signed URL, denial logged |
| AC-21 | Suspended doctor sends REST request or Realtime event | Denied; Realtime channel membership invalidated |

### Minimum automated backend test suite (at least eight)

1. Access JWT validation rejects missing/invalid tokens.
2. Patient can read their own medical record.
3. Patient cannot read another patient's record and attempt is logged.
4. Doctor can create a record for an assigned patient.
5. Doctor cannot create a record for an unassigned patient.
6. Invalid medical record input returns `400`.
7. Missing record returns `404`.
8. Stale concurrent update returns `409` and does not overwrite.
9. Non-admin cannot approve doctors or assign patients.
10. Admin can approve a pending doctor and create/revoke an assignment, with audit entries.
11. Admin cannot read a clinical record or download its PDF.
12. Suspended doctor cannot use protected REST or retain realtime access.

Recommended additions: RLS integration tests using the **actual Prisma DB role**; private R2 download permission tests; private Supabase Realtime channel authorization and cross-user isolation; scoped analytics; notification ownership; doctor assignment revocation; audit log persistence.

## 12. Presentation scripts and evidence

### 12.1 Whiteboard: doctor opens a record (four-step flow)

1. **Client (Next.js):** Doctor selects a record; browser sends bearer JWT to NestJS.
2. **NestJS:** Validates JWT, determines doctor, checks active assignment, records access outcome.
3. **Database / storage:** Prisma runs scoped PostgreSQL query (RLS as defense in depth); R2 is accessed only if the doctor requests an authorized file.
4. **Response:** NestJS returns the authorized record; Next.js renders details or an appropriate error.

### 12.2 Network-tab and database proof

In browser developer tools, display the HTTP request to the **NestJS API** and status/response. In the Supabase database table editor, show the synthetic record and matching access-log row. A Supabase-hosted PostgreSQL database does **not** imply that the browser calls Supabase directly. Show the separate WebSocket connection to Supabase Realtime for private notification events; clinical data still comes from NestJS.

### 12.3 Break-it-on-purpose demonstration

Login as Patient A, copy a record ID belonging to Patient B, paste it in `/patient/records/:id`, inspect the NestJS response (`404`), verify no sensitive fields appear, and show the denied access-log row. Explain that changing a frontend URL cannot change authenticated identity.

### 12.4 Pair-swap and curl demonstration

README must include environment setup, migration/seed instructions, demo synthetic credentials, login curl request, bearer token use, expected response status, and error examples. No undocumented setup step should be required.

### 12.5 Realtime and concurrency demonstration

Open doctor and patient browsers concurrently. Create a record as doctor; patient receives a Supabase Realtime Broadcast signal and sees an updated list without page refresh. Next, open one record in two authorized edit sessions; save the first and show `409` on the second stale save.

## 13. Assumptions and decisions to validate

- One patient belongs to one authenticated user; one doctor can be assigned to many patients; a patient can have multiple authorized doctors.
- Public signup is patient-only. First ADMIN is securely bootstrapped; doctor applicants are invited/provisioned and approved by admin, who also manages assignments.
- Doctor write permission in MVP is restricted to the record creator with current assignment.
- Record IDs are opaque UUIDs, but authorization is still mandatory.
- The app uses **private** R2 objects and no public medical attachment links.
- Supabase hosts PostgreSQL and provides Realtime Broadcast; NestJS serves the clinical REST API and JWT authentication.
- The app has persistent **in-app** notifications; browser push is an optional later feature.
- At least ten synthetic sample rows are inserted, with two or more patient identities to test unauthorized access.
- NestJS hosting needs HTTP support, not persistent WebSocket support. A sleeping free backend may still delay record refresh/API requests.

