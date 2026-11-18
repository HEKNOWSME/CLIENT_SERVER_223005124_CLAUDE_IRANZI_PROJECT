import assert from 'node:assert/strict';
const api = process.env.API_ORIGIN ?? 'http://127.0.0.1:3001';
const web = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
async function request(url, options) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
}
for (const url of [`${api}/v1/health`, `${web}/api/health`]) {
  const response = await request(url);
  assert.equal(response.status, 200, `${url} must be ready`);
  const body = await response.json();
  assert.equal(body.service, 'pmrms-api');
  assert.equal(body.database, 'connected');
  assert.equal(body.setup, 'ready');
  console.log(`PASS ${url}: database query succeeded`);
}
const page = await request(web);
assert.equal(page.status, 200);
assert.match(await page.text(), /Patient Medical Records Management System/i);
console.log('PASS frontend page');
const spec = await request(`${api}/docs-json`);
assert.equal(spec.status, 200);
assert.ok((await spec.json()).paths['/v1/health']);
console.log('PASS OpenAPI');
const cors = await request(`${api}/v1/health`, { headers: { Origin: web } });
assert.equal(cors.headers.get('access-control-allow-origin'), web);
console.log('PASS configured CORS origin');
const missing = await request(`${api}/v1/not-a-route`);
assert.equal(missing.status, 404);
console.log('PASS unknown routes return 404');

// ---- Authentication (requires `pnpm db:seed`) ----
try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch { /* CI may inject env directly */ }
const password = process.env.SEED_DEMO_PASSWORD;
assert.ok(password, 'SEED_DEMO_PASSWORD must be set to run the authentication checks');
const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const bearer = token => ({ headers: { Authorization: `Bearer ${token}` } });
const refreshCookie = response => response.headers.getSetCookie().find(c => c.startsWith('pmrms_refresh='))?.split(';')[0];
const cookieCall = (path, cookie, csrf = true) => request(`${api}/v1/auth/${path}`, {
  method: 'POST', headers: { Cookie: cookie, ...(csrf ? { 'X-PMRMS-CSRF': '1' } : {}) },
});

const anonymous = await request(`${api}/v1/auth/me`);
const anonymousBody = await anonymous.json();
assert.equal(anonymous.status, 401);
assert.equal(anonymousBody.code, 'UNAUTHORIZED');
assert.ok(anonymousBody.requestId && anonymousBody.timestamp, 'errors carry requestId and timestamp');
console.log('PASS protected route without a token returns the 401 error envelope');

const invalid = await request(`${api}/v1/auth/login`, json({ email: 'not-an-email', password: '' }));
assert.equal(invalid.status, 400);
assert.equal((await invalid.json()).code, 'VALIDATION_FAILED');
const unknown = await request(`${api}/v1/auth/login`, json({ email: 'nobody@example.test', password: 'Wrong-password-123' }));
assert.equal(unknown.status, 401);
assert.equal((await unknown.json()).code, 'INVALID_CREDENTIALS');
console.log('PASS invalid input returns 400; unknown account returns generic 401');

const login = await request(`${web}/api/auth/login`, json({ email: 'patient.a@example.test', password }));
assert.equal(login.status, 200, 'patient login through the Next.js proxy');
const session = (await login.json()).data;
const firstCookie = refreshCookie(login);
assert.ok(session.accessToken && firstCookie, 'login returns an access token and a refresh cookie');
assert.equal(session.refreshToken, undefined, 'refresh token is never exposed in JSON');
assert.match(login.headers.getSetCookie().join(';'), /HttpOnly/i);
assert.match(login.headers.getSetCookie().join(';'), /SameSite=Strict/i);
const me = await request(`${api}/v1/auth/me`, bearer(session.accessToken));
const meBody = (await me.json()).data;
assert.equal(me.status, 200);
assert.equal(meBody.role, 'PATIENT');
assert.equal(meBody.patientId, '20000000-0000-4000-8000-000000000001');
console.log('PASS patient login via proxy issues JWT + HttpOnly refresh cookie; /auth/me reads the account');

const [header, payload] = session.accessToken.split('.');
const unsigned = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${payload}.`;
assert.equal((await request(`${api}/v1/auth/me`, bearer(unsigned))).status, 401);
assert.equal((await request(`${api}/v1/auth/me`, bearer(`${header}.${payload}.tampered`))).status, 401);
console.log('PASS unsigned (alg none) and tampered tokens are rejected');

const noCsrf = await cookieCall('refresh', firstCookie, false);
assert.equal(noCsrf.status, 403);
assert.equal((await noCsrf.json()).code, 'CSRF_REJECTED');
const rotated = await cookieCall('refresh', firstCookie);
assert.equal(rotated.status, 200);
const rotatedSession = (await rotated.json()).data;
const secondCookie = refreshCookie(rotated);
assert.ok(secondCookie && secondCookie !== firstCookie, 'refresh rotates the cookie');
console.log('PASS refresh requires the CSRF header and rotates the refresh token');

const replay = await cookieCall('refresh', firstCookie);
assert.equal(replay.status, 401, 'a consumed refresh token cannot be replayed');
assert.equal((await cookieCall('refresh', secondCookie)).status, 401, 'reuse revokes the whole family');
assert.equal((await request(`${api}/v1/auth/me`, bearer(rotatedSession.accessToken))).status, 401, 'access tokens of a revoked family stop working');
console.log('PASS refresh-token reuse revokes the session family, including live access tokens');

const second = await request(`${api}/v1/auth/login`, json({ email: 'patient.a@example.test', password }));
const secondSession = (await second.json()).data;
const logout = await cookieCall('logout', refreshCookie(second));
assert.equal(logout.status, 204);
assert.equal((await request(`${api}/v1/auth/me`, bearer(secondSession.accessToken))).status, 401);
console.log('PASS logout returns 204 and immediately invalidates the session');

const pending = await request(`${api}/v1/auth/login`, json({ email: 'doctor.pending@example.test', password }));
assert.equal(pending.status, 200);
const pendingSession = (await pending.json()).data;
assert.equal(pendingSession.user.status, 'PENDING');
assert.equal(pendingSession.user.doctorVerification, 'PENDING');
await cookieCall('logout', refreshCookie(pending));
console.log('PASS pending doctor can sign in to a limited shell (no clinical access)');
