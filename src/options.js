const $ = id => document.getElementById(id);
chrome.storage.local.get(['walletServiceUrl', 'walletToken'], s => {
  $('url').value = s.walletServiceUrl || '';
  $('token').value = s.walletToken || '';
});
$('save').onclick = () => {
  chrome.storage.local.set({ walletServiceUrl: $('url').value.trim(), walletToken: $('token').value.trim() }, () => {
    $('status').textContent = 'Gespeichert.';
  });
};
