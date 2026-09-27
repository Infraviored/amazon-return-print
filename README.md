# Amazon Return Label Printer

**Tired of wasting paper when printing Amazon return labels?**
This Firefox and Chrome add-on automatically **cleans up the Amazon.de return label page**, showing only what you actually need for printing – no clutter, no instructions, no multi-page mess.

👉 **Available on the Firefox Add-on Store:**
[https://addons.mozilla.org/en-US/firefox/addon/amazon-return-label-printer/](https://addons.mozilla.org/en-US/firefox/addon/amazon-return-label-printer/)

---

## ✂️ What It Does

* Extracts only the **DHL return label** and the **product description table**
* Removes Amazon’s UI, instructions, and irrelevant text
* Formats everything to fit neatly on **one A4 portrait page**
* Adds a **“Print” button** for instant access
* Works with **multiple return labels** on one page

---

## 🖨️ Why It Matters

Amazon’s return label view is cluttered and poorly optimized for printing. The default print layout often spans **two pages**, wasting paper and causing confusion.

This extension fixes that by showing only the **essential information**:

* ✅ Save paper
* ✅ Print faster
* ✅ Avoid cutting or taping pages together
* ✅ Focus only on what matters: **label + item info**

---

## 🗺️ Optimized For

* **Amazon.de** return label pages
* Firefox Desktop
* Chrome / Edge Desktop (load unpacked, see below)

---

## 🚀 Installation (Temporary for Development)

Build first: `npm install && npm run build`.

**Firefox:** open `about:debugging`, click **"This Firefox"**, **"Load Temporary Add-on"** and select `build/firefox/manifest.json`.

**Chrome / Edge:** open `chrome://extensions`, enable **Developer mode**, click **"Load unpacked"** and select `build/chrome/`.

---

## 🔧 Development

One source tree, two browsers:

* `src/content.js`: Core logic for modifying the page
* `src/styles.css`: Print view styling
* `manifests/base.json`: Shared manifest keys; `manifests/firefox.json` (Manifest V2) and `manifests/chrome.json` (Manifest V3) add the per-browser parts

```bash
npm run build          # build/<browser>/ and dist/amazon-return-print-<browser>-<version>.zip
npm run lint:firefox   # web-ext lint on build/firefox
npm run check:chrome   # loads build/chrome in headless Chromium
```

After changes, run `npm run build` and reload the extension in `about:debugging` or `chrome://extensions`.

---

## 📱 Google Wallet (QR-code returns)

For "label free box free" returns Amazon shows a QR code instead of a label. The extension adds an **"In Google Wallet speichern"** button under it (not printed): it decodes the QR in the background and asks the shared [`wallet-service`](wallet-service/README.md) at `wallet.infraviored.com` to sign a Google Wallet pass with exactly that QR, the return number and the validity date. Nothing to configure.

Privacy: only the QR content, return number, carrier, validity date and the item title are sent to the service; it stores nothing.

---

## 🐞 Known Issues

* Only supports **Amazon.de** (German return portal)
* May require fine-tuning for unusual screen resolutions

---

## 🪪 License

MIT License – Free to use, share, and improve.
