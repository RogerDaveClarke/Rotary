const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { renderLoginPage } = require('../src/views/loginView');
const { renderGoogleSuccessPage } = require('../src/views/googleSuccessView');
const { renderDashboardPage } = require('../src/views/dashboardView');

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
});
