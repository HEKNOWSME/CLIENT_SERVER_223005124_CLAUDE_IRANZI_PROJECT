# Hosted integrations

Use a dedicated Supabase project and a private Cloudflare R2 bucket for the fictional academic demo. The existing NestJS login, session, and authorization rules continue to apply. Local development defaults to PostgreSQL PDF storage with Realtime disabled.

## Supabase PostgreSQL

1. In a dedicated Supabase project, disable the Data API in project settings. Use the same connection method for both database URLs. Choose the direct connection when IPv6 is available or the shared session pooler on port 5432 for IPv4. Use TLS with certificate verification. [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits)
2. Create a dedicated login named `pmrms_api` without superuser privileges, role creation, database creation, `BYPASSRLS`, or membership in the table-owning role. Set its password using an administrator client or the Supabase dashboard. For session pooler connections, use `pmrms_api.PROJECT_REF` in the URL while retaining `pmrms_api` as the database role. URL-encode passwords.
3. Put the owner connection in `DATABASE_MIGRATION_URL` and the dedicated login in `DATABASE_URL`. Keep the owner connection in migration and admin environments. Use only `DATABASE_URL` in the deployed API environment. Set `DATABASE_POOL_MAX` to fit the project connection limit.
4. From the migration environment, run `pnpm db:migrate`, apply [supabase-realtime.sql](../scripts/supabase-realtime.sql) in the SQL Editor as the table owner, then run `pnpm db:grant-runtime`. The SQL removes browser API roles’ table grants, adds Realtime policies, and installs the database trigger. The API checks effective RLS and blocked browser-role grants at startup on recognized Supabase hosts.
5. If the project is empty and reserved for this demo, run `pnpm db:seed` from the migration environment. Provide the intended `SEED_DEMO_PASSWORD` via your secret store. In a production-mode seed environment the existing script requires `ALLOW_DEMO_SEED=true`.

## Supabase Realtime

1. Enable Realtime in the same project and turn off **Allow public access to channels**. Keep clinical tables out of the Realtime publication. [Realtime settings](https://supabase.com/docs/guides/realtime/settings)
2. Generate an ES256 private JWK with `supabase gen signing-key --algorithm ES256`. In the project dashboard import it as a signing key and activate it. Keep the matching private JWK and its `kid` in the API secret store. [Supabase signing keys](https://supabase.com/docs/guides/auth/signing-keys)
3. Set `REALTIME_PROVIDER=supabase`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_REALTIME_SIGNING_JWK` in the API environment. Use the project’s publishable key. Store the private JWK as a single JSON object.

NestJS issues a two-minute token to the current signed-in user. The browser subscribes to that user’s private topic and reloads authorized REST data on a signal or reconnect. The trigger emits an empty payload after the notification transaction commits. The notification inbox preserves updates when a socket disconnects or a broadcast fails. [Private Broadcast](https://supabase.com/docs/guides/realtime/broadcast)

## Cloudflare R2 and Resend

1. Create a private R2 bucket with public development and custom-domain access disabled. Create a bucket-scoped **Object Read & Write** S3 API credential. Set `PDF_STORAGE=r2`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` on the API only. [Cloudflare R2 credentials](https://developers.cloudflare.com/r2/api/tokens/)
2. Existing database-backed PDFs stay readable. New PDFs use opaque R2 keys. NestJS authorizes downloads and verifies the stored length and SHA-256 before returning bytes. If an upload logs **Reconcile PDF object against metadata before cleanup**, check the exact key against `medical_files.object_key` as the database owner. Delete only a confirmed unreferenced object after the upload has settled.
3. Set `OTP_DELIVERY=resend`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL` in the API secret store. Use a sender on the verified Resend domain.

## Verification with the providers

Set `API_ORIGIN` in the web build and `WEB_ORIGIN` on the API to the correct origins. Use HTTPS for the hosted demo so secure refresh cookies work. Verify with two distinct seeded patient sessions and an assigned doctor session.

- Create a fictional record. The recipient’s open history and inbox update. The other patient’s workspace stays unchanged.
- Attach a fictional PDF. Download it as the recipient. Confirm that a different patient receives `404` and anonymous bucket access is denied.
- Disconnect a recipient session, create a new record, and reconnect. The history and inbox recover the update from REST.
- Confirm that the API uses the restricted PostgreSQL login and that its role sees zero records outside an actor-scoped transaction.
- Use an email address you control to verify Resend OTP delivery.

`pnpm test:api` checks the Realtime token and R2 adapter with test fixtures. `pnpm test:workspace` checks the clinical workflows, PostgreSQL RLS, and Realtime SQL against simulated Supabase schemas on isolated local PostgreSQL. The provider checks above require configured cloud resources.
