# Patient Medical Records Management System

**Claude Iranzi · Student ID 223005124 · Client–Server systems**

PMRMS is an academic web application for managing fictional patient records. Administrators approve doctors and manage care assignments. Approved doctors create and update records for assigned patients. Patients can see their own history and download their own PDF reports.

## How it works

| Role | Workspace |
| --- | --- |
| Administrator | Review doctor applications, suspend and reactivate accounts, manage assignments, and inspect audit logs. |
| Doctor | View assigned patients, create and revise records, upload PDF reports, archive authored records, and review diagnosis counts. A pending doctor can sign in and check their application status. |
| Patient | Verify their email, view and filter their medical history, download reports, manage their profile, and read notifications. |

The browser uses a Next.js frontend that proxies requests to a NestJS REST API. The API uses shared Zod contracts, Prisma, and PostgreSQL. Passwords are hashed with Argon2id. Access tokens are short-lived and the API rotates the HttpOnly refresh cookie. PostgreSQL row-level security protects clinical rows when the API uses the restricted database login.

Patient registration and password recovery use distinct six-digit email codes. Codes expire after 10 minutes by default and have a limited number of attempts. A successful reset updates the password and revokes existing sessions. The hosted setup uses Supabase PostgreSQL, optional private Supabase Realtime notifications, private Cloudflare R2 storage for new PDFs, and Resend for email delivery. The local setup can keep PDFs in PostgreSQL.

## Run locally

Use Node.js 22.12 or later, pnpm 11, and PostgreSQL 16 or later. You can use Docker to start PostgreSQL.

```powershell
pnpm install --frozen-lockfile
pnpm env:init
```

For Docker, run `pnpm db:up` and wait for PostgreSQL to accept connections. For an existing PostgreSQL installation, create a fictional demo database named `pmrms` and set `DATABASE_URL` in the root `.env` to its connection string. Use an owner login for this initial setup.

```powershell
pnpm setup:local
pnpm dev
```

| URL | Purpose |
| --- | --- |
| `http://localhost:3000` | Application |
| `http://127.0.0.1:3001/v1/health` | API, database, and seed readiness |
| `http://127.0.0.1:3001/docs` | Interactive REST API reference |

The local `OTP_DELIVERY=local` setting prints codes in the API terminal for fictional accounts. Use separate browser profiles to test multiple sessions. For hosted tests, use an inbox you control and obtain hosted demo credentials from the project owner. Keep real patient data and secrets out of the demo.

### Demo accounts

All local seeded accounts initially use the `SEED_DEMO_PASSWORD: Demo@Pmrms2026!` value in the root `.env`.

| Account | Use in testing |
| --- | --- |
| `admin.demo@example.test` | Account approvals, assignments, and audits |
| `doctor.a@example.test` | Approved doctor assigned to Patient A and Patient B |
| `doctor.b@example.test` | Approved doctor who shares Patient A with Doctor A |
| `doctor.c@example.test` | Approved doctor without an assignment to Patient A |
| `doctor.pending@example.test` | Pending doctor approval |
| `patient.a@example.test` | Patient with the seeded **Common cold** PDF |
| `patient.b@example.test` | Second patient for checking access isolation |

## Manual tests

Use a fresh fictional demo database or disposable accounts for tests that change approval, assignment, or password state. Keep a separate browser profile for each role or session.

