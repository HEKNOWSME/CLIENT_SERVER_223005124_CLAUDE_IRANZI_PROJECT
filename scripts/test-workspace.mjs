import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { grantRuntime } from './grant-runtime.mjs';

const apiDir = fileURLToPath(new URL('../apps/api/', import.meta.url));
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client, escapeIdentifier, escapeLiteral } = require('pg');
const owner = new URL(process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(owner.hostname), 'Tests require local PostgreSQL.');
const password = process.env.SEED_DEMO_PASSWORD;
assert.ok(password, 'Set SEED_DEMO_PASSWORD in .env.');

const suffix = randomBytes(6).toString('hex');
const databaseName = `pmrms_test_${suffix}`;
const roleName = `pmrms_test_api_${suffix}`;
const rolePassword = randomBytes(24).toString('hex');
const testOwner = new URL(owner.href);
testOwner.pathname = '/' + databaseName;
const testRuntime = new URL(testOwner.href);
testRuntime.username = roleName;
testRuntime.password = rolePassword;
const adminDb = new Client({ connectionString: owner.href });
let roleCreated = false;
let databaseCreated = false;
let api;
const simulatedRoles = [];

function runNode(file, args, env) {
  const result = spawnSync(process.execPath, [file, ...args], { cwd: apiDir, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${file} failed`);
}

async function closeApi() {
  if (!api?.pid || api.exitCode !== null || api.signalCode !== null) return;
  await new Promise(resolve => { api.once('exit', resolve); api.kill(); });
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function withDb(url, work) {
  const database = new Client({ connectionString: url.href });
  try {
    await database.connect();
    await work(database);
  } finally {
    await database.end();
  }
}

async function verifyBroadcastSql() {
  const roles = Object.fromEntries(['anon', 'authenticated', 'service_role'].map(name => [name, `${roleName}_${name}`]));
  for (const role of Object.values(roles)) {
    await adminDb.query(`CREATE ROLE ${escapeIdentifier(role)} NOLOGIN`);
    simulatedRoles.push(role);
  }
  const sql = (await readFile(new URL('./supabase-realtime.sql', import.meta.url), 'utf8'))
    .replace(/\b(anon|authenticated|service_role)\b/g, name => escapeIdentifier(roles[name]));
  await withDb(testOwner, async db => {
    const browserRole = escapeIdentifier(roles.authenticated);
    await db.query(`
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
        $$ SELECT NULLIF(current_setting('request.jwt.claims', true), '')::jsonb $$;
      CREATE SCHEMA realtime;
      CREATE TABLE realtime.messages (topic text, event text, payload jsonb, extension text, private boolean);
      ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
      CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql STABLE AS
        $$ SELECT current_setting('realtime.topic', true) $$;
      CREATE FUNCTION realtime.send(jsonb, text, text, boolean) RETURNS void LANGUAGE sql AS
        $$ INSERT INTO realtime.messages VALUES ($3, $2, $1, 'broadcast', $4) $$;
      GRANT USAGE ON SCHEMA auth, realtime TO ${browserRole};
      GRANT SELECT, INSERT ON realtime.messages TO ${browserRole};
      GRANT SELECT ON public.users TO ${browserRole};
      CREATE POLICY fixture_permissive ON realtime.messages TO ${browserRole} USING (true) WITH CHECK (true);
    `);
    await db.query(sql);
    const user = '10000000-0000-4000-8000-000000000001';
    const topic = 'pmrms:user:' + user;
    await db.query("INSERT INTO notifications (recipient_user_id, kind, title) VALUES ($1, 'GENERIC', 'Synthetic note')", [user]);
    assert.deepEqual((await db.query('SELECT topic, event, payload, private FROM realtime.messages')).rows,
      [{ topic, event: 'workspace.changed', payload: {}, private: true }]);

    await db.query(`SET ROLE ${browserRole}`);
    try {
      await db.query("SELECT set_config('realtime.topic', $1, false)", [topic]);
      await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: user, pmrms_realtime: true })]);
      assert.equal((await db.query('SELECT * FROM realtime.messages')).rowCount, 1);
      await assert.rejects(db.query("INSERT INTO realtime.messages VALUES ($1, 'fake', '{}', 'broadcast', true)", [topic]), { code: '42501' });
      await assert.rejects(db.query('SELECT id FROM public.users'), { code: '42501' });
      await db.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: '10000000-0000-4000-8000-000000000011', pmrms_realtime: true }),
      ]);
      assert.equal((await db.query('SELECT * FROM realtime.messages')).rowCount, 0);
    } finally {
      await db.query('RESET ROLE');
    }
  });
  console.log('PASS hosted SQL emits private empty signals and isolates topics on simulated Supabase schemas');
}

async function verify(origin) {
  async function call(path, { token, method = 'GET', body, status = 200, code, raw = false } = {}) {
    const headers = new Headers();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (body && !(body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(body);
    }
    const response = await fetch(origin + '/v1' + path, { method, headers, body, signal: AbortSignal.timeout(15000) });
    if (raw && response.status === status) return response;
    const result = response.status === 204 ? null : await response.json();
    assert.equal(response.status, status, `${method} ${path}: expected ${status}, got ${response.status} ${result?.code ?? ''}`);
    if (code) assert.equal(result?.code, code);
    return result?.data;
  }
  const login = async email => (await call('/auth/login', { method: 'POST', body: { email, password } })).accessToken;
  const patient = await login('patient.a@example.test');
  const otherPatient = await login('patient.b@example.test');
  const doctor = await login('doctor.a@example.test');
  const colleague = await login('doctor.b@example.test');
  const unassigned = await login('doctor.c@example.test');
  const pending = await login('doctor.pending@example.test');
  const admin = await login('admin.demo@example.test');
  const id = (prefix, n) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const recordPath = recordId => '/records/' + recordId;
  const patientId = id(2, 1);
  await call('/records', { status: 401, code: 'UNAUTHORIZED' });
  await call('/realtime/session', { status: 401, code: 'UNAUTHORIZED' });
  assert.equal(await call('/realtime/session', { token: patient }), null);
  assert.equal((await call(recordPath(id(4, 1)), { token: patient })).patientId, patientId);
  await call(recordPath(id(4, 2)), { token: patient, status: 404, code: 'RECORD_UNAVAILABLE' });
  await call(recordPath(id(4, 1)), { token: unassigned, status: 404, code: 'RECORD_UNAVAILABLE' });
  await call(recordPath('not-a-uuid'), { token: patient, status: 400, code: 'VALIDATION_FAILED' });
  await call(recordPath('99999999-9999-4999-8999-999999999999'), { token: patient, status: 404, code: 'RECORD_UNAVAILABLE' });
  await call('/records', { token: admin, status: 403 });
  await call('/records', { token: pending, status: 403 });
  assert.ok((await call('/admin/audit-logs', { token: admin })).items.some(row => row.action === 'RECORD_READ' && row.outcome === 'DENIED'));
  console.log('PASS login, role separation, scoped reads, concealed absence, and denial audit');

  const payload = { patientId, diagnosis: 'Fictional workspace check', recordDate: '2026-11-26' };
  await call('/records', { token: doctor, method: 'POST', body: { ...payload, diagnosis: '' }, status: 400, code: 'VALIDATION_FAILED' });
  await call('/records', { token: doctor, method: 'POST', body: { ...payload, doctorId: id(3, 2) }, status: 400 });
  await call('/records', { token: patient, method: 'POST', body: payload, status: 403 });
  await call('/records', { token: unassigned, method: 'POST', body: payload, status: 404 });
  const created = await call('/records', { token: doctor, method: 'POST', body: payload, status: 201 });
  assert.equal(created.doctorId, id(3, 1));
  const path = recordPath(created.id);
  assert.equal((await call(path, { token: patient })).diagnosis, payload.diagnosis);
  assert.ok((await call('/records?diagnosis=workspace&from=2026-11-25', { token: patient })).items.some(row => row.id === created.id));
  assert.ok((await call('/analytics/diagnoses', { token: doctor })).some(row => row.diagnosis === payload.diagnosis && row.count === 1));
  await call(path, { token: colleague, method: 'PATCH', body: { expectedVersion: 1, diagnosis: 'Co-edit check' }, status: 404 });
  const writes = ['A', 'B'].map(label => fetch(origin + '/v1' + path, {
    method: 'PATCH', headers: { Authorization: `Bearer ${doctor}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedVersion: 1, diagnosis: `Revision ${label}` }), signal: AbortSignal.timeout(15000),
  }));
  const responses = await Promise.all(writes);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal((await responses.find(response => response.status === 409).json()).code, 'RECORD_VERSION_CONFLICT');
  assert.equal((await call(path, { token: patient })).version, 2);
  console.log('PASS record validation, assignment-scoped creation, filters, analytics, and concurrent edits');

  const seededReport = await call(recordPath(id(4, 1)) + '/download', { token: patient, raw: true });
  const content = Buffer.from(await seededReport.arrayBuffer());
  assert.match(content.toString('ascii'), /PMRMS fictional demo report/);
  const form = new FormData();
  form.set('file', new Blob([content], { type: 'application/pdf' }), 'fictional-demo.pdf');
  const invalid = new FormData();
  invalid.set('file', new Blob(['text'], { type: 'application/pdf' }), 'bad.pdf');
  await call(path + '/files', { token: doctor, method: 'POST', body: invalid, status: 400, code: 'INVALID_PDF' });
  const pdf = await call(path + '/files', { token: doctor, method: 'POST', body: form, status: 201 });
  assert.equal(pdf.sizeBytes, content.length);
  assert.equal((await call(path + '/files', { token: patient })).items[0].id, pdf.id);
  const download = await call(path + '/download', { token: patient, raw: true });
  assert.equal(download.headers.get('content-type'), 'application/pdf');
  assert.equal(download.headers.get('cache-control'), 'no-store');
  assert.match(download.headers.get('content-disposition'), /^attachment;/);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), content);
  await call(path + `/files/${pdf.id}/download`, { token: otherPatient, status: 404 });
  const inbox = (await call('/notifications', { token: patient })).items;
  const notification = inbox.find(item => item.title === 'A medical record is available.');
  assert.ok(notification);
  await call(`/notifications/${notification.id}/read`, { token: otherPatient, method: 'PATCH', status: 404 });
  await call(`/notifications/${notification.id}/read`, { token: patient, method: 'PATCH', status: 204 });
  assert.ok((await call('/notifications', { token: patient })).items.find(item => item.id === notification.id).readAt);
  await call(path + '/archive', { token: doctor, method: 'PATCH', body: { expectedVersion: 2 } });
  assert.ok((await call('/records?status=ARCHIVED', { token: patient })).items.some(row => row.id === created.id));
  console.log('PASS PDF upload and exact-byte download, file isolation, inbox ownership, and archive');

  const applications = await call('/admin/doctors/pending', { token: admin });
  assert.ok(applications.items.some(row => row.id === id(3, 4)));
  await call(`/admin/doctors/${id(3, 4)}/approval`, { token: admin, method: 'PATCH', body: { decision: 'APPROVE' } });
  const assigned = await call('/admin/assignments', {
    token: admin, method: 'POST', body: { doctorId: id(3, 4), patientId }, status: 201,
  });
  await call('/admin/assignments', {
    token: admin, method: 'POST', body: { doctorId: id(3, 4), patientId }, status: 409, code: 'ASSIGNMENT_EXISTS',
  });
  assert.equal((await call(recordPath(id(4, 1)), { token: pending })).patientId, patientId);
  await call(`/admin/assignments/${assigned.id}/revoke`, { token: admin, method: 'PATCH' });
  await call(recordPath(id(4, 1)), { token: pending, status: 404 });
  const patientAccount = (await call('/auth/me', { token: patient })).id;
  await call(`/admin/users/${patientAccount}/status`, { token: admin, method: 'PATCH', body: { status: 'SUSPENDED' } });
  await call('/records', { token: patient, status: 401 });
  await call(`/admin/users/${patientAccount}/status`, { token: admin, method: 'PATCH', body: { status: 'ACTIVE' } });
  await login('patient.a@example.test');
  const email = 'workspace-test@example.test';
  const registration = await call('/auth/register/patient', {
    method: 'POST', status: 201, body: { email, password, fullName: 'Fictional Patient', birthDate: '2000-01-01' },
  });
  assert.match(registration.debugCode, /^\d{6}$/);
  const verified = await call('/auth/verify-email', { method: 'POST', body: { email, code: registration.debugCode } });
  assert.equal(verified.user.emailVerified, true);
  await call('/patients/me', {
    token: verified.accessToken, method: 'PATCH', body: { fullName: 'Fictional Updated', birthDate: '2001-01-01', phone: '+250 123 456 789' },
  });
  assert.equal((await call('/patients/me', { token: verified.accessToken })).fullName, 'Fictional Updated');
  assert.equal((await call('/auth/me', { token: verified.accessToken })).name, 'Fictional Updated');
  await call(`/patients/${patientId}`, { token: verified.accessToken, status: 404 });
  assert.ok((await call(`/patients/${patientId}/records`, { token: doctor })).items.some(row => row.id === id(4, 1)));
  console.log('PASS approvals, assignment and revocation, suspension and reactivation, and local OTP');

  await withDb(testRuntime, async db => {
    assert.equal((await db.query('SELECT count(*)::int AS count FROM records')).rows[0].count, 0);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM medical_files')).rows[0].count, 0);
    await db.query('BEGIN');
    try {
      const actor = (await call('/auth/me', { token: await login('patient.a@example.test') })).id;
      await db.query("SELECT set_config('pmrms.actor_id', $1, true)", [actor]);
      const visible = await db.query('SELECT patient_id FROM records');
      assert.ok(visible.rows.length > 0);
      assert.ok(visible.rows.every(row => row.patient_id === patientId));
    } finally {
      await db.query('ROLLBACK');
    }
    assert.equal((await db.query('SELECT count(*)::int AS count FROM records')).rows[0].count, 0);
  });
  console.log('PASS PostgreSQL RLS on the same restricted role used by NestJS');
}

