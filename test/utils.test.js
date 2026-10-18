const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { equalText, sessionSignature } = require('../src/utils/crypto');
const { text, httpsUrl, getCardData, localized } = require('../src/utils/cardData');
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
