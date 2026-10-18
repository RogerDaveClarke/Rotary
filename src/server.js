require('dotenv').config({ quiet: true });

const app = require('./app');
const config = require('./config');

const server = app.listen(config.port, () => {
    console.log(`Rotary template engine initializing on port ${config.port}`);
});

module.exports = server;
