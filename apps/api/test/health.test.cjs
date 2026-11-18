const { test } = require('node:test');
const assert = require('node:assert/strict');
const { HealthController } = require('../dist/health.controller');

test('readiness confirms the persisted setup marker', async () => {
  const controller = new HealthController({ systemCheck: { findUnique: async ({ where }) => {
    assert.equal(where.id, 'local-setup');
    return { id: 'local-setup' };
  } } });
  const response = await controller.readiness();
  assert.equal(response.status, 'ok');
  assert.equal(response.database, 'connected');
  assert.equal(response.setup, 'ready');
});

test('a database without the seed is not ready', async () => {
  const controller = new HealthController({ systemCheck: { findUnique: async () => null } });
  await assert.rejects(controller.readiness(), error => {
    assert.equal(error.getStatus(), 503);
    assert.equal(error.getResponse().setup, 'seed-required');
    assert.equal(error.getResponse().database, 'connected');
    return true;
  });
});

test('database errors return 503 without leaking connection details', async () => {
  const controller = new HealthController({ systemCheck: { findUnique: async () => {
    throw new Error('postgresql://secret:password@database/private');
  } } });
  await assert.rejects(controller.readiness(), error => {
    assert.equal(error.getStatus(), 503);
    assert.equal(error.getResponse().database, 'unavailable');
    assert.doesNotMatch(JSON.stringify(error.getResponse()), /secret|password|private/);
    return true;
  });
  assert.equal(controller.live().status, 'ok');
});
