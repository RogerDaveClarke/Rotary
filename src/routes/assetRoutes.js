const express = require('express');
const path = require('path');
const config = require('../config');
const { requireCreator } = require('../middleware/auth');

const router = express.Router();

router.get('/assets/logo.png', (req, res) => {
    res.sendFile(path.join(config.assetsPath, 'logo.png'));
});

router.get('/assets/logo@2x.png', (req, res) => {
    res.sendFile(path.join(config.assetsPath, 'logo@2x.png'));
});

// Served unauthenticated so Google's servers can fetch it for the wallet pass logo.
router.get('/assets/rotary-wheel.png', (req, res) => {
    res.sendFile(path.join(config.assetsPath, 'rotary-wheel.png'));
});

router.use('/assets', requireCreator, express.static(config.assetsPath));

module.exports = router;
