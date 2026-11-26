const assert = require('node:assert/strict');
const { createHash, generateKeyPairSync, verify } = require('node:crypto');
const { test } = require('node:test');
const { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

Object.assign(process.env, {
  PDF_STORAGE: 'r2',
  R2_ACCOUNT_ID: 'a'.repeat(32),
  R2_BUCKET: 'test-reports',
  R2_ACCESS_KEY_ID: 'unused-test-key',
  R2_SECRET_ACCESS_KEY: 'unused-test-secret',
});
const { issueRealtimeSession } = require('../dist/workspace/realtime.controller.js');
const { PdfStorageService } = require('../dist/workspace/pdf-storage.service.js');

test('Realtime lease signs only an authenticated recipient topic and expires in two minutes', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const now = 1800000000;
  const recipient = '20000000-0000-4000-8000-000000000001';
  const cfg = { kid: 'fixture-key', key: privateKey };
  const url = 'https://fixture.supabase.co';
  const lease = issueRealtimeSession(recipient, url, 'sb_publishable_fixture', cfg, now);
  const [header, body, signature] = lease.token.split('.');
  const decode = segment => JSON.parse(Buffer.from(segment, 'base64url').toString());
  assert.deepEqual(decode(header), { alg: 'ES256', kid: 'fixture-key', typ: 'JWT' });
  assert.deepEqual(decode(body), {
    sub: recipient, role: 'authenticated', aud: 'authenticated', iss: url + '/auth/v1',
    iat: now, exp: now + 120, pmrms_realtime: true,
  });
  assert.ok(verify('sha256', Buffer.from(header + '.' + body), { key: publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(signature, 'base64url')));
  assert.equal(lease.topic, 'pmrms:user:' + recipient);
  assert.equal(lease.expiresAt, (now + 120) * 1000);
});

test('R2 backend stores a private opaque key and verifies downloaded bytes', async context => {
  const content = Buffer.from('%PDF-1.4\nfictional report\n%%EOF\n');
  const commands = [];
  context.mock.method(S3Client.prototype, 'send', async command => {
    commands.push(command);
    if (command instanceof GetObjectCommand) {
      return { ContentLength: content.length, Body: { transformToByteArray: async () => content } };
    }
    return {};
  });
  const storage = new PdfStorageService();
  try {
    const staged = await storage.stage(content);
    assert.match(staged.objectKey, /^pmrms\/reports\/[a-f0-9-]+\.pdf$/);
    assert.equal(staged.localContent, null);
    assert.equal(staged.checksumSha256, createHash('sha256').update(content).digest('hex'));
    assert.ok(commands[0] instanceof PutObjectCommand);
    assert.equal(commands[0].input.Bucket, 'test-reports');
    assert.equal(commands[0].input.ACL, undefined);
    assert.deepEqual(await storage.read(staged), content);
    await assert.rejects(storage.read({ ...staged, checksumSha256: '0'.repeat(64) }), { code: 'PDF_STORAGE_UNAVAILABLE' });
    await storage.discard(staged.objectKey);
    assert.ok(commands.at(-1) instanceof DeleteObjectCommand);
  } finally {
    storage.onModuleDestroy();
  }
});
