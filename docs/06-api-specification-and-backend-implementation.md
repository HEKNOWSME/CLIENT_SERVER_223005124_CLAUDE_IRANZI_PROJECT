# 06 — API Specification and Backend Implementation

**Project:** Patient Medical Records Management System (PMRMS)  
**Version:** 2.0 — 18 November 2026  
**Status:** Implementation blueprint for Stage 1+ NestJS API  
**Related:** Documents `01`–`05` (`*_PR.md` where applicable) · Prisma 7 monorepo in this repository

> **Scope:** REST contracts, NestJS module design, validation, security execution order, curl demos and tests. Endpoints below are **planned** except Stage 0 health. Keep the backend explainable in an academic presentation.

---

## 1. Fixed technical choices

| Concern | Decision |
|---|---|
| Frontend | Next.js 16 — browser calls `/api/*` |
| API | NestJS 11 — global prefix **`/v1`** |
| Proxy | Next rewrite `/api/:path*` → `http://127.0.0.1:3001/v1/:path*` |
| Auth | Custom NestJS JWT + opaque rotating refresh (Document 05) |
| Roles | `ADMIN`, `DOCTOR`, `PATIENT` |
| Database | PostgreSQL (`pmrms` local; Supabase-hosted for demo) |
| ORM | Prisma 7 + `@prisma/adapter-pg` |
| Defense | NestJS guards + relationship checks + PostgreSQL RLS |
| Realtime | Supabase private Broadcast (no NestJS Socket.IO) |
| Files | Private Cloudflare R2 |
| Docs / tests | Swagger at `/docs` · Jest + Supertest |

**Already live (Stage 0):** `GET /v1/health`, `GET /v1/health/live`, OpenAPI at `/docs`.

Admin manages accounts and assignments but **cannot** read diagnoses or PDFs by default. No payments.

---

## 2. API contract logic

### 2.1 Path model

| Caller | Path | Resolves to |
|---|---|---|
| Browser / Next.js | `/api/records` | NestJS `GET /v1/records` |
| curl / partner / Swagger | `http://127.0.0.1:3001/v1/records` | NestJS directly |
| OpenAPI UI | `http://127.0.0.1:3001/docs` | Swagger (no `/v1` prefix) |

Never document Nest routes as `/api/v1/...` for this repo — that would double-prefix through the proxy.

### 2.2 Response envelope

**Resource**
```json
{
  "data": {
    "id": "11111111-1111-4111-8111-111111111111",
    "diagnosis": "Example diagnosis",
    "recordDate": "2026-11-18",
    "version": 1
  }
}
```

**Paginated list**
```json
{
  "data": [],
  "meta": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
}
```

**Error**
```json
{
  "statusCode": 404,
  "code": "RECORD_UNAVAILABLE",
  "message": "Record not found or unavailable.",
  "requestId": "req-example-001",
  "timestamp": "2026-11-18T10:00:00.000Z"
}
```

**No body:** `204` (logout and similar commands).

### 2.3 Status policy

| Status | Meaning |
|---:|---|
| 200 | Read or update OK |
| 201 | Created |
| 204 | Command OK, empty body |
| 400 | Bad UUID/DTO/date/file |
| 401 | Missing/invalid/expired auth |
| 403 | Authenticated but wrong role/operation |
| 404 | Missing **or concealed** clinical resource |
| 409 | Version conflict or duplicate ACTIVE assignment |
| 413 | Upload too large |
| 429 | Rate limited |
| 500 | Unexpected safe failure |
| 503 | Dependency unavailable |

**IDOR rule:** unauthorized clinical IDs return the same `404 RECORD_UNAVAILABLE` as missing IDs. Use `403` for operation-level denials (e.g. patient calling doctor-only create).

### 2.4 Shared conventions

- JSON default; multipart for PDF upload; `application/pdf` stream for download.  
- Protected calls: `Authorization: Bearer <accessToken>`.  
- Refresh: `HttpOnly; Secure; SameSite` cookie (CSRF if cross-site).  
- Path IDs: UUID strings — invalid → `400`.  
- `recordDate`: `YYYY-MM-DD` only.  
- Timestamps: ISO 8601 UTC.  
- Pagination: `page` ≥ 1, `limit` default 20, max 100.  
- Record order: `recordDate DESC, id DESC`.  
- Notification order: `createdAt DESC, id DESC`.  
- Never expose password hashes, refresh hashes, R2 credentials, or raw private object keys to clients.

