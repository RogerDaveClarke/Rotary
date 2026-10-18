const express = require('express');
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const internalRoutes = require('./routes/internalRoutes');
const assetRoutes = require('./routes/assetRoutes');
const cardRoutes = require('./routes/cardRoutes');

const app = express();

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(healthRoutes);
app.use(authRoutes);
app.use(internalRoutes);
app.use(assetRoutes);
app.use(cardRoutes);

module.exports = app;
