const express = require('express');
const config = require('../config');
const { installsCheckLimiter } = require('../middleware/rateLimiters');
const { checkInstalls } = require('../services/installTrackerService');

const router = express.Router();

// Called only by Cloud Scheduler via an OIDC-authenticated request; not part of the creator session.
router.post('/internal/check-installs', installsCheckLimiter, async (req, res) => {
    const authHeader = req.get('authorization') || '';
    const publicBaseUrl = config.google.publicBaseUrl;

    const result = await checkInstalls(authHeader, publicBaseUrl);
    if (result.error) {
        return res.status(result.error.status).send(result.error.message);
    }
    return res.status(200).json(result.data);
});

module.exports = router;
