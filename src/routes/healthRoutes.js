const express = require('express');

const router = express.Router();

router.get(['/healthz', '/api/health'], (req, res) => {
    res.status(200).json({ status: 'ok' });
});

module.exports = router;
