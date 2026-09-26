require('dotenv').config({ quiet: true });

const express = require('express');
const { rateLimit } = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { createHmac, createSign, randomUUID, timingSafeEqual } = require('crypto');
const { GoogleAuth, OAuth2Client } = require('google-auth-library');
const { Firestore, FieldValue } = require('@google-cloud/firestore');
const { PKPass, PassType } = require('passkit-generator');
const QRCode = require('qrcode');
const app = express();
const PORT = process.env.PORT || 3000;
const assetsPath = path.join(__dirname, '..', 'assets');
const firestore = new Firestore();
const oidcClient = new OAuth2Client();
const installsInvokerEmail = String(process.env.INSTALLS_SCHEDULER_SA_EMAIL || '').trim();

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function readSecret(pathVariable, valueVariable) {
    const secretPath = process.env[pathVariable];
    if (secretPath) {
        return fs.readFileSync(secretPath, 'utf8').trim();
    }
    return String(process.env[valueVariable] || '').trim();
}

const creatorAccessCode = readSecret('CREATOR_ACCESS_CODE_PATH', 'CREATOR_ACCESS_CODE');
const sessionSecret = readSecret('SESSION_SECRET_PATH', 'SESSION_SECRET');
const authenticationConfigured = creatorAccessCode.length >= 12 && sessionSecret.length >= 32;
const sessionCookieName = 'rotary_creator_session';

function equalText(left, right) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sessionSignature(expiresAt) {
    return createHmac('sha256', sessionSecret).update(String(expiresAt)).digest('base64url');
}

function hasCreatorSession(req) {
    if (!authenticationConfigured) {
        return process.env.NODE_ENV !== 'production';
    }

    const cookie = String(req.headers.cookie || '')
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${sessionCookieName}=`));
    if (!cookie) {
        return false;
    }

    const [expiresAtText, signature] = decodeURIComponent(cookie.slice(sessionCookieName.length + 1)).split('.');
    const expiresAt = Number(expiresAtText);
    return Number.isSafeInteger(expiresAt)
        && expiresAt > Date.now()
        && Boolean(signature)
        && equalText(signature, sessionSignature(expiresAt));
}

function requireCreator(req, res, next) {
    if (!authenticationConfigured && process.env.NODE_ENV === 'production') {
        return res.status(503).send('Creator access is not configured.');
    }
    if (!hasCreatorSession(req)) {
        return res.redirect(303, '/login');
    }
    return next();
}

const generationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: 'Too many pass-generation requests. Please try again later.'
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: 'Too many login attempts. Please try again later.'
});

const installsCheckLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: 'Too many install-check requests. Please try again later.'
});

app.use(['/generate', '/generate/google'], generationLimiter);

app.get(['/healthz', '/api/health'], (req, res) => {
    res.status(200).json({ status: 'ok' });
});

app.get('/login', (req, res) => {
    res.type('html').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rotary Card Creator Access</title><style>
body{font-family:'Helvetica Neue',Arial,sans-serif;background:#f4f6f9;margin:0;min-height:100vh;display:grid;place-items:center;color:#202124}
main{width:min(360px,calc(100% - 32px));background:#fff;padding:28px;box-sizing:border-box;border:1px solid #dadce0;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.08)}
h1{font-size:22px;color:#0050a0;margin:0 0 20px}label{display:block;font-weight:700;font-size:14px;margin-bottom:6px}
input{box-sizing:border-box;width:100%;padding:11px;border:1px solid #9aa0a6;border-radius:6px;font-size:16px}
button{width:100%;margin-top:16px;padding:12px;border:0;border-radius:6px;background:#0050a0;color:#fff;font-size:16px;font-weight:700;cursor:pointer}
</style></head><body><main><h1>Rotary Card Creator</h1><form method="post" action="/login"><label for="accessCode">Access code</label><input id="accessCode" name="accessCode" type="password" required autocomplete="current-password"><button type="submit">Continue</button></form></main></body></html>`);
});

app.post('/login', loginLimiter, (req, res) => {
    if (!authenticationConfigured || !equalText(String(req.body.accessCode || ''), creatorAccessCode)) {
        return res.status(401).send('Invalid access code.');
    }

    const expiresAt = Date.now() + (8 * 60 * 60 * 1000);
    const secure = req.secure || req.get('x-forwarded-proto') === 'https';
    res.cookie(sessionCookieName, `${expiresAt}.${sessionSignature(expiresAt)}`, {
        httpOnly: true,
        secure,
        sameSite: 'strict',
        maxAge: 8 * 60 * 60 * 1000,
        path: '/'
    });
    return res.redirect(303, '/');
});