---

## 3. NestJS module organization

```text
apps/api/
├── prisma/
│   ├── schema.prisma          # Prisma 7 models (Document 04)
│   ├── migrations/
│   ├── seed.ts
│   └── ...
├── prisma.config.ts           # DATABASE_URL via root .env
├── src/
│   ├── main.ts                # prefix v1, helmet, CORS, Swagger /docs
│   ├── app.module.ts
│   ├── config.ts              # Zod-validated env (exists)
│   ├── common/
│   │   ├── decorators/        # @Public, @CurrentUser, @Roles
│   │   ├── guards/            # AccessJwtGuard, AccountStatusGuard, RolesGuard
│   │   ├── filters/           # structured errors + requestId
│   │   ├── interceptors/      # request ID, safe logging
│   │   └── dto/               # PaginationDto
│   ├── prisma/                # runtime client + set_config txn helper
│   ├── auth/
│   ├── users/
│   ├── admin/
│   ├── doctors/
│   ├── patients/
│   ├── records/
│   ├── files/
│   ├── notifications/
│   ├── analytics/
│   ├── audit/
│   ├── realtime/              # token issue + optional outbox publisher
│   └── health/                # Stage 0 readiness/liveness (exists)
└── test/
    ├── auth.e2e-spec.ts
    ├── records.e2e-spec.ts
    ├── admin.e2e-spec.ts
    └── rls.integration-spec.ts
```

**Responsibility rule**

```text
Controller  → parse HTTP, return DTOs
Service     → business rules, authorization orchestration
Repository  → scoped Prisma queries inside RLS transactions
UI          → never the permission authority
Client body → never trusted for role / doctorId / ownership
```

---

## 4. Endpoint catalogue

Legend: `[P]` Patient · `[D]` approved Doctor · `[A]` Admin.  
Protected routes require **ACTIVE** account unless marked Public.

All Nest paths below are under **`/v1`**.

### 4.1 Health (implemented)

| Verb | Route | Who | Result |
|---|---|---|---|
| GET | `/health` | Public | Readiness: DB + seed marker |
| GET | `/health/live` | Public | Process liveness only |

### 4.2 Authentication

| Verb | Route | Who | Purpose |
|---|---|---|---|
| POST | `/auth/register/patient` | Public | Create PATIENT + profile |
| POST | `/auth/register/doctor-request` | Public | Pending doctor request — **no** clinical access |
| POST | `/auth/login` | Public | Access JWT + refresh cookie |
| POST | `/auth/refresh` | Refresh cookie + CSRF header | Rotate refresh; new access JWT |
| POST | `/auth/logout` | Refresh cookie + CSRF header | Revoke session family; clear cookie → `204` |
| POST | `/auth/logout-all` | A/D/P (incl. pending) | Revoke every session of the user → `204` |
| GET | `/auth/me` | A/D/P (incl. pending) | Safe identity summary |
| POST | `/auth/realtime-token` | A/D/P | Short Supabase-verifiable JWT |

**Login request**
```json
{ "email": "patient1@example.test", "password": "DemoPass!12345" }
```

**Login response `200`**
```json
{
  "data": {
    "accessToken": "<jwt>",
    "tokenType": "Bearer",
    "expiresIn": 900,
    "user": {
      "id": "10000000-0000-4000-8000-000000000101",
      "name": "Aline Test",
      "email": "patient.a@example.test",
      "role": "PATIENT",
      "status": "ACTIVE",
      "patientId": "20000000-0000-4000-8000-000000000001",
      "doctorId": null,
      "doctorVerification": null
    }
  }
}
```

Refresh token is **cookie-only** (`pmrms_refresh`, `HttpOnly; SameSite=Strict`, plus `Secure` and the `__Host-` prefix in production) and is never returned in JSON. Cookie-authenticated calls (`/auth/refresh`, `/auth/logout`) must send `X-PMRMS-CSRF: 1`; the header forces a CORS preflight that only `WEB_ORIGIN` passes, and any `Origin` header must be the web app or the API itself.

Auth-specific error codes: `INVALID_CREDENTIALS` (401, identical for unknown email and wrong password), `SESSION_EXPIRED` (401), `ACCOUNT_EXISTS` (409), `ACCOUNT_SUSPENDED` (403), `ACCOUNT_PENDING` (403 on routes that need an approved account), `CSRF_REJECTED` (403) and `RATE_LIMITED` (429 with `Retry-After`, also used for lockout after 5 failed sign-ins).