try {
  await adminDb.connect();
  await adminDb.query(`CREATE DATABASE ${escapeIdentifier(databaseName)}`);
  databaseCreated = true;
  await adminDb.query(`CREATE ROLE ${escapeIdentifier(roleName)} LOGIN PASSWORD ${escapeLiteral(rolePassword)}`);
  roleCreated = true;
  const port = await reservePort();
  const env = { ...process.env, NODE_ENV: 'test', OTP_DELIVERY: 'local', API_HOST: '127.0.0.1',
    REALTIME_PROVIDER: 'disabled', PDF_STORAGE: 'postgres',
    API_PORT: String(port), DATABASE_URL: testRuntime.href, DATABASE_MIGRATION_URL: testOwner.href };
  runNode('node_modules/prisma/build/index.js', ['migrate', 'deploy'], env);
  runNode('node_modules/ts-node/dist/bin.js', ['prisma/seed.ts'], env);
  await withDb(testOwner, db => grantRuntime(db, roleName));
  api = spawn(process.execPath, ['dist/main.js'], { cwd: apiDir, env, stdio: ['ignore', 'ignore', 'inherit'] });
  const origin = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 70 && api.exitCode === null; i++) {
    const response = await fetch(origin + '/v1/health', { signal: AbortSignal.timeout(1000) }).catch(() => null);
    if (response) await response.text();
    if (response?.ok) { ready = true; break; }
    await delay(150);
  }
  assert.ok(ready, 'The isolated API did not become ready.');
  await verify(origin);
  await verifyBroadcastSql();
} finally {
  try {
    await closeApi();
    if (databaseCreated) await adminDb.query(`DROP DATABASE ${escapeIdentifier(databaseName)} WITH (FORCE)`);
    if (roleCreated) await adminDb.query(`DROP ROLE ${escapeIdentifier(roleName)}`);
    for (const role of simulatedRoles) await adminDb.query(`DROP ROLE ${escapeIdentifier(role)}`);
  } finally {
    await adminDb.end();
  }
}