app.post('/logout', (req, res) => {
    res.clearCookie(sessionCookieName, { httpOnly: true, sameSite: 'strict', path: '/' });
    return res.redirect(303, '/login');
});

// Called only by Cloud Scheduler via an OIDC-authenticated request; not part of the creator session.
app.post('/internal/check-installs', installsCheckLimiter, async (req, res) => {
    const authHeader = req.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const publicBaseUrl = process.env.PUBLIC_BASE_URL;

    if (!token || !publicBaseUrl || !installsInvokerEmail) {
        return res.status(503).send('Install tracking is not configured.');
    }

    try {
        const ticket = await oidcClient.verifyIdToken({ idToken: token, audience: publicBaseUrl });
        const payload = ticket.getPayload();
        if (!payload || payload.email !== installsInvokerEmail || payload.email_verified !== true) {
            return res.status(403).send('Unauthorized invoker.');
        }
    } catch {
        return res.status(401).send('Invalid token.');
    }

    try {
        const snapshot = await firestore.collection('walletObjects')
            .where('hasUsers', '==', false)
            .orderBy('createdAt', 'asc')
            .limit(200)
            .get();

        if (snapshot.empty) {
            return res.status(200).json({ checked: 0, confirmed: 0 });
        }

        const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'] });
        const client = await auth.getClient();
        let confirmed = 0;

        for (const doc of snapshot.docs) {
            try {
                const response = await client.request({
                    url: `https://walletobjects.googleapis.com/walletobjects/v1/genericObject/${encodeURIComponent(doc.id)}`,
                    method: 'GET'
                });
                if (response.data?.hasUsers === true) {
                    await doc.ref.update({ hasUsers: true, confirmedAt: FieldValue.serverTimestamp() });
                    logWalletEvent('object_saved', 'google', doc.data().source);
                    confirmed += 1;
                }
            } catch (error) {
                console.error(`Unable to check install status for ${doc.id}:`, error.message);
            }
        }

        return res.status(200).json({ checked: snapshot.size, confirmed });
    } catch (error) {
        console.error('Unable to run install check job:', error.message);
        return res.status(500).send('Unable to run the install check job.');
    }
});

app.get('/assets/logo@2x.png', (req, res) => {
    res.sendFile(path.join(assetsPath, 'logo@2x.png'));
});

app.use('/assets', requireCreator, express.static(assetsPath));
app.use(['/preview/google-qr', '/', '/generate', '/generate/google'], requireCreator);

app.get('/preview/google-qr', async (req, res) => {
    const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
    const shareUrl = `${baseUrl.replace(/\/$/, '')}/?shared=google-wallet`;

    try {
        const qrCode = await QRCode.toBuffer(shareUrl, { margin: 1, width: 180, errorCorrectionLevel: 'M' });
        res.type('png').send(qrCode);
    } catch {
        res.status(500).send('Unable to render QR preview.');
    }
});

