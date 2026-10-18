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
});
