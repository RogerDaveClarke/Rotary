const config = require('../config');
const { equalText, sessionSignature } = require('../utils/crypto');

function hasCreatorSession(req) {
    const authConfig = config.auth;
    if (!authConfig.configured) {
        return process.env.NODE_ENV !== 'production';
    }

    const cookie = String(req.headers.cookie || '')
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${config.sessionCookieName}=`));
    if (!cookie) {
        return false;
    }

    const [expiresAtText, signature] = decodeURIComponent(cookie.slice(config.sessionCookieName.length + 1)).split('.');
    const expiresAt = Number(expiresAtText);
    return Number.isSafeInteger(expiresAt)
        && expiresAt > Date.now()
        && Boolean(signature)
        && equalText(signature, sessionSignature(expiresAt, authConfig.sessionSecret));
}

function requireCreator(req, res, next) {
    const authConfig = config.auth;
    if (!authConfig.configured && process.env.NODE_ENV === 'production') {
        return res.status(503).send('Creator access is not configured.');
    }
    if (!hasCreatorSession(req)) {
        return res.redirect(303, '/login');
    }
    return next();
}

module.exports = {
    hasCreatorSession,
    requireCreator
};
