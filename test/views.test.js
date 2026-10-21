const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { renderLoginPage } = require('../src/views/loginView');
const { renderGoogleSuccessPage } = require('../src/views/googleSuccessView');
const { renderDashboardPage } = require('../src/views/dashboardView');
const { renderPublicCardPage } = require('../src/views/publicCardView');

describe('HTML view renderers', () => {
    test('renderLoginPage contains form and accessCode input', () => {
        const html = renderLoginPage();
        assert.ok(html.includes('<title>Rotary Card Creator Access</title>'));
        assert.ok(html.includes('<form method="post" action="/login">'));
        assert.ok(html.includes('id="accessCode"'));
    });

    test('renderGoogleSuccessPage includes escaped save url and mailto', () => {
        const html = renderGoogleSuccessPage({
            escapedSaveUrl: 'https://pay.google.com/gp/v/save/token123&amp;param=1',
            mailtoHref: 'mailto:?subject=Test&body=Add'
        });
        assert.ok(html.includes('Google Wallet pass ready'));
        assert.ok(html.includes('https://pay.google.com/gp/v/save/token123&amp;param=1'));
        assert.ok(html.includes('mailto:?subject=Test&body=Add'));
    });

    test('renderDashboardPage embeds source and critical preview elements', () => {
        const html = renderDashboardPage({ source: 'shared' });
        assert.ok(html.includes('name="source" value="shared"'));
        assert.ok(html.includes('Rotary Pass Parameter Configurator'));
        assert.ok(html.includes('Real-Time Live Device Preview'));
        assert.ok(html.includes('action="/generate"'));
        assert.ok(html.includes('formaction="/generate/google"'));
    });

    test('renderPublicCardPage renders responsive landing with wallet buttons and details', () => {
        const html = renderPublicCardPage({
            cardData: {
                clubName: 'Kirkland',
                memberName: 'Jane Doe',
                memberPhone: '+1-425-555-0199',
                dinnerTime: 'Dinner at 5:45 pm',
                meetingTime: 'Club Meetings at 6:15 pm',
                venue: 'Prosecco',
                venueAddress: 'Kirkland, WA',
                logisticNotes: 'Meets Mondays',
                websiteUrl: 'https://kirklandrotary.org'
            },
            appleUrl: 'https://example.com/share?platform=apple',
            googleUrl: 'https://example.com/share?platform=google',
            qrImageUrl: 'https://example.com/share/qr'
        });
        assert.ok(html.includes('Rotary Club of Kirkland'));
        assert.ok(html.includes('Jane Doe'));
        assert.ok(html.includes('Add to Apple Wallet'));
        assert.ok(html.includes('Save to Google Wallet'));
        assert.ok(html.includes('https://example.com/share?platform=apple'));
        assert.ok(html.includes('https://example.com/share?platform=google'));
        assert.ok(html.includes('https://example.com/share/qr'));
    });
});
