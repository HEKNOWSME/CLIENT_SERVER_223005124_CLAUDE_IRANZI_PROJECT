import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client, escapeIdentifier } = require('pg');

export async function grantRuntime(database, role) {
  const { rows: [target] } = await database.query(`
    SELECT r.rolcanlogin, r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb,
      pg_has_role(r.oid, c.relowner, 'MEMBER') AS table_owner
    FROM pg_roles r
    CROSS JOIN pg_class c
    WHERE r.rolname = $1 AND c.oid = 'public.records'::regclass
  `, [role]);
  if (!target?.rolcanlogin || target.rolsuper || target.rolbypassrls || target.rolcreaterole || target.rolcreatedb || target.table_owner) {
    throw new Error('The API role must be a restricted login without ownership of records.');
  }
  const identifier = escapeIdentifier(role);
  await database.query(`
    GRANT USAGE ON SCHEMA public TO ${identifier};
    GRANT SELECT ON public."SystemCheck" TO ${identifier};
    GRANT SELECT, INSERT, UPDATE ON public.users, public.patients, public.doctors, public.doctor_patients,
      public.refresh_sessions, public.email_otps, public.records, public.notifications TO ${identifier};
    GRANT SELECT, INSERT ON public.medical_files, public.record_revisions, public.access_logs TO ${identifier};
  `);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { DATABASE_URL, DATABASE_MIGRATION_URL } = process.env;
  const owner = DATABASE_MIGRATION_URL && new URL(DATABASE_MIGRATION_URL);
  const runtime = DATABASE_URL && new URL(DATABASE_URL);
  if (!owner || !runtime || owner.host !== runtime.host || owner.pathname !== runtime.pathname || owner.username === runtime.username) {
    throw new Error('Set both URLs to the same database host, port, and database name, with different roles.');
  }
  const db = new Client({ connectionString: owner.href });
  const api = new Client({ connectionString: runtime.href });
  try {
    await db.connect();
    await api.connect();
    // Supavisor login names contain a project suffix. Ask PostgreSQL for the actual role.
    const { rows: [identity] } = await api.query('SELECT current_user AS role');
    await grantRuntime(db, identity.role);
    const { rows: [policy] } = await api.query("SELECT row_security_active('public.records') AS enforced");
    if (!policy.enforced) throw new Error('PostgreSQL row-level security is inactive for the API login.');
    console.log('Granted runtime permissions. Restart the API to use the restricted role.');
  } finally {
    await Promise.all([db.end(), api.end()]);
  }
}
