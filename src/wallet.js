// Google Wallet export, runs in the background (Firefox page / Chrome service worker).
// The QR image lives on Amazon's S3 without CORS, so only the background (with a
// host permission) can read its pixels. jsQR decodes it; the pass itself is
// signed by the wallet-service (see wallet-service/README.md).

// DHL "label free box free" returns: pipe-separated Latin-1 text, e.g.
// RON|<shipment no>||DHL RETOURE|A|<recipient>|...|<ddmmyy>|<code>|<n>
function parseReturnQr(text) {
  const f = text.split('|');
  const info = {};
  if (f[1] && /^\d{8,20}$/.test(f[1])) info.returnId = 'RET' + f[1];
  if (f[3]) info.carrier = f[3].replace(/\s+RETOURE$/i, '').trim().slice(0, 80);
  const d = f.find((x, i) => i > 17 && /^\d{6}$/.test(x)); // ddmmyy, looks like the QR's validity
  if (d) info.deadline = `20${d.slice(4, 6)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
  return info;
}

async function decodeQrFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('QR-Bild nicht ladbar (' + res.status + ')');
  const bitmap = await createImageBitmap(await res.blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  const code = jsQR(img.data, img.width, img.height);
  if (!code) throw new Error('kein QR-Code im Bild gefunden');
  // the payload is Latin-1 bytes (jsQR's .data is empty for it): keep bytes 1:1
  return String.fromCharCode(...code.binaryData);
}

async function createWalletPass({ imageUrl, title }) {
  const { walletServiceUrl, walletToken } = await chrome.storage.local.get(['walletServiceUrl', 'walletToken']);
  if (!walletServiceUrl) throw new Error('Wallet-Dienst nicht eingerichtet (Add-on-Einstellungen)');
  const qr = await decodeQrFromUrl(imageUrl);
  const body = { qr, ...parseReturnQr(qr) };
  if (title) body.title = title.replace(/[<>]/g, '').trim().slice(0, 80);
  const res = await fetch(walletServiceUrl.replace(/\/+$/, '') + '/pass', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(walletToken ? { authorization: 'Bearer ' + walletToken } : {}) },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.saveUrl) throw new Error('Wallet-Dienst: ' + (out.error || res.status));
  return out.saveUrl;
}
