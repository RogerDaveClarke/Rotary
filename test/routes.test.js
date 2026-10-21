const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');

describe('HTTP routes integration', () => {
    let server;
    let baseUrl;

    before((t, done) => {
        server = app.listen(0, () => {
            const port = server.address().port;
            baseUrl = `http://127.0.0.1:${port}`;
            done();
        });
    });

    after((t, done) => {
        server.close(done);
    });

    test('GET /healthz returns ok status', async () => {
        const res = await fetch(`${baseUrl}/healthz`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.deepEqual(data, { status: 'ok' });
    });

    test('GET /api/health returns ok status', async () => {
        const res = await fetch(`${baseUrl}/api/health`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.deepEqual(data, { status: 'ok' });
    });

    test('GET /login returns 200 with HTML login form', async () => {
        const res = await fetch(`${baseUrl}/login`);
        assert.equal(res.status, 200);
        assert.ok(res.headers.get('content-type').includes('text/html'));
        const text = await res.text();
        assert.ok(text.includes('Rotary Card Creator Access'));
    });

    test('POST /login with invalid access code returns 401', async () => {
        const res = await fetch(`${baseUrl}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'accessCode=wrong-code'
        });
        assert.equal(res.status, 401);
    });

    test('POST /logout clears cookie and redirects to /login', async () => {
        const res = await fetch(`${baseUrl}/logout`, {
            method: 'POST',
            redirect: 'manual'
        });
        assert.equal(res.status, 303);
        assert.equal(res.headers.get('location'), '/login');
    });

    test('GET /assets/logo@2x.png serves logo without authentication', async () => {
        const res = await fetch(`${baseUrl}/assets/logo@2x.png`);
        assert.equal(res.status, 200);
        assert.ok(res.headers.get('content-type').includes('image/png'));
    });

    test('GET /assets/rotary-wheel.png serves wheel without authentication', async () => {
        const res = await fetch(`${baseUrl}/assets/rotary-wheel.png`);
        assert.equal(res.status, 200);
        assert.ok(res.headers.get('content-type').includes('image/png'));
    });

    test('GET / unauthenticated redirects to /login', async () => {
        const res = await fetch(`${baseUrl}/`, { redirect: 'manual' });
        assert.equal(res.status, 303);
        assert.equal(res.headers.get('location'), '/login');
    });

    test('POST /login with valid access code sets session cookie', async () => {
        const config = require('../src/config');
        const res = await fetch(`${baseUrl}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `accessCode=${config.auth.creatorAccessCode}`,
            redirect: 'manual'
        });
        assert.equal(res.status, 303);
        assert.equal(res.headers.get('location'), '/');
        const setCookie = res.headers.get('set-cookie');
        assert.ok(setCookie.includes('rotary_creator_session='));
    });

    test('GET / with valid session cookie loads dashboard', async () => {
        const config = require('../src/config');
        const { sessionSignature } = require('../src/utils/crypto');
        const expiresAt = Date.now() + 60000;
        const sig = sessionSignature(expiresAt, config.auth.sessionSecret);
        const cookie = `${config.sessionCookieName}=${expiresAt}.${sig}`;

        const res = await fetch(`${baseUrl}/`, {
            headers: { Cookie: cookie }
        });
        assert.equal(res.status, 200);
        const text = await res.text();
        assert.ok(text.includes('Rotary Pass Parameter Configurator'));
    });

    test('GET /preview/google-qr with valid session cookie renders QR image', async () => {
        const config = require('../src/config');
        const { sessionSignature } = require('../src/utils/crypto');
        const expiresAt = Date.now() + 60000;
        const sig = sessionSignature(expiresAt, config.auth.sessionSecret);
        const cookie = `${config.sessionCookieName}=${expiresAt}.${sig}`;

        const res = await fetch(`${baseUrl}/preview/google-qr`, {
            headers: { Cookie: cookie }
        });
        assert.equal(res.status, 200);
        assert.ok(res.headers.get('content-type').includes('image/png'));
    });

    test('GET /share unauthenticated on desktop renders public landing page without redirect to /login', async () => {
        const res = await fetch(`${baseUrl}/share`);
        assert.equal(res.status, 200);
        assert.ok(res.headers.get('content-type').includes('text/html'));
        const html = await res.text();
        assert.ok(html.includes('Rotary Club of Kirkland'));
        assert.ok(html.includes('Add to Apple Wallet'));
        assert.ok(html.includes('Save to Google Wallet'));
    });

    test('GET /share/qr renders QR image for public pass claim', async () => {
        const res = await fetch(`${baseUrl}/share/qr`);
        assert.equal(res.status, 200);
        assert.ok(res.headers.get('content-type').includes('image/png'));
    });

    test('GET /share with ?platform=apple handles Apple pass generation', async () => {
        const res = await fetch(`${baseUrl}/share?platform=apple`);
        // In test environment without Apple certificates, it returns status 500 error page
        assert.ok(res.status === 200 || res.status === 500);
        const text = await res.text();
        if (res.status === 500) {
            assert.ok(text.includes('Apple Wallet settings') || text.includes('Rotary Club of Kirkland'));
        }
    });

    test('GET /share with ?platform=google handles Google pass generation', async () => {
        const res = await fetch(`${baseUrl}/share?platform=google`, { redirect: 'manual' });
        // In test environment without Google Wallet configured, returns 503 error page
        assert.ok(res.status === 302 || res.status === 503);
        if (res.status === 503) {
            const text = await res.text();
            assert.ok(text.includes('Google Wallet is not configured'));
        }
    });
});
