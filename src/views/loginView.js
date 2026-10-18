function renderLoginPage() {
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rotary Card Creator Access</title><style>
body{font-family:'Helvetica Neue',Arial,sans-serif;background:#f4f6f9;margin:0;min-height:100vh;display:grid;place-items:center;color:#202124}
main{width:min(360px,calc(100% - 32px));background:#fff;padding:28px;box-sizing:border-box;border:1px solid #dadce0;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.08)}
h1{font-size:22px;color:#0050a0;margin:0 0 20px}label{display:block;font-weight:700;font-size:14px;margin-bottom:6px}
input{box-sizing:border-box;width:100%;padding:11px;border:1px solid #9aa0a6;border-radius:6px;font-size:16px}
button{width:100%;margin-top:16px;padding:12px;border:0;border-radius:6px;background:#0050a0;color:#fff;font-size:16px;font-weight:700;cursor:pointer}
</style></head><body><main><h1>Rotary Card Creator</h1><form method="post" action="/login"><label for="accessCode">Access code</label><input id="accessCode" name="accessCode" type="password" required autocomplete="current-password"><button type="submit">Continue</button></form></main></body></html>`;
}

module.exports = {
    renderLoginPage
};
