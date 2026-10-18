const express = require('express');
const config = require('../config');
const { equalText, sessionSignature } = require('../utils/crypto');
const { loginLimiter } = require('../middleware/rateLimiters');
const { renderLoginPage } = require('../views/loginView');

const router = express.Router();

router.get('/login', (req, res) => {
    res.type('html').send(renderLoginPage());
});

router.post('/login', loginLimiter, (req, res) => {
    const authConfig = config.auth;
    if (!authConfig.configured || !equalText(String(req.body.accessCode || ''), authConfig.creatorAccessCode)) {
        return res.status(401).send('Invalid access code.');
    }

    const expiresAt = Date.now() + (8 * 60 * 60 * 1000);
    const secure = req.secure || req.get('x-forwarded-proto') === 'https';
    res.cookie(config.sessionCookieName, `${expiresAt}.${sessionSignature(expiresAt, authConfig.sessionSecret)}`, {
        httpOnly: true,
        secure,
        sameSite: 'strict',
        maxAge: 8 * 60 * 60 * 1000,
        path: '/'
    });
    return res.redirect(303, '/');
});

router.post('/logout', (req, res) => {
    res.clearCookie(config.sessionCookieName, { httpOnly: true, sameSite: 'strict', path: '/' });
    return res.redirect(303, '/login');
});

module.exports = router;
