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
//   WALLET_KEY_FILE    service account JSON key (needs access to the issuer);
//                      until both exist, /pass answers 503 and /health says configured:false
//   API_TOKEN          requests need "Authorization: Bearer <token>"
//   ALLOW_PUBLIC=1     run without API_TOKEN (anyone can mint passes; rate limit only)
//   PORT               default 8787
//   RATE_LIMIT         passes per IP per hour, default 20
import { createHash, createSign, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
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
    origins: [],
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
  // only DHL return QR codes ("RON|<shipment no>|..."), so the public endpoint
  // cannot be used to sign passes carrying arbitrary links or text
  if (!/^RON\|\d{8,20}\|/.test(body.qr)) return 'qr: not a DHL return code';
  for (const k of ['returnId', 'carrier', 'title']) {
    if (body[k] !== undefined && (typeof body[k] !== 'string' || body[k].length > 80 || /[<>]/.test(body[k]))) return `${k}: up to 80 plain chars`;
  }
  if (body.deadline !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(body.deadline)) return 'deadline: YYYY-MM-DD';
  return null;
}

function main() {
  const issuerId = process.env.WALLET_ISSUER_ID || '';
  const keyFile = process.env.WALLET_KEY_FILE || '';
  // Loaded lazily, so the service can run (and answer 503) before the Google
  // setup is done; dropping the key file in place activates it without a restart.
  let key = null;
  const loadKey = () => {
    if (!key && issuerId && keyFile && existsSync(keyFile)) {
      try { key = JSON.parse(readFileSync(keyFile, 'utf8')); } catch (e) { console.error('key file unreadable:', e.message); }
    }
    return key;
  };
  const token = process.env.API_TOKEN || '';
  if (!token && process.env.ALLOW_PUBLIC !== '1') {
    console.error('set API_TOKEN (or ALLOW_PUBLIC=1 to accept anyone)');
    process.exit(2);
  }
  const tokenOk = header => {
    if (!token) return true;
    const a = Buffer.from(String(header || '')), b = Buffer.from('Bearer ' + token);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  const limit = Number(process.env.RATE_LIMIT || 20);
  const hits = new Map(); // ip -> timestamps within the last hour
  setInterval(() => { // drop IPs with no request in the last hour
    for (const [ip, ts] of hits) if (!ts.some(t => Date.now() - t < 3600_000)) hits.delete(ip);
  }, 600_000).unref();

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
    if (req.method === 'GET' && req.url === '/privacy') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(PRIVACY_HTML);
    }
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, configured: Boolean(loadKey()) });
    if (req.method !== 'POST' || req.url !== '/pass') return send(res, 404, { error: 'not found' });
    if (!tokenOk(req.headers.authorization)) return send(res, 401, { error: 'unauthorized' });
    if (!loadKey()) return send(res, 503, { error: 'wallet-service not configured (issuer id / key file missing)' });

    // Behind nginx, X-Real-IP is set by the proxy; X-Forwarded-For's first entry is
    // client-controlled and would let callers dodge the rate limit.
    const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || '';
    const recent = (hits.get(ip) || []).filter(t => Date.now() - t < 3600_000);
    if (recent.length >= limit) return send(res, 429, { error: 'rate limit' });
    recent.push(Date.now()); // every request counts, valid or not
    hits.set(ip, recent);

    let raw = '', tooBig = false;
    req.on('data', c => {
      if (tooBig) return;
      raw += c;
      if (raw.length > 4096) { tooBig = true; send(res, 413, { error: 'body too large' }); req.destroy(); }
    });
    req.on('end', () => {
      if (tooBig) return;
      let body;
      try { body = JSON.parse(raw); } catch { return send(res, 400, { error: 'invalid JSON' }); }
      const err = validate(body);
      if (err) return send(res, 400, { error: err });
      try {
        const jwt = sign(passPayload(issuerId, body), loadKey());
        send(res, 200, { saveUrl: `https://pay.google.com/gp/v/save/${jwt}` });
      } catch (e) {
        console.error('signing failed:', e.message);
        send(res, 500, { error: 'signing failed' });
      }
    });
  }).listen(Number(process.env.PORT || 8787), () => console.log('wallet-service listening on', process.env.PORT || 8787));
}

// Served at /privacy; linked from the Chrome Web Store listing and the Google Wallet issuer profile.
export const PRIVACY_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Privacy Policy – Amazon Return Label Printer</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 16px;color:#222}h2{margin-top:2rem}</style>
</head><body>
<h1>Privacy Policy</h1>
<p>This policy covers the browser extension <b>Amazon Return Label Printer</b> and its pass-signing service at wallet.infraviored.com.</p>
<h2>Minimal print</h2>
<p>Printing runs entirely in your browser. No data leaves your device.</p>
<h2>Google Wallet</h2>
<p>Only when you click the Google Wallet button, the extension sends these fields to wallet.infraviored.com:
the return QR code content, the return number, the carrier, the expiry date and the item title.
The service uses them once to sign a Google Wallet pass and returns a link to Google's "Save to Google Wallet" page.
It does not store, log or share this data, and it sets no cookies. Your IP address is kept in memory for at most one hour for rate limiting, and the web server's standard access log records IP address, time and requested URL (never the pass data).</p>
<p>When you save the pass, Google processes it under the <a href="https://policies.google.com/privacy">Google Privacy Policy</a>.</p>
<h2>No tracking</h2>
<p>The extension has no analytics, no ads and no accounts. It does not sell or transfer data to third parties.</p>
<h2>Contact</h2>
<p>Questions: <a href="https://github.com/Infraviored/amazon-return-print/issues">github.com/Infraviored/amazon-return-print/issues</a></p>
<hr>
<h1 lang="de">Datenschutzerklärung</h1>
<div lang="de">
<p>Gilt für die Browser-Extension <b>Amazon Return Label Printer</b> und ihren Signierdienst unter wallet.infraviored.com.</p>
<p><b>Minimal drucken</b> läuft komplett im Browser. Es verlassen keine Daten dein Gerät.</p>
<p><b>Google Wallet:</b> Nur wenn du auf den Wallet-Button klickst, schickt die Extension QR-Inhalt, Rücksendenummer, Versanddienst, Ablaufdatum und Artikeltitel an wallet.infraviored.com.
Der Dienst signiert damit einmalig einen Google-Wallet-Pass und gibt den Link zur Google-Speicherseite zurück. Er speichert, protokolliert und teilt nichts und setzt keine Cookies. Deine IP-Adresse liegt höchstens eine Stunde im Arbeitsspeicher für die Ratenbegrenzung; das normale Zugriffsprotokoll des Webservers enthält IP-Adresse, Zeit und aufgerufene URL (nie die Pass-Daten).</p>
<p>Beim Speichern verarbeitet Google den Pass nach der <a href="https://policies.google.com/privacy?hl=de">Google-Datenschutzerklärung</a>.</p>
<p>Kein Tracking, keine Werbung, keine Konten, keine Weitergabe an Dritte. Fragen über die GitHub-Issues oben.</p>
</div>
</body></html>
`;

if (import.meta.url === `file://${process.argv[1]}`) main();
