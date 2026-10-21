const express = require('express');
const QRCode = require('qrcode');
const config = require('../config');
const { requireCreator } = require('../middleware/auth');
const { generationLimiter } = require('../middleware/rateLimiters');
const { getCardData, decodeCardData, encodeCardData, detectPlatform, getBaseUrl } = require('../utils/cardData');
const { logWalletEvent } = require('../utils/logger');
const { renderDashboardPage } = require('../views/dashboardView');
const { renderGoogleSuccessPage } = require('../views/googleSuccessView');
const { renderPublicCardPage } = require('../views/publicCardView');
const { generateApplePass } = require('../services/applePassService');
const { generateGoogleQrPreview, generateGooglePass } = require('../services/googlePassService');

const router = express.Router();

router.use(['/generate', '/generate/google', '/share'], generationLimiter);

router.get('/preview/google-qr', requireCreator, async (req, res) => {
    const baseUrl = getBaseUrl(req);

    try {
        const qrCode = await generateGoogleQrPreview(baseUrl);
        res.type('png').send(qrCode);
    } catch {
        res.status(500).send('Unable to render QR preview.');
    }
});

router.get('/share/qr', async (req, res) => {
    const baseUrl = getBaseUrl(req);
    const rawData = decodeCardData(req.query.data) || req.query;
    const data = getCardData(rawData);
    const encodedData = encodeCardData(data);
    const shareUrl = `${baseUrl}/share?data=${encodedData}`;

    try {
        const qrBuffer = await QRCode.toBuffer(shareUrl, { margin: 1, width: 220, errorCorrectionLevel: 'M' });
        res.type('png').send(qrBuffer);
    } catch {
        res.status(500).send('Unable to render QR code.');
    }
});

router.get('/share', async (req, res) => {
    const baseUrl = getBaseUrl(req);
    const rawData = decodeCardData(req.query.data) || req.query;
    const data = getCardData(rawData);
    const platform = detectPlatform(req.headers['user-agent'], req.query.platform);
    const encodedData = encodeCardData(data);
    const shareBase = `${baseUrl}/share?data=${encodedData}`;

    if (platform === 'apple') {
        const result = await generateApplePass(data, 'shared', baseUrl);
        if (result.error) {
            return res.status(result.error.status).type('html').send(renderPublicCardPage({
                cardData: data,
                appleUrl: `${shareBase}&platform=apple`,
                googleUrl: `${shareBase}&platform=google`,
                qrImageUrl: `${baseUrl}/share/qr?data=${encodedData}`,
                errorMessage: result.error.message
            }));
        }
        logWalletEvent('pass_claimed', 'apple', 'shared');
        res.set({
            'Content-Type': result.mimeType,
            'Content-Disposition': `attachment; filename="${result.filename}"`,
            'Content-Length': result.buffer.length
        });
        return res.send(result.buffer);
    }

    if (platform === 'google') {
        const result = await generateGooglePass(data, 'shared');
        if (result.error) {
            return res.status(result.error.status).type('html').send(renderPublicCardPage({
                cardData: data,
                appleUrl: `${shareBase}&platform=apple`,
                googleUrl: `${shareBase}&platform=google`,
                qrImageUrl: `${baseUrl}/share/qr?data=${encodedData}`,
                errorMessage: result.error.message
            }));
        }
        logWalletEvent('pass_claimed', 'google', 'shared');
        return res.redirect(302, result.saveUrl);
    }

    logWalletEvent('share_landing', 'web', 'shared');
    return res.type('html').send(renderPublicCardPage({
        cardData: data,
        appleUrl: `${shareBase}&platform=apple`,
        googleUrl: `${shareBase}&platform=google`,
        qrImageUrl: `${baseUrl}/share/qr?data=${encodedData}`
    }));
});

router.get('/', requireCreator, (req, res) => {
    const source = req.query.shared === 'google-wallet' ? 'shared' : 'direct';
    if (source === 'shared') {
        logWalletEvent('share_landing', 'google', source);
    }

    res.type('html').send(renderDashboardPage({ source }));
});

router.post('/generate', requireCreator, async (req, res) => {
    const data = getCardData(req.body);
    const baseUrl = getBaseUrl(req);
    const result = await generateApplePass(data, req.body.source, baseUrl);

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

router.post('/generate/google', requireCreator, async (req, res) => {
    const data = getCardData(req.body);
    const result = await generateGooglePass(data, req.body.source);

    if (result.error) {
        return res.status(result.error.status).send(result.error.message);
    }

    return res.type('html').send(renderGoogleSuccessPage(result));
});

module.exports = router;

