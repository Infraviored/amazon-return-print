import { generateKeyPairSync, createVerify } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passPayload, sign, validate } from './server.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = { client_email: 'sa@test.iam.gserviceaccount.com', private_key_id: 'kid1', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };

test('signed JWT verifies and carries a QR pass', () => {
  const jwt = sign(passPayload('3388000000012345678', { qr: 'RON|123456789012||DHL RETOURE', returnId: 'R-1', deadline: '2026-10-15' }), key);
  const [h, p, s] = jwt.split('.');
  assert.ok(createVerify('RSA-SHA256').update(h + '.' + p).verify(publicKey, Buffer.from(s, 'base64url')));
  const claims = JSON.parse(Buffer.from(p, 'base64url'));
  assert.equal(claims.iss, key.client_email);
  assert.equal(claims.typ, 'savetowallet');
  assert.deepEqual(claims.origins, []);
  const obj = claims.payload.genericObjects[0];
  assert.equal(obj.barcode.type, 'QR_CODE');
  assert.equal(obj.barcode.value, 'RON|123456789012||DHL RETOURE');
  assert.equal(obj.classId, '3388000000012345678.amazon_return_v1');
  assert.match(obj.id, /^3388000000012345678\.return_[0-9a-f]{24}$/);
  assert.equal(obj.textModulesData.find(m => m.id === 'deadline').body, '15.10.2026');
  assert.equal(obj.validTimeInterval.end.date, '2026-10-15T23:59:59');
});

test('same QR gives the same object id (re-saving updates, no duplicates)', () => {
  const a = passPayload('1', { qr: 'x' }).payload.genericObjects[0].id;
  const b = passPayload('1', { qr: 'x' }).payload.genericObjects[0].id;
  assert.equal(a, b);
});

test('validate rejects unknown fields and bad values', () => {
  const qr = 'RON|123456789012||DHL RETOURE';
  assert.equal(validate({ qr }), null);
  assert.match(validate({ qr, logo: 'x' }), /unknown field/);
  assert.match(validate({ qr: '' }), /qr/);
  assert.match(validate({ qr: 'https://phish.example/login' }), /DHL return/);
  assert.match(validate({ qr, title: '<script>' }), /title/);
  assert.match(validate({ qr, deadline: '15.10.2026' }), /deadline/);
});