Demo passwords come from `SEED_DEMO_PASSWORD` in the local `.env`, not from Git.

### 4.3 Admin

| Verb | Route | Who | Purpose |
|---|---|---|---|
| GET | `/admin/users` | A | Paginated account metadata (no clinical fields) |
| PATCH | `/admin/users/:id/status` | A | Activate / suspend |
| GET | `/admin/doctors/pending` | A | Pending doctor requests |
| PATCH | `/admin/doctors/:id/approval` | A | `{ "decision": "APPROVE" \| "REJECT" }` |
| POST | `/admin/assignments` | A | Create ACTIVE assignment |
| PATCH | `/admin/assignments/:id/revoke` | A | Soft-revoke (keep history) |
| GET | `/admin/audit-logs` | A | Security metadata only |

**Create assignment**
```json
{
  "doctorId": "22222222-2222-4222-8222-222222222222",
  "patientId": "33333333-3333-4333-8333-333333333333"
}
```

IDs are `doctors.id` / `patients.id`, **not** `users.id`. Require APPROVED + ACTIVE doctor. Duplicate ACTIVE pair → `409`.

### 4.4 Patients and records

| Verb | Route | Who | Purpose |
|---|---|---|---|
| GET | `/patients/me` | P | Own profile |
| PATCH | `/patients/me` | P | Whitelisted demographic fields |
| GET | `/patients` | D | Assigned patients |
| GET | `/patients/:id` | D or own P | Authorized patient detail |
| GET | `/patients/:id/records` | D or own P | Authorized timeline |
| GET | `/records` | D/P | Scoped list (`page`, `limit`, `diagnosis`, `from`, `to`, optional `patientId`) |
| POST | `/records` | D | Create for ACTIVE assigned patient |
| GET | `/records/:id` | D/P | Detail + audit |
| PATCH | `/records/:id` | D | Correct with `expectedVersion` |
| PATCH | `/records/:id/archive` | D | Soft archive with version |
| POST | `/records/:id/files` | D | Attach validated PDF |
| GET | `/records/:id/files/:fileId/download` | D/P | Authorize, audit, stream PDF |
| GET | `/records/:id/download` | D/P | Convenience: primary/sole file download |

Filters apply **inside** authorization scope — never instead of it.

**Create record**
```json
{
  "patientId": "33333333-3333-4333-8333-333333333333",
  "diagnosis": "Example diagnosis",
  "description": "Fictional teaching example.",
  "recordDate": "2026-11-18"
}
```

`doctorId` is derived from the verified doctor profile. Caller-supplied `doctorId` is ignored/rejected.  
`201` returns `id`, `patientId`, `doctorId`, `diagnosis`, `recordDate`, `status`, `version` and triggers audit + patient notification/outbox.

**Update record**
```json
{
  "expectedVersion": 3,
  "diagnosis": "Corrected example diagnosis",
  "description": "Updated teaching note."
}
```

Stale version →
```json
{
  "statusCode": 409,
  "code": "RECORD_VERSION_CONFLICT",
  "message": "This record was updated by someone else. Refresh before editing.",
  "requestId": "req-example-002",
  "timestamp": "2026-11-18T10:05:00.000Z"
}
```

**Archive:** `{ "expectedVersion": 3 }` — no routine hard delete.

**PDF upload:** `multipart/form-data` field `file`, PDF only, default max **10 MiB**. Validate content signature. Response returns file `id` + safe `originalName` — **not** the private `object_key`.

**PDF download:** stream `application/pdf` with `Content-Disposition: attachment` (default for Network-tab demos). Optional short-lived R2 URL only after the same authz + audit.

### 4.5 Notifications, analytics, audit

| Verb | Route | Who | Purpose |
|---|---|---|---|
| GET | `/notifications` | A/D/P | Own inbox (`page`, `limit`, `unread`) |
| PATCH | `/notifications/:id/read` | Owner | Mark own notification read |
| GET | `/analytics/diagnoses` | D (scoped) / optional own P | Authorized counts only |
| GET | `/audit-logs/me` | A/D/P | Own permitted access history |
| GET | `/admin/audit-logs` | A | Management security metadata |

**Diagnosis analytics `200`**
```json
{
  "data": [
    { "diagnosis": "Example diagnosis A", "count": 4 },
    { "diagnosis": "Example diagnosis B", "count": 2 }
  ]
}
```

