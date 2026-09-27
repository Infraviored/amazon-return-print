#!/usr/bin/env node
// Signs Google Wallet "save" links for Amazon return QR codes.
//
// The extension sends only the QR content plus a few display fields; title,
// colours and layout are fixed here, so callers cannot mint arbitrary passes
// under this issuer. No outbound calls: the pass class and object travel
// inside the signed JWT and Google creates them when the user saves.
//
// Env:
//   WALLET_ISSUER_ID   numeric issuer ID from the Google Pay & Wallet Console
//   WALLET_KEY_FILE    service account JSON key (needs access to the issuer)
//   API_TOKEN          optional; if set, requests need "Authorization: Bearer <token>"
//   PORT               default 8787
//   RATE_LIMIT         passes per IP per hour, default 20
import { createHash, createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

export function passPayload(issuerId, input, now = new Date()) {
  const suffix = createHash('sha256').update(input.qr).digest('hex').slice(0, 24);
  const classId = `${issuerId}.amazon_return_v1`;
  const object = {
    id: `${issuerId}.return_${suffix}`,
    classId,
    state: 'ACTIVE',
    hexBackgroundColor: '#232f3e',
    cardTitle: { defaultValue: { language: 'de', value: 'Amazon Rücksendung' } },
    header: { defaultValue: { language: 'de', value: input.title || 'Rücksendung' } },
    barcode: { type: 'QR_CODE', value: input.qr, alternateText: input.returnId || '' },
    textModulesData: [
      input.carrier && { id: 'carrier', header: 'Versand', body: input.carrier },
      input.returnId && { id: 'return', header: 'Rücksendenummer', body: input.returnId },
      input.deadline && { id: 'deadline', header: 'Gültig bis', body: input.deadline.split('-').reverse().join('.') },
    ].filter(Boolean),
  };
  if (input.deadline) {
    // keep the pass until the end of that day, in the user's local time (no offset)
    object.validTimeInterval = { end: { date: `${input.deadline}T23:59:59` } };
  }
  return {
    iss: undefined, // filled by sign()
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(now.getTime() / 1000),
    payload: {
      genericClasses: [{ id: classId }],
      genericObjects: [object],
    },
  };
}

const b64url = b => Buffer.from(b).toString('base64url');

export function sign(claims, key) {
  const body = { ...claims, iss: key.client_email };
  const unsigned = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: key.private_key_id })) + '.' + b64url(JSON.stringify(body));
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key);
  return unsigned + '.' + b64url(signature);
}

// Strict input check: only these fields, bounded and plain.
export function validate(body) {
  if (!body || typeof body !== 'object') return 'body must be JSON';
  const allowed = ['qr', 'returnId', 'carrier', 'deadline', 'title'];
  for (const k of Object.keys(body)) if (!allowed.includes(k)) return `unknown field ${k}`;
  if (typeof body.qr !== 'string' || !body.qr || body.qr.length > 500) return 'qr: 1-500 chars required';
  for (const k of ['returnId', 'carrier', 'title']) {
    if (body[k] !== undefined && (typeof body[k] !== 'string' || body[k].length > 80 || /[<>]/.test(body[k]))) return `${k}: up to 80 plain chars`;
  }
  if (body.deadline !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(body.deadline)) return 'deadline: YYYY-MM-DD';
  return null;
}

function main() {
  const issuerId = process.env.WALLET_ISSUER_ID;
  const keyFile = process.env.WALLET_KEY_FILE;
  if (!issuerId || !keyFile) {
    console.error('set WALLET_ISSUER_ID and WALLET_KEY_FILE');
    process.exit(2);
  }
  const key = JSON.parse(readFileSync(keyFile, 'utf8'));
  const token = process.env.API_TOKEN || '';
  const limit = Number(process.env.RATE_LIMIT || 20);
  const hits = new Map(); // ip -> timestamps within the last hour

  const send = (res, code, obj) => {
    res.writeHead(code, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
    });
    res.end(JSON.stringify(obj));
  };

  createServer((req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
    if (req.method !== 'POST' || req.url !== '/pass') return send(res, 404, { error: 'not found' });
    if (token && req.headers.authorization !== `Bearer ${token}`) return send(res, 401, { error: 'unauthorized' });

    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const recent = (hits.get(ip) || []).filter(t => Date.now() - t < 3600_000);
    if (recent.length >= limit) return send(res, 429, { error: 'rate limit' });

    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 4096) req.destroy(); });
    req.on('end', () => {
      let body;
      try { body = JSON.parse(raw); } catch { return send(res, 400, { error: 'invalid JSON' }); }
      const err = validate(body);
      if (err) return send(res, 400, { error: err });
      recent.push(Date.now());
      hits.set(ip, recent);
      const jwt = sign(passPayload(issuerId, body), key);
      send(res, 200, { saveUrl: `https://pay.google.com/gp/v/save/${jwt}` });
    });
  }).listen(Number(process.env.PORT || 8787), () => console.log('wallet-service listening on', process.env.PORT || 8787));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