// Mock standard HTML dashboard with dynamic canvas layout preview matching Kirkland template
app.get('/', (req, res) => {
    const source = req.query.shared === 'google-wallet' ? 'shared' : 'direct';
    if (source === 'shared') {
        logWalletEvent('share_landing', 'google', source);
    }

    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Rotary Digital Card Creator</title>
        <style>
            body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #f4f6f9; padding: 30px; margin: 0; display: flex; gap: 30px; }
            .form-container { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); width: 45%; }
            .preview-container { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); width: 45%; display: flex; flex-direction: column; align-items: center; justify-content: center; }
            h2 { color: #0050A0; margin-top: 0; }
            .form-group { margin-bottom: 15px; display: flex; flex-direction: column; }
            label { font-weight: bold; margin-bottom: 5px; font-size: 14px; color: #333; }
            label em { font-style: italic; font-weight: normal; color: #666; font-size: 12px; }
            input, textarea { padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; }
            button { background: #0050A0; color: white; border: none; padding: 12px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 16px; margin-top: 10px; }
            button:hover { background: #00366d; }
            .wallet-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            .google-wallet { background: #202124; }
            .google-wallet:hover { background: #000; }
            button:focus-visible, input:focus-visible, textarea:focus-visible, a:focus-visible { outline: 3px solid #f7a81b; outline-offset: 2px; }
            
            /* Card Layout Graphics Matching Kirkland */
            .preview-platform { width: 100%; max-width: 350px; }
            .preview-tabs { display: grid; grid-template-columns: 1fr 1fr; width: 100%; margin-bottom: 12px; border: 1px solid #0050A0; border-radius: 6px; overflow: hidden; }
            .preview-tab { margin: 0; border-radius: 0; background: white; color: #0050A0; }
            .preview-tab[aria-selected="true"] { background: #0050A0; color: white; }
            .card-mockup { width: 100%; max-width: 350px; height: 514px; background: white; border: 1px solid #ddd; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.08); padding: 16px 15px; box-sizing: border-box; }
            [hidden] { display: none !important; }
            .card-header { height: 68px; display: flex; justify-content: flex-end; align-items: flex-start; }
            .pass-logo { width: 160px; height: 50px; display: flex; justify-content: flex-end; align-items: center; color: #0050a4; }
            .apple-logo { height: 50px; object-fit: contain; }
            .rotary-wordmark { font-size: 19px; line-height: 1; font-weight: 700; }
            .rotary-wheel { width: 36px; height: 36px; margin-left: 3px; object-fit: cover; }
            .brand-divider { width: 1px; height: 34px; margin: 0 5px; background: #0050a4; }
            .club-wordmark { font-size: 11px; line-height: 1.05; font-weight: 700; }
            .card-body { margin-top: 27px; display: flex; flex-direction: column; gap: 27px; }
            .field-label { color: #0050A0; font-size: 12px; line-height: 1; font-weight: 700; text-transform: uppercase; }
            .field-value { color: #000; margin-top: 8px; white-space: pre-line; overflow-wrap: anywhere; }
            .schedule-value { font-size: 27px; line-height: 1.25; }
            .member-value { font-size: 15px; line-height: 1.2; }
            .back-fields { display: flex; flex-direction: column; gap: 18px; }
            .back-field .field-value { font-size: 13px; line-height: 1.3; }
            .back-field a { color: #0050A0; overflow-wrap: anywhere; }
            .google-device { min-height: 514px; padding: 16px; box-sizing: border-box; border-radius: 20px; background: #f1f3f4; box-shadow: 0 10px 25px rgba(0,0,0,0.08); font-family: 'Google Sans', 'Helvetica Neue', Arial, sans-serif; }
            .google-pass-card { overflow: hidden; border: 1px solid #dadce0; border-radius: 16px; background: white; box-shadow: 0 2px 6px rgba(60,64,67,0.15); }
            .google-pass-main { padding: 18px; }
            .google-header { margin-top: 24px; color: #202124; font-size: 24px; line-height: 1.15; font-weight: 500; overflow-wrap: anywhere; }
            .google-qr { display: block; width: 126px; height: 126px; margin: 22px auto 8px; image-rendering: pixelated; }
            .google-qr-caption { color: #5f6368; font-size: 11px; text-align: center; }
            .google-details { padding: 0 18px 18px; border-top: 1px solid #e0e0e0; }
            .google-module { padding-top: 16px; }
            .google-module-title { color: #5f6368; font-size: 11px; font-weight: 700; text-transform: uppercase; }
            .google-module-value { margin-top: 5px; color: #202124; font-size: 13px; line-height: 1.35; white-space: pre-line; overflow-wrap: anywhere; }
            .google-module-value a { color: #1967d2; }
            .google-link { display: block; padding: 9px 0; color: #1967d2; text-decoration: none; }
            .google-link + .google-link { border-top: 1px solid #e0e0e0; }
            @media (max-width: 800px) {
                body { padding: 16px; flex-direction: column; }
                .form-container, .preview-container { box-sizing: border-box; width: 100%; }
            }
        </style>
    </head>
    <body>
        <div class="form-container">
            <h2>Rotary Pass Parameter Configurator</h2>
            <form action="/generate" method="POST">
                <input type="hidden" name="source" value="${source}">
                <div class="form-group">
                    <label for="inputClub">Club Name <em>(max 30 characters)</em></label>
                    <input type="text" id="inputClub" name="clubName" value="Kirkland" maxlength="30" oninput="updatePreview()">
                </div>
                <div class="form-group">
                    <label for="inputDinnerTime">Dinner Time <em>(max 30 characters)</em></label>
                    <input type="text" id="inputDinnerTime" name="dinnerTime" value="Dinner at 5:45 pm" maxlength="30" oninput="updatePreview()">
                </div>
                <div class="form-group">
                    <label for="inputTime">Meeting Time &amp; Schedule Header <em>(max 30 characters)</em></label>
                    <input type="text" id="inputTime" name="meetingTime" value="Club Meetings at 6:15 pm" maxlength="30" oninput="updatePreview()">
                </div>
                <div class="form-group">
                    <label for="inputVenue">Venue <em>(max 60 characters)</em></label>
                    <input type="text" id="inputVenue" name="venue" value="Prosecco Restaurant & Pizzeria" maxlength="60" oninput="updatePreview()">
                </div>
                <div class="form-group">
                    <label for="inputAddress">Venue Address <em>(max 300 characters)</em></label>
                    <textarea id="inputAddress" name="venueAddress" rows="3" maxlength="300" oninput="updatePreview()">7 Lakeshore Plaza\nKirkland, WA 98033\nUnited States of America</textarea>
                </div>
                <div class="form-group">
                    <label for="inputNotes">Additional Logistic Notes <em>(max 500 characters)</em></label>
                    <textarea id="inputNotes" name="logisticNotes" rows="3" maxlength="500" oninput="updatePreview()">In-person the 1st and 3rd Monday and socials on the second Monday of the month. No meetings on federal holidays or the fourth and fifth Mondays.</textarea>
                </div>
                <div class="form-group">
                    <label for="inputMember">Referring Rotarian Member Name <em>(max 40 characters)</em></label>
                    <input type="text" id="inputMember" name="memberName" value="Jane Doe" maxlength="40" oninput="updatePreview()">
                </div>
                <div class="form-group">
                    <label for="inputPhone">Member Phone Number <em>(max 20 characters)</em></label>
                    <input type="tel" id="inputPhone" name="memberPhone" value="+1-425-555-0199" maxlength="20" oninput="updatePreview()">
                </div>
                <div class="form-group">
                    <label for="inputUrl">Club Website <em>(max 200 characters)</em></label>
                    <input type="url" id="inputUrl" name="websiteUrl" value="https://kirklandrotary.org" maxlength="200" oninput="updatePreview()">
                </div>
                <div class="wallet-actions">
                    <button type="submit" formaction="/generate">Add to Apple Wallet</button>
                    <button type="submit" class="google-wallet" formaction="/generate/google">Add to Google Wallet</button>
                </div>
            </form>
        </div>

        <div class="preview-container">
            <h2>Real-Time Live Device Preview</h2>
            <div class="preview-platform">
                <div class="preview-tabs" role="tablist" aria-label="Wallet platform">
                    <button type="button" class="preview-tab" id="applePlatformTab" role="tab" aria-selected="true" aria-controls="applePlatformPreview" onclick="showPlatform('apple')">Apple</button>
                    <button type="button" class="preview-tab" id="googlePlatformTab" role="tab" aria-selected="false" aria-controls="googlePlatformPreview" onclick="showPlatform('google')">Google</button>
                </div>
                <section id="applePlatformPreview" role="tabpanel" aria-labelledby="applePlatformTab">
                    <div class="preview-tabs" role="tablist" aria-label="Apple pass side">
                        <button type="button" class="preview-tab" id="frontTab" role="tab" aria-selected="true" aria-controls="frontPreview" onclick="showPreviewSide('front')">Front</button>
                        <button type="button" class="preview-tab" id="backTab" role="tab" aria-selected="false" aria-controls="backPreview" onclick="showPreviewSide('back')">Back</button>
                    </div>
                    <div class="card-mockup">
                        <section class="card-face" id="frontPreview" role="tabpanel" aria-labelledby="frontTab">
                    <div class="card-header">
                        <img class="apple-logo" src="/assets/logo@2x.png" alt="Rotary Club of Kirkland">
                    </div>
                    <div class="card-body">
                        <div>
                            <div class="field-label">Meeting Schedule</div>
                            <div class="field-value schedule-value"><span id="prevDinnerTime">Dinner at 5:45 pm</span>\n<span id="prevTime">Club Meetings at 6:15 pm</span></div>
                        </div>
                        <div>
                            <div class="field-label">Venue</div>
                            <div class="field-value member-value" id="prevVenue">Prosecco Restaurant &amp; Pizzeria</div>
                        </div>
                        <div>
                            <div class="field-label">Referring Member</div>
                            <div class="field-value member-value"><span id="prevMember">Jane Doe</span> - <span id="prevPhone">+1-425-555-0199</span></div>
                        </div>
                    </div>
                        </section>
                        <section class="card-face" id="backPreview" role="tabpanel" aria-labelledby="backTab" hidden>
                            <div class="back-fields">
                                <div class="back-field"><div class="field-label">Full Address</div><div class="field-value" id="prevBackAddress">Prosecco Restaurant &amp; Pizzeria\n7 Lakeshore Plaza\nKirkland, WA 98033\nUnited States of America</div></div>
                                <div class="back-field"><div class="field-label">Full Notes</div><div class="field-value" id="prevBackNotes">In-person the 1st and 3rd Monday and socials on the second Monday of the month. No meetings on federal holidays or the fourth and fifth Mondays.</div></div>
                                <div class="back-field"><div class="field-label">Club Website</div><div class="field-value"><a id="prevWebsite" href="https://kirklandrotary.org">https://kirklandrotary.org</a></div></div>
                            </div>
                        </section>
                    </div>
                </section>
                <section id="googlePlatformPreview" role="tabpanel" aria-labelledby="googlePlatformTab" hidden>
                    <div class="google-device">
                        <div class="google-pass-card">
                            <div class="google-pass-main">
                                <div class="card-header">
                                    <div class="pass-logo" aria-label="Rotary Club of Kirkland">
                                        <span class="rotary-wordmark">Rotary</span>
                                        <img class="rotary-wheel" src="/assets/rotary-wheel.png" alt="">
                                        <span class="brand-divider" aria-hidden="true"></span>
                                        <span class="club-wordmark">Club of<br>Kirkland</span>
                                    </div>
                                </div>
                                <div class="google-header" id="prevGoogleHeader">Jane Doe</div>
                                <img class="google-qr" src="/preview/google-qr" alt="QR code to share with a potential member">
                                <div class="google-qr-caption">Scan to share with a potential member</div>
                            </div>
                            <div class="google-details">
                                <div class="google-module"><div class="google-module-title">Meeting Schedule</div><div class="google-module-value"><span id="prevGoogleScheduleDinner">Dinner at 5:45 pm</span>\n<span id="prevGoogleScheduleTime">Club Meetings at 6:15 pm</span>\n\n<span id="prevGoogleAddress">Prosecco Restaurant &amp; Pizzeria\n7 Lakeshore Plaza\nKirkland, WA 98033\nUnited States of America</span></div></div>
                                <div class="google-module"><div class="google-module-title">Notes</div><div class="google-module-value" id="prevGoogleNotes"></div></div>
                                <div class="google-module"><div class="google-module-title">Referring Member</div><div class="google-module-value"><span id="prevGoogleMember">Jane Doe</span> - <span id="prevGooglePhone">+1-425-555-0199</span></div></div>
                                <div class="google-module"><div class="google-module-title">Share This Card</div><div class="google-module-value">Have another Android user scan the QR code with their phone camera to create a fresh card.</div></div>
                                <div class="google-module"><div class="google-module-title">Links</div><div class="google-module-value"><a class="google-link" id="prevGoogleWebsite" href="https://kirklandrotary.org">Open Club Website</a></div></div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>

        <script>
            function updatePreview() {
                document.getElementById('prevDinnerTime').innerText = document.getElementById('inputDinnerTime').value;
                document.getElementById('prevTime').innerText = document.getElementById('inputTime').value;
                document.getElementById('prevVenue').innerText = document.getElementById('inputVenue').value;
                document.getElementById('prevBackAddress').innerText = [document.getElementById('inputVenue').value, document.getElementById('inputAddress').value].filter(Boolean).join('\\n');
                document.getElementById('prevBackNotes').innerText = document.getElementById('inputNotes').value;
                document.getElementById('prevMember').innerText = document.getElementById('inputMember').value;
                document.getElementById('prevPhone').innerText = document.getElementById('inputPhone').value;
                const website = document.getElementById('inputUrl').value;
                document.getElementById('prevWebsite').innerText = website;
                document.getElementById('prevWebsite').href = website;
                document.getElementById('prevGoogleHeader').innerText = document.getElementById('inputMember').value;
                document.getElementById('prevGoogleScheduleDinner').innerText = document.getElementById('inputDinnerTime').value;
                document.getElementById('prevGoogleScheduleTime').innerText = document.getElementById('inputTime').value;
                document.getElementById('prevGoogleAddress').innerText = [document.getElementById('inputVenue').value, document.getElementById('inputAddress').value].filter(Boolean).join('\\n');
                document.getElementById('prevGoogleNotes').innerText = document.getElementById('inputNotes').value;
                document.getElementById('prevGoogleMember').innerText = document.getElementById('inputMember').value;
                document.getElementById('prevGooglePhone').innerText = document.getElementById('inputPhone').value;
                document.getElementById('prevGoogleWebsite').href = website;
            }
            function showPlatform(platform) {
                const showApple = platform === 'apple';
                document.getElementById('applePlatformPreview').hidden = !showApple;
                document.getElementById('googlePlatformPreview').hidden = showApple;
                document.getElementById('applePlatformTab').setAttribute('aria-selected', showApple);
                document.getElementById('googlePlatformTab').setAttribute('aria-selected', !showApple);
            }
            function showPreviewSide(side) {
                const showFront = side === 'front';
                document.getElementById('frontPreview').hidden = !showFront;
                document.getElementById('backPreview').hidden = showFront;
                document.getElementById('frontTab').setAttribute('aria-selected', showFront);
                document.getElementById('backTab').setAttribute('aria-selected', !showFront);
            }
            // Fire initial render sequence
            updatePreview();
        </script>
    </body>
    </html>
    `);
});

const text = (value, fallback, maxLength = 500) => String(value || fallback).trim().slice(0, maxLength);

function httpsUrl(value, fallback) {
    try {
        const url = new URL(String(value || fallback));
        return url.protocol === 'https:' ? url.toString() : fallback;
    } catch {
        return fallback;
    }
}

function getCardData(body) {
    return {
        clubName: text(body.clubName, 'Kirkland', 30),
        dinnerTime: text(body.dinnerTime, 'Dinner at 5:45 pm', 30),
        meetingTime: text(body.meetingTime, 'Club Meetings at 6:15 pm', 30),
        venue: text(body.venue, '', 60),
        venueAddress: text(body.venueAddress, 'Kirkland, WA', 300),
        logisticNotes: text(body.logisticNotes, '', 500),
        memberName: text(body.memberName, 'Rotary Member', 40),
        memberPhone: text(body.memberPhone, '', 20),
        websiteUrl: httpsUrl(body.websiteUrl || body.calendarUrl, 'https://kirklandrotary.org')
    };
}

function localized(value) {
    return { defaultValue: { language: 'en-US', value } };
}

function acquisitionSource(value) {
    return value === 'shared' ? 'shared' : 'direct';
}

function logWalletEvent(event, platform, source) {
    console.log(JSON.stringify({ event, platform, source: acquisitionSource(source) }));
}

async function signGoogleWalletJwt(auth, credentials, payload) {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const header = encode({ alg: 'RS256', typ: 'JWT' });
    const claims = encode(payload);
    const unsignedToken = `${header}.${claims}`;

    if (credentials.private_key) {
        const signature = createSign('RSA-SHA256').update(unsignedToken).sign(credentials.private_key, 'base64url');
        return `${unsignedToken}.${signature}`;
    }

    const serviceAccountEmail = credentials.client_email || (await auth.getCredentials()).client_email;
    if (!serviceAccountEmail) {
        throw new Error('Unable to determine the Google Cloud service account email.');
    }

    const client = await auth.getClient();
    const response = await client.request({
        url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccountEmail)}:signBlob`,
        method: 'POST',
        data: { payload: Buffer.from(unsignedToken).toString('base64') }
    });
    const signature = Buffer.from(response.data.signedBlob, 'base64').toString('base64url');
    return `${unsignedToken}.${signature}`;
}

app.post('/generate', (req, res) => {
    const projectRoot = path.join(__dirname, '..');
    const appleSettings = {
        passTypeIdentifier: process.env.APPLE_PASS_TYPE_IDENTIFIER,
        teamIdentifier: process.env.APPLE_TEAM_IDENTIFIER,
        organizationName: process.env.APPLE_ORGANIZATION_NAME,
        signerCertPath: process.env.APPLE_SIGNER_CERT_PATH,
        signerKeyPath: process.env.APPLE_SIGNER_KEY_PATH,
        wwdrCertPath: process.env.APPLE_WWDR_CERT_PATH
    };
    const missingSettings = Object.entries(appleSettings)
        .filter(([, value]) => !value)
        .map(([name]) => name);

    if (missingSettings.length > 0) {
        return res.status(500).send(`Missing Apple Wallet settings: ${missingSettings.join(', ')}`);
    }

    const requiredFiles = {
        signerCert: path.resolve(projectRoot, appleSettings.signerCertPath),
        signerKey: path.resolve(projectRoot, appleSettings.signerKeyPath),
        wwdr: path.resolve(projectRoot, appleSettings.wwdrCertPath),
        icon: path.join(projectRoot, 'assets', 'icon.png'),
        icon2x: path.join(projectRoot, 'assets', 'icon@2x.png'),
        logo: path.join(projectRoot, 'assets', 'logo.png'),
        logo2x: path.join(projectRoot, 'assets', 'logo@2x.png')
    };
    const missingFiles = Object.values(requiredFiles).filter((filePath) => !fs.existsSync(filePath));

    if (missingFiles.length > 0) {
        return res.status(500).send(`Missing pass files: ${missingFiles.map((filePath) => path.basename(filePath)).join(', ')}`);
    }

    const data = getCardData(req.body);

    try {
        const pass = new PKPass(
            {
                'icon.png': fs.readFileSync(requiredFiles.icon),
                'icon@2x.png': fs.readFileSync(requiredFiles.icon2x),
                'logo.png': fs.readFileSync(requiredFiles.logo),
                'logo@2x.png': fs.readFileSync(requiredFiles.logo2x)
            },
            {
                signerCert: fs.readFileSync(requiredFiles.signerCert),
                signerKey: fs.readFileSync(requiredFiles.signerKey),
                wwdr: fs.readFileSync(requiredFiles.wwdr)
            },
            {
                formatVersion: 1,
                passTypeIdentifier: appleSettings.passTypeIdentifier,
                serialNumber: randomUUID(),
                teamIdentifier: appleSettings.teamIdentifier,
                organizationName: appleSettings.organizationName,
                description: `Rotary Club of ${data.clubName} card`,
                sharingProhibited: false,
                backgroundColor: 'rgb(255, 255, 255)',
                foregroundColor: 'rgb(0, 0, 0)',
                labelColor: 'rgb(0, 80, 160)'
            }
        );

        const generic = new PassType('generic');
        generic.primaryFields.push({ key: 'schedule', label: 'Meeting Schedule', value: `${data.dinnerTime}\n${data.meetingTime}` });
        if (data.venue) {
            generic.secondaryFields.push({ key: 'venue', label: 'Venue', value: data.venue });
        }
        generic.auxiliaryFields.push({ key: 'member', label: 'Referring Member', value: `${data.memberName} - ${data.memberPhone}` });
        generic.backFields.push({ key: 'addressFull', label: 'Full Address', value: [data.venue, data.venueAddress].filter(Boolean).join('\n') });
        if (data.logisticNotes) {
            generic.backFields.push({ key: 'notesFull', label: 'Full Notes', value: data.logisticNotes });
        }
        generic.backFields.push({
            key: 'website',
            label: 'Club Website',
            value: data.websiteUrl,
            attributedValue: `<a href="${data.websiteUrl}">${data.websiteUrl}</a>`,
            dataDetectorTypes: ['PKDataDetectorTypeLink']
        });
        pass.types.push(generic);

        const passBuffer = pass.getAsBuffer();
        logWalletEvent('pass_issued', 'apple', req.body.source);
        res.set({
            'Content-Type': pass.mimeType,
            'Content-Disposition': 'attachment; filename="rotary_club-card.pkpass"',
            'Content-Length': passBuffer.length
        });
        return res.send(passBuffer);
    } catch (error) {
        console.error('Unable to generate Apple Wallet pass:', error.message);
        return res.status(500).send('Unable to generate the Apple Wallet pass. Check the signing certificates and server log.');
    }
});

app.post('/generate/google', async (req, res) => {
    const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const publicBaseUrl = process.env.PUBLIC_BASE_URL;

    if (!issuerId || !/^\d+$/.test(issuerId) || !publicBaseUrl) {
        return res.status(503).send('Google Wallet is not configured. Set GOOGLE_WALLET_ISSUER_ID to the numeric issuer ID from Google Wallet Business Console and set PUBLIC_BASE_URL to a public HTTPS address.');
    }

    if (!publicBaseUrl.startsWith('https://') || (credentialsPath && !fs.existsSync(credentialsPath))) {
        return res.status(503).send('Google Wallet requires a public HTTPS PUBLIC_BASE_URL and, when configured, a valid service-account JSON file.');
    }

    try {
        const data = getCardData(req.body);
        const credentials = credentialsPath ? JSON.parse(fs.readFileSync(credentialsPath, 'utf8')) : {};
        const classId = `${issuerId}.rotary_club_card`;
        const objectId = `${issuerId}.${randomUUID().replaceAll('-', '_')}`;
        const normalizedBaseUrl = publicBaseUrl.replace(/\/$/, '');
        const auth = new GoogleAuth({
            ...(credentialsPath ? { keyFile: credentialsPath } : {}),
            scopes: [
                'https://www.googleapis.com/auth/wallet_object.issuer',
                'https://www.googleapis.com/auth/cloud-platform'
            ]
        });
        const client = await auth.getClient();
        const serviceAccountEmail = credentials.client_email || (await auth.getCredentials()).client_email;
        const token = await signGoogleWalletJwt(auth, credentials, {
            iss: serviceAccountEmail,
            aud: 'google',
            typ: 'savetowallet',
            iat: Math.floor(Date.now() / 1000),
            origins: [new URL(publicBaseUrl).origin],
            payload: {
                genericObjects: [{ id: objectId, classId }]
            }
        });
        const saveUrl = `https://pay.google.com/gp/v/save/${token}`;

        if (saveUrl.length > 1800) {
            return res.status(400).send('The Google Wallet link is too long. Shorten the venue or notes and try again.');
        }

        const genericObject = {
            id: objectId,
            classId,
            state: 'ACTIVE',
            genericType: 'GENERIC_OTHER',
            cardTitle: localized(`Rotary Club of ${data.clubName}`),
            header: localized(data.memberName),
            hexBackgroundColor: '#ffffff',
            logo: {
                sourceUri: { uri: `${normalizedBaseUrl}/assets/logo@2x.png` },
                contentDescription: localized('Rotary Club of Kirkland')
            },
            barcode: { type: 'QR_CODE', value: saveUrl, alternateText: 'Scan to share with a potential member' },
            textModulesData: [
                { id: 'venue', header: 'Meeting Schedule', body: `${data.dinnerTime}\n${data.meetingTime}\n\n${[data.venue, data.venueAddress].filter(Boolean).join('\n')}` },
                { id: 'notes', header: 'Notes', body: data.logisticNotes },
                { id: 'member', header: 'Referring Member', body: `${data.memberName} - ${data.memberPhone}` },
                { id: 'share', header: 'Share This Card', body: 'Have another Android user scan the QR code with their phone camera to create a fresh card.' }
            ],
            linksModuleData: {
                uris: [
                    { id: 'website', uri: data.websiteUrl, description: 'Open Club Website' }
                ]
            }
        };
        const apiBase = 'https://walletobjects.googleapis.com/walletobjects/v1';

        try {
            await client.request({
                url: `${apiBase}/genericClass`,
                method: 'POST',
                data: { id: classId }
            });
        } catch (error) {
            if (error.response?.status !== 409) {
                throw error;
            }
        }

        await client.request({
            url: `${apiBase}/genericObject`,
            method: 'POST',
            data: genericObject
        });

        try {
            await firestore.collection('walletObjects').doc(objectId).set({
                classId,
                source: acquisitionSource(req.body.source),
                hasUsers: false,
                confirmedAt: null,
                createdAt: FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error('Unable to record wallet object for install tracking:', error.message);
        }

        logWalletEvent('save_link_issued', 'google', req.body.source);
        return res.redirect(303, saveUrl);
    } catch (error) {
        console.error('Unable to generate Google Wallet pass:', error.message);
        return res.status(500).send('Unable to generate the Google Wallet pass. Check the Google Wallet configuration and server log.');
    }
});

app.listen(PORT, () => console.log(`Rotary template engine initializing on port ${PORT}`));
