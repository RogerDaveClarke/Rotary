const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { validateAppleSettings, validateAppleFiles, generateApplePass } = require('../src/services/applePassService');
const { generateGooglePass } = require('../src/services/googlePassService');
const { checkInstalls } = require('../src/services/installTrackerService');

describe('services validation and error handling', () => {
    test('validateAppleSettings identifies missing settings', () => {
        const result = validateAppleSettings({
            passTypeIdentifier: '',
            teamIdentifier: 'TEAM123',
            organizationName: ''
        });
        assert.equal(result.valid, false);
        assert.equal(result.error.status, 500);
        assert.ok(result.error.message.includes('Missing Apple Wallet settings: passTypeIdentifier, organizationName'));
    });

    test('validateAppleFiles identifies missing cert files', () => {
        const result = validateAppleFiles({
            cert: 'non-existent-cert-file.pem',
            key: 'non-existent-key-file.pem'
        });
        assert.equal(result.valid, false);
        assert.equal(result.error.status, 500);
        assert.ok(result.error.message.includes('Missing pass files'));
    });

    test('generateApplePass handles missing configuration gracefully', async () => {
        const result = await generateApplePass({ clubName: 'Test' }, 'direct');
        // Will fail cleanly with error status 500 because full certs are not configured
        assert.ok(result.error);
        assert.equal(result.error.status, 500);
    });

    test('generateGooglePass returns 503 when issuer or base url missing', async () => {
        const originalIssuer = process.env.GOOGLE_WALLET_ISSUER_ID;
        delete process.env.GOOGLE_WALLET_ISSUER_ID;

        try {
            const result = await generateGooglePass({ clubName: 'Test' }, 'direct');
            assert.ok(result.error);
            assert.equal(result.error.status, 503);
            assert.ok(result.error.message.includes('Google Wallet is not configured'));
        } finally {
            if (originalIssuer) {
                process.env.GOOGLE_WALLET_ISSUER_ID = originalIssuer;
            }
        }
    });

    test('checkInstalls returns 503 when token or invoker email is missing', async () => {
        const result = await checkInstalls(null, 'https://example.com');
        assert.ok(result.error);
        assert.equal(result.error.status, 503);
        assert.equal(result.error.message, 'Install tracking is not configured.');
    });

    test('checkInstalls returns 401 on invalid bearer token', async () => {
        const originalSa = process.env.INSTALLS_SCHEDULER_SA_EMAIL;
        process.env.INSTALLS_SCHEDULER_SA_EMAIL = 'scheduler@example.com';

        try {
            const result = await checkInstalls('Bearer invalid.fake.token', 'https://example.com');
            assert.ok(result.error);
            assert.equal(result.error.status, 401);
            assert.equal(result.error.message, 'Invalid token.');
        } finally {
            if (originalSa !== undefined) {
                process.env.INSTALLS_SCHEDULER_SA_EMAIL = originalSa;
            } else {
                delete process.env.INSTALLS_SCHEDULER_SA_EMAIL;
            }
        }
    });
});
