const fs = require('fs');
const { createSign, randomUUID } = require('crypto');
const { GoogleAuth } = require('google-auth-library');
const { Firestore, FieldValue } = require('@google-cloud/firestore');
const QRCode = require('qrcode');
const config = require('../config');
const { localized } = require('../utils/cardData');
const { logWalletEvent, acquisitionSource } = require('../utils/logger');

const firestore = new Firestore();

async function signGoogleWalletJwt(auth, credentials, payload) {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const header = encode({ alg: 'RS256', typ: 'JWT' });
    const claims = encode(payload);
    const unsignedToken = `${header}.${claims}`;

    if (credentials.private_key) {
        const signature = createSign('RSA-SHA256').update(unsignedToken).sign(credentials.private_key, 'base64url');
        return `${unsignedToken}.${signature}`;
    }

    const serviceAccountEmail = credentials.client_email || (await auth.getCredentials()).client_email;
    if (!serviceAccountEmail) {
        throw new Error('Unable to determine the Google Cloud service account email.');
    }

    const client = await auth.getClient();
    const response = await client.request({
        url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccountEmail)}:signBlob`,
        method: 'POST',
        data: { payload: Buffer.from(unsignedToken).toString('base64') }
    });
    const signature = Buffer.from(response.data.signedBlob, 'base64').toString('base64url');
    return `${unsignedToken}.${signature}`;
}

async function generateGoogleQrPreview(baseUrl) {
    const shareUrl = `${baseUrl.replace(/\/$/, '')}/?shared=google-wallet`;
    return QRCode.toBuffer(shareUrl, { margin: 1, width: 180, errorCorrectionLevel: 'M' });
}

async function generateGooglePass(data, source) {
    const issuerId = config.google.issuerId;
    const credentialsPath = config.google.credentialsPath;
    const publicBaseUrl = config.google.publicBaseUrl;

    if (!issuerId || !/^\d+$/.test(issuerId) || !publicBaseUrl) {
        return {
            error: {
                status: 503,
                message: 'Google Wallet is not configured. Set GOOGLE_WALLET_ISSUER_ID to the numeric issuer ID from Google Wallet Business Console and set PUBLIC_BASE_URL to a public HTTPS address.'
            }
        };
    }

    if (!publicBaseUrl.startsWith('https://') || (credentialsPath && !fs.existsSync(credentialsPath))) {
        return {
            error: {
                status: 503,
                message: 'Google Wallet requires a public HTTPS PUBLIC_BASE_URL and, when configured, a valid service-account JSON file.'
            }
        };
    }

    try {
        const credentials = credentialsPath ? JSON.parse(fs.readFileSync(credentialsPath, 'utf8')) : {};
        const classId = `${issuerId}.rotary_club_card`;
        const objectId = `${issuerId}.${randomUUID().replaceAll('-', '_')}`;
        const normalizedBaseUrl = publicBaseUrl.replace(/\/$/, '');
        const auth = new GoogleAuth({
            ...(credentialsPath ? { keyFile: credentialsPath } : {}),
            scopes: [
                'https://www.googleapis.com/auth/wallet_object.issuer',
                'https://www.googleapis.com/auth/cloud-platform'
            ]
        });
        const client = await auth.getClient();
        const serviceAccountEmail = credentials.client_email || (await auth.getCredentials()).client_email;
        const token = await signGoogleWalletJwt(auth, credentials, {
            iss: serviceAccountEmail,
            aud: 'google',
            typ: 'savetowallet',
            iat: Math.floor(Date.now() / 1000),
            origins: [new URL(publicBaseUrl).origin],
            payload: {
                genericObjects: [{ id: objectId, classId }]
            }
        });
        const saveUrl = `https://pay.google.com/gp/v/save/${token}`;

        if (saveUrl.length > 1800) {
            return {
                error: {
                    status: 400,
                    message: 'The Google Wallet link is too long. Shorten the venue or notes and try again.'
                }
            };
        }

        const genericObject = {
            id: objectId,
            classId,
            state: 'ACTIVE',
            genericType: 'GENERIC_OTHER',
            cardTitle: localized(`Rotary Club of ${data.clubName}`),
            header: localized(data.memberName),
            hexBackgroundColor: '#ffffff',
            logo: {
                sourceUri: { uri: `${normalizedBaseUrl}/assets/rotary-wheel.png` },
                contentDescription: localized('Rotary Club of Kirkland')
            },
            barcode: { type: 'QR_CODE', value: saveUrl, alternateText: 'Scan to share with a potential member' },
            textModulesData: [
                { id: 'venue', header: 'Meeting Schedule', body: `${data.dinnerTime}\n${data.meetingTime}\n\n${[data.venue, data.venueAddress].filter(Boolean).join('\n')}` },
                { id: 'notes', header: 'Notes', body: data.logisticNotes },
                { id: 'member', header: 'Referring Member', body: `${data.memberName} - ${data.memberPhone}` },
                { id: 'share', header: 'Share This Card', body: 'Have another Android user scan the QR code with their phone camera to create a fresh card.' }
            ],
            linksModuleData: {
                uris: [
                    { id: 'website', uri: data.websiteUrl, description: 'Open Club Website' }
                ]
            }
        };
        const apiBase = 'https://walletobjects.googleapis.com/walletobjects/v1';

        try {
            await client.request({
                url: `${apiBase}/genericClass`,
                method: 'POST',
                data: { id: classId }
            });
        } catch (error) {
            if (error.response?.status !== 409) {
                throw error;
            }
        }

        await client.request({
            url: `${apiBase}/genericObject`,
            method: 'POST',
            data: genericObject
        });

        try {
            await firestore.collection('walletObjects').doc(objectId).set({
                classId,
                source: acquisitionSource(source),
                hasUsers: false,
                confirmedAt: null,
                createdAt: FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error('Unable to record wallet object for install tracking:', error.message);
        }

        logWalletEvent('save_link_issued', 'google', source);
        const escapedSaveUrl = saveUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        const mailtoHref = `mailto:?subject=${encodeURIComponent(`Rotary Club of ${data.clubName} digital card`)}&body=${encodeURIComponent(`Add this card to Google Wallet:\n${saveUrl}`)}`;

        return {
            saveUrl,
            escapedSaveUrl,
            mailtoHref,
            clubName: data.clubName
        };
    } catch (error) {
        console.error('Unable to generate Google Wallet pass:', error.message);
        return {
            error: {
                status: 500,
                message: 'Unable to generate the Google Wallet pass. Check the Google Wallet configuration and server log.'
            }
        };
    }
}

module.exports = {
    signGoogleWalletJwt,
    generateGoogleQrPreview,
    generateGooglePass
};
