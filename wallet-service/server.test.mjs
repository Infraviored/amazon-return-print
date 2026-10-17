import { generateKeyPairSync, createVerify } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, loadPages, passPayload, sign, validate } from './server.mjs';

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

test('static page routing: GET, HEAD, query strings, content-length and trailing slashes', async () => {
  const pages = loadPages();
  const server = createServer(createHandler({ pages }));
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    // GET / serves HTML with Content-Length and Cache-Control
    const indexRes = await fetch(`${base}/`);
    assert.equal(indexRes.status, 200);
    assert.equal(indexRes.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(indexRes.headers.get('cache-control'), 'public, max-age=3600');
    const indexHtml = await indexRes.text();
    assert.equal(indexRes.headers.get('content-length'), String(Buffer.byteLength(indexHtml)));
    assert.match(indexHtml, /Amazon Return Helper/);

    // HEAD / returns identical headers and empty body
    const headIndex = await fetch(`${base}/`, { method: 'HEAD' });
    assert.equal(headIndex.status, 200);
    assert.equal(headIndex.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(headIndex.headers.get('content-length'), String(Buffer.byteLength(indexHtml)));
    assert.equal(await headIndex.text(), '');

    // /privacy serves through the same GET/HEAD and query string mechanism
    const privGet = await fetch(`${base}/privacy`);
    assert.equal(privGet.status, 200);
    assert.equal(privGet.headers.get('content-type'), 'text/html; charset=utf-8');
    const privText = await privGet.text();
    assert.equal(privGet.headers.get('content-length'), String(Buffer.byteLength(privText)));
    assert.match(privText, /Privacy Policy/);

    const privHead = await fetch(`${base}/privacy`, { method: 'HEAD' });
    assert.equal(privHead.status, 200);
    assert.equal(privHead.headers.get('content-length'), String(Buffer.byteLength(privText)));
    assert.equal(await privHead.text(), '');

    // Query strings stripped properly
    const privQuery = await fetch(`${base}/privacy?utm_source=wallet`);
    assert.equal(privQuery.status, 200);
    const indexQuery = await fetch(`${base}/?ref=test`);
    assert.equal(indexQuery.status, 200);

    // Trailing slashes normalised
    const imprintSlash = await fetch(`${base}/imprint/`);
    assert.equal(imprintSlash.status, 200);
    assert.match(await imprintSlash.text(), /Impressum/);

    const privSlash = await fetch(`${base}/privacy/`);
    assert.equal(privSlash.status, 200);

    // Binary image assets include content-length on GET and HEAD
    const imgGet = await fetch(`${base}/img/icon-128.png`);
    assert.equal(imgGet.status, 200);
    assert.equal(imgGet.headers.get('content-type'), 'image/png');
    const imgBuf = await imgGet.arrayBuffer();
    assert.equal(imgGet.headers.get('content-length'), String(imgBuf.byteLength));

    const imgHead = await fetch(`${base}/img/icon-128.png`, { method: 'HEAD' });
    assert.equal(imgHead.status, 200);
    assert.equal(imgHead.headers.get('content-length'), String(imgBuf.byteLength));
    assert.equal(await imgHead.text(), '');

    // Non-existent route returns 404
    const notFound = await fetch(`${base}/nonexistent`);
    assert.equal(notFound.status, 404);
  } finally {
    server.close();
  }
});
