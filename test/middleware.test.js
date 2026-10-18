const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const config = require('../src/config');
const { hasCreatorSession, requireCreator } = require('../src/middleware/auth');
const { sessionSignature } = require('../src/utils/crypto');

describe('auth middleware', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        delete process.env.CREATOR_ACCESS_CODE;
        delete process.env.SESSION_SECRET;
        delete process.env.CREATOR_ACCESS_CODE_PATH;
        delete process.env.SESSION_SECRET_PATH;
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    test('in non-production without auth configured, hasCreatorSession returns true', () => {
        process.env.NODE_ENV = 'development';
        const req = { headers: {} };
        assert.equal(hasCreatorSession(req), true);
    });

    test('in production without auth configured, requireCreator returns 503', () => {
        process.env.NODE_ENV = 'production';
        const req = { headers: {} };
        let statusCode = null;
        let responseBody = null;
        const res = {
            status(code) {
                statusCode = code;
                return {
                    send(body) { responseBody = body; }
                };
            }
        };
        let nextCalled = false;
        requireCreator(req, res, () => { nextCalled = true; });

        assert.equal(statusCode, 503);
        assert.equal(responseBody, 'Creator access is not configured.');
        assert.equal(nextCalled, false);
    });

    test('with valid session cookie and auth configured, hasCreatorSession returns true', () => {
        const secret = 'this-is-a-valid-session-secret-of-32-chars';
        process.env.CREATOR_ACCESS_CODE = 'valid-access-code-123';
        process.env.SESSION_SECRET = secret;

        const expiresAt = Date.now() + 60000;
        const signature = sessionSignature(expiresAt, secret);
        const req = {
            headers: {
                cookie: `${config.sessionCookieName}=${expiresAt}.${signature}`
            }
        };

        assert.equal(hasCreatorSession(req), true);

        let nextCalled = false;
        requireCreator(req, {}, () => { nextCalled = true; });
        assert.equal(nextCalled, true);
    });

    test('with expired session cookie, hasCreatorSession returns false and requireCreator redirects', () => {
        const secret = 'this-is-a-valid-session-secret-of-32-chars';
        process.env.CREATOR_ACCESS_CODE = 'valid-access-code-123';
        process.env.SESSION_SECRET = secret;

        const expiresAt = Date.now() - 10000; // expired
        const signature = sessionSignature(expiresAt, secret);
        const req = {
            headers: {
                cookie: `${config.sessionCookieName}=${expiresAt}.${signature}`
            }
        };

        assert.equal(hasCreatorSession(req), false);

        let redirectStatus = null;
        let redirectPath = null;
        const res = {
            redirect(status, path) {
                redirectStatus = status;
                redirectPath = path;
            }
        };
        requireCreator(req, res, () => {});
        assert.equal(redirectStatus, 303);
        assert.equal(redirectPath, '/login');
    });
});
