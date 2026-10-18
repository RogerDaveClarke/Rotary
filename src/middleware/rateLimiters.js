const { rateLimit } = require('express-rate-limit');

const generationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: 'Too many pass-generation requests. Please try again later.'
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: 'Too many login attempts. Please try again later.'
});

const installsCheckLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: 'Too many install-check requests. Please try again later.'
});

module.exports = {
    generationLimiter,
    loginLimiter,
    installsCheckLimiter
};
