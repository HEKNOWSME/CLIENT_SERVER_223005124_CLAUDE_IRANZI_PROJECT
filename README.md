# Patient Medical Records Management System (PMRMS)

**Academic full-stack project**  
**Student:** Claude Iranzi · **ID:** 223005124  
**Course context:** Client–Server systems  
**Repository:** `CLIENT_SERVER_223005124_CLAUDE_IRANZI_PROJECT`

PMRMS is a secure web application for creating, viewing, organizing, and downloading patient medical records. Approved doctors manage records for assigned patients; administrators manage accounts and assignments; patients review their own history and permitted PDF reports.

> **Current milestone:** the full clinical database schema (with database-enforced integrity rules), seeded demo data and JWT authentication are implemented. Clinical record APIs, RLS, R2 storage and realtime features are next. See [`docs/`](docs/).

---

## Table of contents

1. [Objectives](#1-objectives)
2. [Technology stack](#2-technology-stack)
3. [Repository structure](#3-repository-structure)
4. [System architecture (current)](#4-system-architecture-current)
5. [Prerequisites](#5-prerequisites)
6. [Quick start](#6-quick-start)
7. [Verification](#7-verification)
8. [Useful commands](#8-useful-commands)
9. [Documentation](#9-documentation)
10. [Development roadmap](#10-development-roadmap)
11. [Academic & security notes](#11-academic--security-notes)

---

## 1. Objectives

| # | Goal |
| --- | --- |
| 1 | Secure registration, login, logout and refresh-token workflows |
| 2 | Role separation: Administrator, Doctor, Patient |
| 3 | Authorized medical-record CRUD with assignment-based access |
| 4 | Private PDF storage and short-lived download links |
| 5 | Chronological timeline, filters, diagnosis counts and audit trails |
| 6 | Realtime UI updates via private broadcast channels |
| 7 | Defense in depth: NestJS authorization + PostgreSQL RLS |
| 8 | Documented, tested academic demo suitable for presentation |

Full functional requirements and business rules live in [`docs/`](docs/).

---

## 2. Technology stack

| Layer | Technology | Role |
| --- | --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 | User interface |
| Backend | NestJS 11, TypeScript, Swagger / OpenAPI | REST API and business rules |
| Validation | Zod (shared contracts package) | Typed request/response schemas |
| Database | PostgreSQL | Persistent data |
| ORM | Prisma 7 (`@prisma/adapter-pg`) | Models, migrations, queries |
| Monorepo | pnpm workspaces | Build orchestration |
| Auth | NestJS JWT (HS256) + rotating refresh cookie + Argon2id | Sessions and password hashing |
| Storage *(planned)* | Cloudflare R2 | Private medical PDFs |
| Realtime *(planned)* | Supabase Realtime Broadcast | Live UI signals |

**Explicitly out of scope:** Better Auth, Django, Supabase Auth/Storage, payment integrations.

---

## 3. Repository structure

```text
CLIENT_SERVER_223005124_CLAUDE_IRANZI_PROJECT/
├── apps/
│   ├── web/                 # Next.js frontend (port 3000)
│   └── api/                 # NestJS API + Prisma (port 3001)
├── packages/
│   ├── contracts/           # Shared Zod schemas and TypeScript types
│   └── typescript-config/   # Shared strict TS config
├── docs/                    # Requirements and design baseline
├── scripts/                 # env bootstrap and smoke tests
├── docker-compose.yml       # Optional local PostgreSQL via Docker
├── .env.example             # Environment template (copy → .env)
└── README.md                # This file
```

| Path | Purpose |
| --- | --- |
| `apps/web` | Browser UI and same-origin `/api/*` proxy to the backend |
| `apps/api` | REST API, health checks, Prisma schema and migrations |
| `packages/contracts` | Shared types so frontend and backend stay aligned |
| `docs/` | Planning documents for features and business rules |
| `scripts/` | `env:init` (creates `.env`) and `test:smoke` (live checks) |

---

## 4. System architecture (current)

```text
Browser  →  http://localhost:3000
              │
              ├─ Next.js UI
              └─ /api/*  (rewrite proxy, same origin → refresh cookie stays first-party)
                      │
                      ▼
                 NestJS API  →  http://127.0.0.1:3001/v1/...
                   guards: rate limit → JWT + live account check → roles
                      │
                      ▼
                 Prisma 7 + PostgreSQL database `pmrms`
                   11 tables · CHECK constraints · integrity triggers · audit log
```

| URL | Description |
| --- | --- |
| http://localhost:3000 | Frontend workspace |
| http://127.0.0.1:3001/v1/health | API readiness (DB + seed) |
| http://127.0.0.1:3001/v1/health/live | API process liveness only |
| http://127.0.0.1:3001/docs | Interactive Swagger documentation |
| http://127.0.0.1:3001/docs-json | OpenAPI JSON |

Database credentials never leave the server.

### 4.1 Database

| Area | Tables |
| --- | --- |
| Identity | `users`, `patients`, `doctors`, `refresh_sessions` |
| Care relationships | `doctor_patients` (one ACTIVE assignment per pair, full revocation history) |
| Clinical | `records`, `medical_files`, `record_revisions` |
| Operations | `access_logs` (append-only), `notifications`, `outbox_events` |

Rules the application must never be trusted to enforce alone are also enforced by PostgreSQL: a profile must match its user's role, record ownership cannot change after insert, audit rows cannot be edited or deleted, emails are stored lowercase, diagnoses cannot be blank, and assignment status always agrees with its revocation fields. Details are in [`docs/04`](docs/04-database-design-erd-and-prisma-schema.md).

### 4.2 Authentication

All routes are under `/v1` (or `/api` through the Next.js proxy). Every route requires a valid access token unless it is explicitly public.

| Method | Route | Access | Result |
| --- | --- | --- | --- |
| POST | `/auth/register/patient` | Public | Creates an unverified patient and emails a Resend OTP (no session yet) |
| POST | `/auth/verify-email` | Public | Confirms the OTP and starts a session |
| POST | `/auth/resend-otp` | Public | Resends the patient registration OTP (rate limited) |
| POST | `/auth/register/doctor-request` | Public | Creates a PENDING doctor applicant (no clinical access) |
| POST | `/auth/login` | Public | Access JWT in JSON, refresh token in an HttpOnly cookie |
| POST | `/auth/refresh` | Refresh cookie + `X-PMRMS-CSRF: 1` | Rotates the refresh token and returns a new access JWT |
| POST | `/auth/logout` | Refresh cookie + `X-PMRMS-CSRF: 1` | Revokes the session, `204` |
| POST | `/auth/logout-all` | Bearer token | Revokes every session of the user, `204` |
| GET | `/auth/me` | Bearer token | Current account, read from the database |

Security properties:

- Passwords are hashed with **Argon2id** (19 MiB, 2 iterations). Policy: 12–128 characters with upper case, lower case and a digit.
- Access tokens last **15 minutes**, are signed with a pinned algorithm and checked for issuer and audience. Every request reloads the account, so suspension and logout take effect immediately.
- Refresh tokens are random 256-bit values stored only as an HMAC-SHA256 hash. They are **single-use**: replaying a rotated token revokes its whole session family.
- Unknown emails and wrong passwords get the same response and cost the same time. Five failures lock the account for 15 minutes, and sign-in routes are rate limited per IP.
- Every sign-in, denial, lockout, logout and token-reuse event is written to `access_logs` with the request ID.

### 4.3 Demo accounts

`pnpm db:seed` creates fictional data from [`docs/04` §13](docs/04-database-design-erd-and-prisma-schema.md): 10 patients, 10 records, 3 approved doctors, 1 pending doctor, 1 administrator and 11 active assignments. All accounts share the password set in `SEED_DEMO_PASSWORD` in `.env`.

| Email | Role / status | Demonstrates |
| --- | --- | --- |
| `admin.demo@example.test` | ADMIN / ACTIVE | Approvals and assignments |
| `doctor.a@example.test` | DOCTOR / APPROVED | Primary clinical demo (patients 1, 2, 6, 10) |
| `doctor.b@example.test` | DOCTOR / APPROVED | Shares patient 1 with Doctor A for the concurrent-edit demo |
| `doctor.c@example.test` | DOCTOR / APPROVED | Not assigned to patient 1 (isolation test) |
| `doctor.pending@example.test` | DOCTOR / PENDING | Signs in to a limited shell only |
| `patient.a@example.test` | PATIENT / ACTIVE | Own records |
| `patient.b@example.test` | PATIENT / ACTIVE | Cross-patient denial |

### 4.4 Web application

| Route | Page |
| --- | --- |
| `/` | Landing page with live connection status |
| `/login` | Sign in, then redirect to the role's workspace |
| `/register` | Patient registration |
| `/doctor/apply` | Doctor application (account stays pending) |
| `/admin`, `/doctor`, `/patient` | Role workspaces with role-specific navigation |
| `/admin/profile`, `/doctor/profile`, `/patient/profile` | Account details, sign out, sign out of all devices |
| `/unauthorized` | Shown when a signed-in user opens another role's area |

The browser keeps the access token in memory only and restores the session from the HttpOnly cookie after a reload. Token refreshes are serialised across tabs with the Web Locks API, so two tabs can never trigger refresh-token reuse detection. Signing out in one tab signs out every tab. Forms validate with the same Zod contracts as the API. Navigation for features that are not built yet is shown as disabled, and pending doctors see clinical items as locked. The UI is convenience only: every request is still authorised by the API.

Seeded rows use readable fixed IDs, for example patient 1 is `20000000-0000-4000-8000-000000000001` and record 1 is `40000000-0000-4000-8000-000000000001`.

---

## 5. Prerequisites

| Tool | Version |
| --- | --- |
| Node.js | 22.12+ (24 LTS recommended) |
| pnpm | 11.15.1 (`packageManager` field) |
| PostgreSQL | 16+ running locally **or** Docker Desktop |

Create a PostgreSQL database named **`pmrms`** owned by the user in your `.env`.  
WAMP Apache/MySQL are **not** used by this stack — open the Node ports directly.

---

## 6. Quick start

```powershell
# 1. Install dependencies
pnpm install --frozen-lockfile

# 2. Create .env from the template (skipped if .env already exists)
pnpm run env:init

# 3. Edit .env → set DATABASE_URL to your Postgres user/password and database `pmrms`
#    Example shape:
#    DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/pmrms?schema=public

# 4. Generate Prisma Client, apply migrations, seed demo data
pnpm setup:local

# 5. Start frontend + API together
pnpm dev
```

**Optional Docker database** (if you are not using an installed PostgreSQL service):

```powershell
pnpm db:up          # starts postgres from docker-compose.yml
pnpm setup:local
pnpm dev
```

Stop the apps with `Ctrl+C`. PostgreSQL keeps running as a service (or Docker container).

---

## 7. Verification

With both apps running:

```powershell
pnpm test:smoke     # frontend, proxy, database, CORS, OpenAPI and the full auth flow
pnpm test:api       # readiness success / failure unit checks
```

For a quick manual check, `http://127.0.0.1:3001/v1/health` should report the database and seed as ready.

---

## 7.1 Frontend conventions

The web app is built from one shared component library, so new screens reuse existing pieces instead of copying markup:

| Folder | Contents |
| --- | --- |
| `apps/web/components/ui/` | Primitives: Button, ButtonLink, TextField, PasswordField, FieldRow, Alert, Badge, Card, CardGrid, PageHeader, Section, DescriptionList, IconTile, EmptyState, ConfirmAction, Spinner |
| `apps/web/components/layout/` | Page chrome: Brand, AppShell (mobile drawer), AuthLayout/AuthCard, SiteHeader, SiteFooter, NoticePage |
| `apps/web/components/features/` | Domain components (auth forms, account, dashboard) |
| `apps/web/lib/` | `useZodForm`, role and navigation config, API client, auth provider, `cn()` |

Styling uses Tailwind 4 theme tokens defined in `apps/web/app/globals.css`. Every screen is mobile-first and is checked at 375px width. The rules agents follow are in `.cursor/rules/` (`project-conventions`, `frontend-components`, `mobile-responsive`).

---

## 8. Useful commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Start web + API in parallel |
| `pnpm dev:web` / `pnpm dev:api` | Start one app |
| `pnpm typecheck` | TypeScript check across workspaces |
| `pnpm build` | Production build |
| `pnpm db:migrate` | Apply committed migrations |
| `pnpm db:seed` | Idempotent demo data (re-running resets demo account passwords and lockouts) |
| `pnpm db:status` | Migration status |
| `pnpm db:studio` | Prisma Studio GUI |
| `pnpm db:up` / `pnpm db:down` | Start / stop optional Docker Postgres |

Environment notes:

- Root `.env` is loaded by NestJS, Next.js, Prisma CLI and the seed script.
- `API_ORIGIN` must match the API host/port used by the Next.js proxy.
- `WEB_ORIGIN` controls CORS and which origin may call the cookie endpoints.
- `JWT_ACCESS_SECRET` and `REFRESH_TOKEN_PEPPER` must be different random values of 32+ characters; `pnpm env:init` generates them.
- Patient registration emails a 6-digit OTP through Resend. Set `RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL` in `.env`.
- Restart `pnpm dev` after changing `.env`.

---

## 9. Documentation

| Document | Contents |
| --- | --- |
| [`docs/01-project-overview-and-functional-requirements_PR.md`](docs/01-project-overview-and-functional-requirements_PR.md) | Vision, stack, objectives, MVP scope, NFRs |
| [`docs/02-system-actors-use-cases-and-business-rules_PR.md`](docs/02-system-actors-use-cases-and-business-rules_PR.md) | Actors, use cases and business rules |
| [`docs/03-system-architecture-and-data-flow-diagrams.md`](docs/03-system-architecture-and-data-flow-diagrams.md) | Architecture, DFDs, sequences, RLS, R2, realtime |
| [`docs/04-database-design-erd-and-prisma-schema.md`](docs/04-database-design-erd-and-prisma-schema.md) | ERD, schema invariants, Prisma 7 models, SQL/RLS, seeds |
| [`docs/05-authentication-authorization-and-security-design.md`](docs/05-authentication-authorization-and-security-design.md) | AuthN/AuthZ logic, JWT, RLS, R2, realtime, audit, tests |
| [`docs/06-api-specification-and-backend-implementation.md`](docs/06-api-specification-and-backend-implementation.md) | REST contracts, Nest modules, DTOs, curl kit, tests |
| [`docs/07-frontend-ui-ux-and-dashboard-design.md`](docs/07-frontend-ui-ux-and-dashboard-design.md) | Role dashboards, timeline UX, states, a11y, UI tests |
| [`docs/08-testing-deployment-and-academic-presentation.md`](docs/08-testing-deployment-and-academic-presentation.md) | Tests, deployment, demos, presentation, evidence pack |

These documents are the feature baseline for upcoming milestones.

---

## 10. Development roadmap

| Stage | Status | Deliverable |
| --- | --- | --- |
| 0 — Local foundation | **Done** | Monorepo, PostgreSQL, Prisma, health checks, OpenAPI, shared UI component library |
| 1 — Authentication | **Done** | JWT auth, rotating refresh sessions, Argon2id, roles, lockout, audit, patient email OTP (Resend), sign-in/registration UI and role workspaces |
| 2 — Clinical domain | In progress | Schema, constraints and seed **done**; records, assignments and admin APIs next |
| 3 — Authorization & RLS | Planned | NestJS guards + PostgreSQL row-level security |
| 4 — Documents | Planned | Private R2 PDFs and signed download links |
| 5 — Realtime & polish | Planned | Broadcast notifications, tests, demo deployment |

---

## 11. Academic & security notes

- This is an **academic prototype**. Do **not** store real patient data.
- All seeded people, diagnoses and accounts are fictional (`example.test` addresses).
- `.env` contains secrets and is gitignored; share `.env.example` only.
- The seed refuses to run when `NODE_ENV=production`.
- Prefer least-privilege database roles (LOGIN, no SUPERUSER / CREATEDB for the app user).

### Troubleshooting

| Symptom | Check |
| --- | --- |
| Database unavailable | PostgreSQL service running? `DATABASE_URL` correct? `pnpm db:status` |
| Setup incomplete | Run `pnpm db:seed` |
| Port already in use | Free ports 3000 / 3001 or update ports and origins together |
| Smoke test fails | Ensure `pnpm dev` is running and `pnpm db:seed` has been run before `pnpm test:smoke` |
| Login returns `429` | Rate limit or lockout; wait (see `Retry-After`) or re-run `pnpm db:seed` to reset demo accounts |

---

**Author:** Claude Iranzi (223005124)  
**Project:** Patient Medical Records Management System — Client–Server academic demonstration
