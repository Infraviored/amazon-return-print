// Amazon return label pages: the page stays as it is. A small toolbar box in
// the top-right corner offers "Minimal drucken" (prints only labels, item
// table and overview) and, for QR-code returns, "Google Wallet".

const LABEL_SELECTOR = 'img.return-label-image[alt="Rücksendeetikett"], img.return-label-image.cut-line-sign, img.return-label-image[alt*="QR"]';

// Item table that belongs to a label: a sibling of the label's container, up to 3 levels up.
function findItemTable(labelImg) {
    let el = labelImg.parentElement;
    for (let i = 0; i < 3 && el; i++) {
        for (let sib = el.nextElementSibling; sib; sib = sib.nextElementSibling) {
            if (sib.matches('table.a-bordered')) return sib;
            const child = sib.querySelector('table.a-bordered');
            if (child) return child;
        }
        el = el.parentElement;
    }
    return null;
}

// "Rücksendungsübersicht" image for a label: first in the label's section and the
// following sections, then anywhere in the surrounding return block.
function findOverviewImage(labelImg) {
    const pick = imgs => {
        let found = null;
        for (const img of imgs) {
            if (img === labelImg) continue;
            if (img.classList.contains('return-label-image')) return img;
            found = found || img;
        }
        return found;
    };
    let section = labelImg.closest('.a-section:not(.a-spacing-none):not(.a-text-center)') || labelImg.closest('.a-section');
    for (let i = 0; i < 10 && section; i++) {
        const img = pick(section.querySelectorAll('img[alt="Rücksendungsübersicht"]'));
        if (img) return img;
        do { section = section.nextElementSibling; } while (section && !section.matches('.a-section, .a-box'));
    }
    const scope = labelImg.closest('div[id^="return-package-"], div.return-shipment, div.a-box, body');
    return scope ? pick(scope.querySelectorAll('img[alt="Rücksendungsübersicht"]')) : null;
}

function buildPrintView(labels) {
    const view = document.createElement('div');
    view.id = 'arp-print';
    labels.forEach(label => {
        const item = document.createElement('div');
        item.className = 'arp-item';
        const add = node => { const box = document.createElement('div'); box.className = 'arp-part'; box.appendChild(node.cloneNode(true)); item.appendChild(box); };
        add(label);
        const table = findItemTable(label);
        if (table) add(table);
        const overview = findOverviewImage(label);
        if (overview) add(overview);
        view.appendChild(item);
    });
    return view;
}

// Only the print view is printed; it exists just for the print dialog.
function printMinimal() {
    const labels = [...document.querySelectorAll(LABEL_SELECTOR)];
    if (!labels.length) return;
    document.getElementById('arp-print')?.remove();
    document.body.appendChild(buildPrintView(labels));
    document.documentElement.classList.add('arp-printing');
    const cleanup = () => {
        document.documentElement.classList.remove('arp-printing');
        document.getElementById('arp-print')?.remove();
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
}

const WALLET_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M19 7V6a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3v-8a3 3 0 0 0-3-3zM5 5h11a1 1 0 0 1 1 1v1H5a1 1 0 0 1 0-2zm15 11h-3a2 2 0 0 1 0-4h3zm0-6h-3a4 4 0 0 0 0 8h3v0a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8.83A3 3 0 0 0 5 9h14a1 1 0 0 1 1 1z"/><circle fill="currentColor" cx="17" cy="14" r="1"/></svg>';
const PRINT_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M18 7V3H6v4H5a3 3 0 0 0-3 3v6h4v5h12v-5h4v-6a3 3 0 0 0-3-3zM8 5h8v2H8zm8 14H8v-5h8zm4-5h-2v-2H6v2H4v-4a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1z"/></svg>';

function toolbarButton(cls, icon, text) {
    const btn = document.createElement('button');
    btn.className = 'arp-btn ' + cls;
    btn.innerHTML = icon; // constant SVG markup
    const label = document.createElement('span');
    label.textContent = text;
    btn.appendChild(label);
    return { btn, label };
}

function walletButton(labelImg, number) {
    const text = 'Google Wallet' + (number ? ' (' + number + ')' : '');
    const { btn, label } = toolbarButton('arp-wallet', WALLET_ICON, text);
    btn.title = 'QR-Code als Pass in Google Wallet speichern';
    btn.onclick = () => {
        const cell = findItemTable(labelImg)?.querySelector('td');
        const title = cell ? cell.textContent.replace(/\s+/g, ' ').trim() : '';
        btn.disabled = true;
        label.textContent = 'Erstelle Pass…';
        chrome.runtime.sendMessage({ type: 'walletPass', imageUrl: labelImg.src, title }, res => {
            btn.disabled = false;
            if (res && res.ok) {
                label.textContent = text + ' ✓';
            } else {
                label.textContent = 'Fehler';
                btn.title = (res && res.error) || (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'unbekannter Fehler';
            }
        });
    };
    return btn;
}

// Add the toolbar once labels are on the page; remove it if they disappear.
function updateToolbar() {
    const labels = [...document.querySelectorAll(LABEL_SELECTOR)];
    const existing = document.getElementById('arp-toolbar');
    if (!labels.length) { existing?.remove(); return; }
    if (existing) return;

    const bar = document.createElement('div');
    bar.id = 'arp-toolbar';
    const title = document.createElement('div');
    title.className = 'arp-title';
    title.textContent = 'Rücksendung';
    bar.appendChild(title);

    const { btn: print } = toolbarButton('arp-print-btn', PRINT_ICON, 'Minimal drucken');
    print.title = 'Nur Etikett, Artikelliste und Übersicht drucken';
    print.onclick = printMinimal;
    bar.appendChild(print);

    const qrLabels = labels.filter(l => /QR/i.test(l.alt || ''));
    qrLabels.forEach((l, i) => bar.appendChild(walletButton(l, qrLabels.length > 1 ? i + 1 : 0)));
    document.body.appendChild(bar);
}

let pending;
new MutationObserver(() => {
    clearTimeout(pending);
    pending = setTimeout(updateToolbar, 300);
}).observe(document.documentElement, { childList: true, subtree: true });
updateToolbar();