Default scope: **ACTIVE** records only. Doctor = assigned patients; patient = own; admin = **no** clinical analytics.

Notifications store kind + optional resource id + timestamps — never diagnosis text or signed URLs.

---

## 5. DTO validation matrix

| DTO | Rules |
|---|---|
| `RegisterPatientDto` | name 2–150, email, strong password, birth date ≤ today |
| `LoginDto` | normalized email, nonempty password |
| `UpdateMyPatientDto` | demographic whitelist only |
| `ApproveDoctorDto` | `APPROVE` \| `REJECT` |
| `UpdateUserStatusDto` | allowed transitions; protect last active admin |
| `CreateAssignmentDto` | two UUIDs, correct profile types, no ACTIVE duplicate |
| `CreateRecordDto` | patient UUID, diagnosis 1–255 trimmed, valid date, bounded description |
| `UpdateRecordDto` | `expectedVersion >= 1`, clinical field whitelist |
| `PaginationDto` | `page >= 1`, `1 ≤ limit ≤ 100` |
| PDF upload | single PDF, signature check, size cap |

Global pipe:

```ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
}));
```

Re-check FKs/uniqueness in services; map known DB violations to stable `400`/`409` codes.

---

## 6. Security execution order

```text
HTTP request
  → requestId + safe logging
  → AccessJwtGuard (sig, exp, iss, aud, alg)
  → AccountStatusGuard (ACTIVE + current role from DB)
  → RolesGuard (operation class)
  → DTO / UUID validation
  → ownership or ACTIVE assignment check
  → Prisma interactive txn + set_config(app.user_id, app.role)
  → trusted audit SUCCESS | DENIED
  → safe envelope response
```

This is the **logical** authorization sequence (Document 05). Test actual Nest guard/pipe order in code.

**RLS:** clinical traffic uses a restricted runtime role — never migration owner / `BYPASSRLS`.  
**Audit:** denials that produce no visible row must still be written on a trusted path that does not vanish with a rolled-back clinical txn.

---

## 7. Create-record backend flow

```text
POST /v1/records
  1. Authenticate doctor (ACTIVE + APPROVED)
  2. Validate CreateRecordDto
  3. Assert ACTIVE assignment(doctor, patientId)
  4. BEGIN txn + set_config
  5. INSERT record (doctorId from verified profile, version=1)
  6. INSERT notification (patient user) + outbox event
  7. INSERT access_log SUCCESS
  8. COMMIT
  9. Publisher emits minimal Broadcast (after commit)
 10. RETURN 201 { data: recordSummary }
```

Realtime payload example (no clinical content):

```json
{
  "event": "record.available",
  "notificationId": "44444444-4444-4444-8444-444444444444",
  "kind": "RECORD_CREATED"
}
```

Clients refetch `/v1/notifications` and authorized records. Prefer DB-trigger Broadcast or an external outbox worker — not an in-process timer on a sleeping free host.

---

## 8. File workflow (R2)

**Upload** `POST /v1/records/:id/files`  
authorize → validate PDF → put private object → write `medical_files` (+ optional `records.file_url` bridge) → audit → cleanup orphan on DB failure.

**Download** `GET /v1/records/:id/files/:fileId/download`  
authorize → audit → stream PDF (default) or short-lived signed GET.

Revoked assignment ⇒ new downloads fail even if an old notification remains.

---

## 9. Implementation order

| Step | Build | Proof |
|---|---|---|
| 0 | Health + OpenAPI (done) | `/v1/health`, `/docs` |
| 1 | Config, modules skeleton, ValidationPipe, exception filter | Boot + typed errors |
| 2 | Clinical Prisma migration + seed (Doc 04) | 10 patients / 10 records |
| 3 | Auth register/login/refresh/logout/me | curl login → JWT |
| 4 | Guards + assignment checks + RLS txn helper | Cross-patient blocked |
| 5 | Admin approvals + assignments | Doctor sees assigned patient |
| 6 | Records list/detail/create/update/archive | Status codes + DTOs |
| 7 | R2 upload/download + audit | Private PDF + denial evidence |
| 8 | Notifications + outbox + Realtime | Generic wake-up event |
| 9 | Analytics + pagination + Swagger polish | Scoped diagnosis counts |
| 10 | Automated tests + README curl + deploy | Partner demo unaided |

---

## 10. Minimum test set

