// Shared background entry: answers the content script's Wallet requests.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'walletPass') return;
  createWalletPass(msg)
    .then(saveUrl => sendResponse({ ok: true, saveUrl }), e => sendResponse({ ok: false, error: e.message || String(e) }));
  return true;
});
