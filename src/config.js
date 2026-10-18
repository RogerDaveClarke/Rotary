require('dotenv').config({ quiet: true });

const path = require('path');
const fs = require('fs');

function readSecret(pathVariable, valueVariable) {
    const secretPath = process.env[pathVariable];
    if (secretPath) {
        return fs.readFileSync(secretPath, 'utf8').trim();
    }
    return String(process.env[valueVariable] || '').trim();
}

const projectRoot = path.resolve(__dirname, '..');
const assetsPath = path.join(projectRoot, 'assets');

const config = {
    get port() {
        return process.env.PORT || 3000;
    },
    projectRoot,
    assetsPath,
    sessionCookieName: 'rotary_creator_session',
    get auth() {
        const creatorAccessCode = readSecret('CREATOR_ACCESS_CODE_PATH', 'CREATOR_ACCESS_CODE');
        const sessionSecret = readSecret('SESSION_SECRET_PATH', 'SESSION_SECRET');
        return {
            creatorAccessCode,
            sessionSecret,
            configured: creatorAccessCode.length >= 12 && sessionSecret.length >= 32
        };
    },
    get apple() {
        return {
            passTypeIdentifier: process.env.APPLE_PASS_TYPE_IDENTIFIER,
            teamIdentifier: process.env.APPLE_TEAM_IDENTIFIER,
            organizationName: process.env.APPLE_ORGANIZATION_NAME,
            signerCertPath: process.env.APPLE_SIGNER_CERT_PATH,
            signerKeyPath: process.env.APPLE_SIGNER_KEY_PATH,
            wwdrCertPath: process.env.APPLE_WWDR_CERT_PATH
        };
    },
    get google() {
        return {
            issuerId: process.env.GOOGLE_WALLET_ISSUER_ID,
            credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS,
            publicBaseUrl: process.env.PUBLIC_BASE_URL
        };
    },
    get installs() {
        return {
            invokerEmail: String(process.env.INSTALLS_SCHEDULER_SA_EMAIL || '').trim()
        };
    }
};

module.exports = config;
