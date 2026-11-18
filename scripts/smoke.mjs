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