| # | Test | Steps | Expected result |
| --- | --- | --- | --- |
| 1 | Start and sign in | Open the homepage and API health URL. Sign in with each seeded role. Then try an incorrect password. | Health shows the database connected and setup ready. Each user lands in their own workspace. Incorrect credentials show an error. |
| 2 | Register and verify | Register a fresh fictional patient. Try sign-in before verification, then enter a wrong code. Use **Resend code** after the cooldown and enter the latest code from the inbox or local API terminal. | Sign-in requires verification. The incorrect code is rejected. The latest code opens the patient workspace. The verification form never displays the code. |
| 3 | Recover a password | Sign in as the newly verified patient in two profiles. In a third profile, open **Forgot password?**. Submit an unknown email, then submit the patient's email. Try a wrong code, then the emailed code and a new password. Try the used code and the old password. | Both requests show the same confirmation. Wrong and used codes fail. The new password works, the old password fails, and both existing sessions lose access on their next API request. |
| 4 | Refresh and sign out | Reload a signed-in workspace. Sign in from a second profile, sign out normally from the first, then use **Sign out of all devices** with two active sessions. | Reload preserves the session. Ordinary sign-out ends the current session. Signing out of all devices ends both. |
| 5 | Approve a doctor | Apply through **Doctor application** or use the seeded pending doctor. Try opening **Records**. As admin, approve the applicant in **Doctor approvals**. Refresh or sign in as the doctor. | The applicant starts in a limited workspace. Approval opens the clinical workspace. Patient access follows care assignments. |
| 6 | Assign and revoke access | As admin, assign the approved applicant to Patient A. As the doctor, open Patient A's history. Revoke the assignment as admin and reopen that history as the doctor. | The history becomes accessible after assignment and unavailable after revocation. |
| 7 | Create and filter records | As Doctor A, create a fictional entry for Patient A. As Patient A, open **Medical history** and filter by the entry's diagnosis or date. Check **Analytics** as Doctor A. | The matching entry appears in Patient A's history and contributes to the diagnosis count. |
| 8 | Enforce access boundaries | Attempt to open Patient A's record while signed in as Patient B or Doctor C. Open it as Doctor B and try to edit Doctor A's entry. Try the clinical workspace as admin. | Patient B and Doctor C cannot open the entry. Doctor B can read the shared patient's history and cannot edit another doctor's entry. Admin access is limited to administration. |
| 9 | Edit and archive | As Doctor A, open the same entry in two sessions. Save an edit in one session, then save stale changes in the other. Reload and archive the entry. | The stale save reports a conflict. The latest version is preserved. The archived entry appears in the archived filter. |
| 10 | Upload and download a PDF | As Doctor A, attach a fictional PDF up to 10 MiB to an authored record. Preview it in the record page. Try a text file renamed to `.pdf`. Download the valid PDF as Patient A, then try the same record as Patient B. | Preview opens inside the app from a private blob. The valid PDF also downloads through the authenticated API. The invalid upload and unauthorized download fail. If R2 is enabled, the new upload also appears in the private bucket. |
| 11 | Check notifications | While signed in as Patient A, watch the Notifications item in the sidebar. As Doctor A, create another record for that patient. Wait up to 30 seconds (or use Realtime if enabled). Open the inbox, follow the record link, mark it read, then check Patient B. | The sidebar count increases for Patient A only. Marking it read lowers the count. With Realtime enabled, the open inbox updates without waiting for the poll. |
| 12 | Check suspension and audit | As admin, suspend a disposable patient with a live session. Try a protected page and sign-in as that patient. Reactivate the account and check **Audit logs**. | Suspension blocks existing and new sessions. Reactivation allows a fresh sign-in. The audit page records the account change and other relevant actions. |
| 13 | Update the patient profile | As a disposable patient, open **Account**, change the fictional name or phone number, save, and reload. | Saved values persist, and only the current patient's profile is editable. |

## Hosted configuration

1. On the demo Supabase database, use the owner connection as `DATABASE_MIGRATION_URL` and a separate restricted login as `DATABASE_URL`. Use verified TLS. Disable the Supabase Data API because NestJS serves the application API. Run `pnpm db:migrate` with the owner connection before deploying a version that uses a new migration.
2. For a new hosted database, run [scripts/supabase-realtime.sql](scripts/supabase-realtime.sql) in the Supabase SQL Editor after migrations. Run `pnpm db:grant-runtime` with both connections configured. The runtime API needs only the restricted database URL. Seed only a database reserved for the fictional demo.
3. Set `OTP_DELIVERY=resend`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL` on the API. Use a verified sender and test both registration and recovery with an inbox you control.
4. To enable private realtime updates, disable public channel access in Supabase and set `REALTIME_PROVIDER=supabase`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_REALTIME_SIGNING_JWK`. The private ES256 JWK must match the active key. The broadcast signals the client to reload authorized data from the API.
5. To store new PDFs in R2, create a private bucket and a bucket-scoped **Object Read & Write** credential. Set `PDF_STORAGE=r2`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` on the API.
6. Set `API_ORIGIN` on the web app and `WEB_ORIGIN` on the API to the deployed origins. Use HTTPS for the production refresh cookie. Keep passwords, the Resend key, and signing and storage credentials in server-side environment variables.

## Automated checks

| Command | Coverage |
| --- | --- |
| `pnpm typecheck` | TypeScript across the workspace |
| `pnpm build` | Production API and web builds |
| `pnpm test:api` | API unit tests, including readiness, R2, and Realtime signing |
| `pnpm test:smoke` | Running web app, API proxy, and session checks against a seeded local demo |
| `pnpm test:workspace` | Auth and password recovery, clinical workflows, and row-level security in an isolated local PostgreSQL database |

The isolated suite requires a local `DATABASE_MIGRATION_URL` or `DATABASE_URL` whose PostgreSQL login can create a test database and role.
