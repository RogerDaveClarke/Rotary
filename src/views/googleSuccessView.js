function renderGoogleSuccessPage({ escapedSaveUrl, mailtoHref }) {
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Add to Google Wallet</title><style>
body{font-family:'Helvetica Neue',Arial,sans-serif;background:#f4f6f9;margin:0;min-height:100vh;display:grid;place-items:center;color:#202124}
main{width:min(480px,calc(100% - 32px));background:#fff;padding:28px;box-sizing:border-box;border:1px solid #dadce0;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.08)}
h1{font-size:20px;color:#0050a0;margin:0 0 16px}
p{font-size:14px;line-height:1.5}
.linkRow{display:flex;gap:8px;margin:16px 0}
input{flex:1;box-sizing:border-box;padding:11px;border:1px solid #9aa0a6;border-radius:6px;font-size:13px}
.actions{display:flex;gap:10px;flex-wrap:wrap}
a.button,button{display:inline-block;padding:12px 18px;border:0;border-radius:6px;background:#0050a0;color:#fff;font-size:15px;font-weight:700;cursor:pointer;text-decoration:none}
a.button.secondary,button.secondary{background:#202124}
a.back{display:inline-block;margin-top:18px;color:#0050a0;font-size:14px}
</style></head><body><main>
<h1>Google Wallet pass ready</h1>
<p>Tap <strong>Open in Google Wallet</strong> to add the card on this device, or copy/email the link below to share it with someone else.</p>
<div class="linkRow"><input id="saveLink" type="text" readonly value="${escapedSaveUrl}"></div>
<div class="actions">
<a class="button" href="${escapedSaveUrl}">Open in Google Wallet</a>
<a class="button secondary" href="${mailtoHref}">Share via email</a>
<button type="button" class="secondary" onclick="navigator.clipboard.writeText(document.getElementById('saveLink').value)">Copy link</button>
</div>
<a class="back" href="/">&larr; Back to card creator</a>
</main></body></html>`;
}

module.exports = {
    renderGoogleSuccessPage
};
