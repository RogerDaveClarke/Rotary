const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { equalText, sessionSignature } = require('../src/utils/crypto');
const { text, httpsUrl, getCardData, localized, encodeCardData, decodeCardData, detectPlatform, getBaseUrl } = require('../src/utils/cardData');
const { acquisitionSource, logWalletEvent } = require('../src/utils/logger');

describe('crypto utils', () => {
    test('equalText returns true for equal strings', () => {
        assert.equal(equalText('secret-token-123', 'secret-token-123'), true);
    });

    test('equalText returns false for different strings of same length', () => {
        assert.equal(equalText('secret-token-123', 'secret-token-456'), false);
    });

    test('equalText returns false for strings of different length', () => {
        assert.equal(equalText('short', 'much-longer-string'), false);
    });

    test('sessionSignature generates deterministic base64url hash', () => {
        const sig1 = sessionSignature(1700000000000, 'my-super-secret-key-that-is-long');
        const sig2 = sessionSignature(1700000000000, 'my-super-secret-key-that-is-long');
        assert.equal(sig1, sig2);
        assert.match(sig1, /^[A-Za-z0-9_-]+$/);
    });
});

describe('cardData utils', () => {
    test('text helper trims and enforces maxLength', () => {
        assert.equal(text('  hello  ', 'fallback', 10), 'hello');
        assert.equal(text('', 'default', 10), 'default');
        assert.equal(text(null, 'default', 10), 'default');
        assert.equal(text('1234567890extra', 'fallback', 10), '1234567890');
    });

    test('httpsUrl validates https protocol and falls back on non-https or invalid', () => {
        assert.equal(httpsUrl('https://example.com/club', 'https://fallback.org'), 'https://example.com/club');
        assert.equal(httpsUrl('http://insecure.com', 'https://fallback.org'), 'https://fallback.org');
        assert.equal(httpsUrl('not-a-url', 'https://fallback.org'), 'https://fallback.org');
        assert.equal(httpsUrl('', 'https://fallback.org'), 'https://fallback.org/');
    });

    test('getCardData populates defaults when empty body provided', () => {
        const data = getCardData({});
        assert.equal(data.clubName, 'Kirkland');
        assert.equal(data.dinnerTime, 'Dinner at 5:45 pm');
        assert.equal(data.meetingTime, 'Club Meetings at 6:15 pm');
        assert.equal(data.venue, '');
        assert.equal(data.venueAddress, 'Kirkland, WA');
        assert.equal(data.logisticNotes, '');
        assert.equal(data.memberName, 'Rotary Member');
        assert.equal(data.memberPhone, '');
        assert.equal(data.websiteUrl, 'https://kirklandrotary.org/');
    });

    test('getCardData extracts and sanitizes user input', () => {
        const data = getCardData({
            clubName: '  Seattle Downtown  ',
            dinnerTime: 'Dinner at 6:00 pm',
            meetingTime: 'Club Meetings at 7:00 pm',
            venue: 'The Westin Seattle',
            venueAddress: '1900 5th Ave, Seattle, WA 98101',
            logisticNotes: 'Meets every Wednesday',
            memberName: 'John Smith',
            memberPhone: '206-555-1234',
            websiteUrl: 'https://seattlerotary.org'
        });
        assert.equal(data.clubName, 'Seattle Downtown');
        assert.equal(data.venue, 'The Westin Seattle');
        assert.equal(data.memberName, 'John Smith');
        assert.equal(data.websiteUrl, 'https://seattlerotary.org/');
    });

    test('localized wraps value in en-US default structure', () => {
        assert.deepEqual(localized('Kirkland'), {
            defaultValue: { language: 'en-US', value: 'Kirkland' }
        });
    });

    test('encodeCardData and decodeCardData round-trip successfully', () => {
        const original = { clubName: 'Kirkland', memberName: 'Jane Doe' };
        const encoded = encodeCardData(original);
        assert.match(encoded, /^[A-Za-z0-9_-]+$/);
        const decoded = decodeCardData(encoded);
        assert.deepEqual(decoded, original);
    });

    test('decodeCardData returns null for invalid input', () => {
        assert.equal(decodeCardData(null), null);
        assert.equal(decodeCardData(''), null);
        assert.equal(decodeCardData('invalid-not-json!'), null);
    });

    test('detectPlatform correctly detects iOS, Android, and web with override support', () => {
        const iPhoneUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
        const androidUA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36';
        const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36';

        assert.equal(detectPlatform(iPhoneUA), 'apple');
        assert.equal(detectPlatform(androidUA), 'google');
        assert.equal(detectPlatform(desktopUA), 'web');

        // Overrides take precedence
        assert.equal(detectPlatform(iPhoneUA, 'google'), 'google');
        assert.equal(detectPlatform(androidUA, 'apple'), 'apple');
        assert.equal(detectPlatform(desktopUA, 'apple'), 'apple');
        assert.equal(detectPlatform(iPhoneUA, 'web'), 'web');
    });

    test('getBaseUrl falls back safely to req headers or localhost', () => {
        const orig = process.env.PUBLIC_BASE_URL;
        delete process.env.PUBLIC_BASE_URL;
        try {
            const mockReq = {
                get: (header) => (header === 'host' ? 'rotary.example.com' : header === 'x-forwarded-proto' ? 'https' : undefined),
                protocol: 'http'
            };
            const url = getBaseUrl(mockReq);
            assert.ok(url.includes('rotary.example.com'));
        } finally {
            if (orig !== undefined) {
                process.env.PUBLIC_BASE_URL = orig;
            }
        }
    });
});

describe('logger utils', () => {
    test('acquisitionSource identifies shared vs direct', () => {
        assert.equal(acquisitionSource('shared'), 'shared');
        assert.equal(acquisitionSource('google-wallet'), 'direct');
        assert.equal(acquisitionSource(undefined), 'direct');
    });

    test('logWalletEvent outputs structured JSON to console', () => {
        const originalLog = console.log;
        let captured = '';
        console.log = (msg) => { captured = msg; };

        try {
            logWalletEvent('test_event', 'apple', 'shared');
            const parsed = JSON.parse(captured);
            assert.equal(parsed.event, 'test_event');
            assert.equal(parsed.platform, 'apple');
            assert.equal(parsed.source, 'shared');
        } finally {
            console.log = originalLog;
        }
    });
});