**Mandatory (8)**

1. Patient login succeeds.  
2. Missing/invalid JWT → `401`.  
3. Patient reads own record → `200`.  
4. Other patient’s id → concealed `404` + denied audit.  
5. Approved assigned doctor creates record → `201`.  
6. Invalid create payload → `400`.  
7. Unknown UUID → `404`.  
8. Stale `expectedVersion` → `409`.

**Before demo also cover:** unapproved doctor denied; admin clinical deny; revoked assignment; PDF authz; notification ownership; analytics scope; runtime-role RLS; private Realtime subscribe deny; audit on success and denial.

---

## 11. Partner curl kit

```bash
export API="http://127.0.0.1:3001/v1"
export PATIENT_EMAIL="patient1@example.test"
export PATIENT_PASSWORD="DemoPass!12345"
```

**Health**
```bash
curl -i "$API/health"
```

**Login**
```bash
curl -i -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$PATIENT_EMAIL\",\"password\":\"$PATIENT_PASSWORD\"}"
```

```bash
export TOKEN="<paste-access-jwt>"
curl -i "$API/records" -H "Authorization: Bearer $TOKEN"
```

**Own record**
```bash
export RECORD_ID="<uuid-owned-by-demo-patient>"
curl -i "$API/records/$RECORD_ID" -H "Authorization: Bearer $TOKEN"
```

**Invalid UUID → 400**
```bash
curl -i "$API/records/not-a-uuid" -H "Authorization: Bearer $TOKEN"
```

**Unknown UUID → 404**
```bash
curl -i "$API/records/99999999-9999-4999-8999-999999999999" \
  -H "Authorization: Bearer $TOKEN"
```

**IDOR demo:** Patient A token + Patient B `RECORD_ID` → `404 RECORD_UNAVAILABLE` + denied audit. README must list a safe fictional ID pair.

**PDF download**
```bash
curl -fL "$API/records/$RECORD_ID/download" \
  -H "Authorization: Bearer $TOKEN" \
  --output medical-report.pdf
```

Use `curl -i` without writing to `.pdf` when inspecting error responses.

Swagger: `http://127.0.0.1:3001/docs` (protect or disable in production if required).

---

## 12. Swagger and frontend rules

- Document summary, security scheme, DTOs, status codes, and examples per route.  
- Use `@ApiBearerAuth()`, `@ApiResponse()`, and DTO schemas aligned with runtime.  
- Next.js typed client: central 401 → refresh single-flight; distinguish `404` vs `409`.  
- Never put JWT private keys, R2 secrets, or privileged Supabase keys in `NEXT_PUBLIC_*`.  
- UI states: loading, empty, validation, 401/403/404/409, offline/reconnect.

Shared Zod contracts belong in `packages/contracts` and grow with each domain (health schema already exists).

---

## 13. Error code catalogue (stable)

| Code | Typical status | Meaning |
|---|---:|---|
| `UNAUTHORIZED` | 401 | Missing/invalid token |
| `FORBIDDEN` | 403 | Authenticated, operation not allowed |
| `RECORD_UNAVAILABLE` | 404 | Missing or concealed clinical record |
| `VALIDATION_FAILED` | 400 | DTO / UUID / file rules |
| `RECORD_VERSION_CONFLICT` | 409 | Stale optimistic lock |
| `ASSIGNMENT_CONFLICT` | 409 | Duplicate ACTIVE assignment |
| `RATE_LIMITED` | 429 | Too many auth/API attempts |
| `DEPENDENCY_UNAVAILABLE` | 503 | DB/R2/realtime dependency down |

---

## 14. Definition of done

- [ ] Every endpoint has actor + ownership rule  
- [ ] Examples match implemented DTOs  
- [ ] `400/401/403/404/409` behavior is tested  
- [ ] IDOR does not confirm foreign clinical IDs  
- [ ] Admin has no default clinical read  
- [ ] Prisma runtime queries proven under real RLS role  
- [ ] Access attempts leave durable audit evidence  
- [ ] R2 objects stay private  
- [ ] Realtime private-channel policy tested apart from REST  
- [ ] Partner can run README curl with seeded fictional accounts  
- [ ] Paths match this repo: Nest `/v1`, Next `/api`, Swagger `/docs`  

---

**Next:** Document 07 — Frontend UI/UX and Dashboard Design · Document 08 — Testing, Deployment and Academic Presentation · then implement Stages 1–5 against this contract.
