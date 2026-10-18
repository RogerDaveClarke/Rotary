const express = require('express');
const config = require('../config');
const { requireCreator } = require('../middleware/auth');
const { generationLimiter } = require('../middleware/rateLimiters');
const { getCardData } = require('../utils/cardData');
const { logWalletEvent } = require('../utils/logger');
const { renderDashboardPage } = require('../views/dashboardView');
const { renderGoogleSuccessPage } = require('../views/googleSuccessView');
const { generateApplePass } = require('../services/applePassService');
const { generateGoogleQrPreview, generateGooglePass } = require('../services/googlePassService');

const router = express.Router();

router.use(['/generate', '/generate/google'], generationLimiter);
router.use(['/preview/google-qr', '/', '/generate', '/generate/google'], requireCreator);

router.get('/preview/google-qr', async (req, res) => {
    const baseUrl = config.google.publicBaseUrl || `http://localhost:${config.port}`;

    try {
        const qrCode = await generateGoogleQrPreview(baseUrl);
        res.type('png').send(qrCode);
    } catch {
        res.status(500).send('Unable to render QR preview.');
    }
});

router.get('/', (req, res) => {
    const source = req.query.shared === 'google-wallet' ? 'shared' : 'direct';
    if (source === 'shared') {
        logWalletEvent('share_landing', 'google', source);
    }

    res.type('html').send(renderDashboardPage({ source }));
});

router.post('/generate', async (req, res) => {
    const data = getCardData(req.body);
    const result = await generateApplePass(data, req.body.source);

    if (result.error) {
        return res.status(result.error.status).send(result.error.message);
    }

    res.set({
        'Content-Type': result.mimeType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Content-Length': result.buffer.length
    });
    return res.send(result.buffer);
});

router.post('/generate/google', async (req, res) => {
    const data = getCardData(req.body);
    const result = await generateGooglePass(data, req.body.source);

    if (result.error) {
        return res.status(result.error.status).send(result.error.message);
    }

    return res.type('html').send(renderGoogleSuccessPage(result));
});

module.exports = router;
