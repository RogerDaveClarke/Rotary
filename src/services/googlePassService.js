const fs = require('fs');
const { createSign, randomUUID } = require('crypto');
const { GoogleAuth } = require('google-auth-library');
const { Firestore, FieldValue } = require('@google-cloud/firestore');
const QRCode = require('qrcode');
const config = require('../config');
const { localized, encodeCardData } = require('../utils/cardData');
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
    const shareUrl = `${baseUrl.replace(/\/$/, '')}/share?source=preview`;
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
        const encodedData = encodeCardData(data);
        const smartShareUrl = `${normalizedBaseUrl}/share?data=${encodedData}`;

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

        const textModules = [
            { id: 'schedule', header: 'Meeting Schedule', body: `${data.dinnerTime}\n${data.meetingTime}` },
            { id: 'venue', header: 'Venue', body: [data.venue, data.venueAddress].filter(Boolean).join('\n') || 'TBD' },
            { id: 'member', header: 'Referring Member', body: `${data.memberName}${data.memberPhone ? `\n${data.memberPhone}` : ''}` },
            data.logisticNotes ? { id: 'notes', header: 'Notes', body: data.logisticNotes } : null,
            { id: 'share', header: 'Share This Card', body: 'Have any iPhone or Android user scan this QR code with their camera to save this card to Apple Wallet or Google Wallet.' }
        ].filter(Boolean);

        const genericObject = {
            id: objectId,
            classId,
            state: 'ACTIVE',
            genericType: 'GENERIC_OTHER',
            cardTitle: localized(`Rotary Club of ${data.clubName}`),
            header: localized('Referring Member'),
            subheader: localized(`${data.memberName}${data.memberPhone ? ` (${data.memberPhone})` : ''}`),
            hexBackgroundColor: '#ffffff',
            logo: {
                sourceUri: { uri: `${normalizedBaseUrl}/assets/logo@2x.png` },
                contentDescription: localized(`Rotary Club of ${data.clubName}`)
            },
            wideLogo: {
                sourceUri: { uri: `${normalizedBaseUrl}/assets/logo@2x.png` },
                contentDescription: localized(`Rotary Club of ${data.clubName}`)
            },
            cardTemplateOverride: {
                cardRowTemplateInfos: [
                    {
                        twoItems: {
                            startItem: {
                                firstValue: {
                                    fields: [{ fieldPath: "object.textModulesData['schedule']" }]
                                }
                            },
                            endItem: {
                                firstValue: {
                                    fields: [{ fieldPath: "object.textModulesData['venue']" }]
                                }
                            }
                        }
                    }
                ]
            },
            barcode: {
                type: 'QR_CODE',
                value: smartShareUrl,
                alternateText: 'Scan to save on iPhone or Android'
            },
            textModulesData: textModules,
            linksModuleData: {
                uris: [
                    { id: 'apple_wallet', uri: `${smartShareUrl}&platform=apple`, description: 'Add to Apple Wallet (iPhone)' },
                    { id: 'share_card', uri: smartShareUrl, description: 'Share Card (iPhone and Android)' },
                    { id: 'website', uri: data.websiteUrl, description: 'Open Club Website' }
                ]
            }
        };
        const apiBase = 'https://walletobjects.googleapis.com/walletobjects/v1';

        const genericClass = {
            id: classId,
            classTemplateInfo: {
                cardTemplateOverride: {
                    cardRowTemplateInfos: [
                        {
                            twoItems: {
                                startItem: {
                                    firstValue: {
                                        fields: [{ fieldPath: "object.textModulesData['schedule']" }]
                                    }
                                },
                                endItem: {
                                    firstValue: {
                                        fields: [{ fieldPath: "object.textModulesData['venue']" }]
                                    }
                                }
                            }
                        }
                    ]
                }
            }
        };

        try {
            await client.request({
                url: `${apiBase}/genericClass`,
                method: 'POST',
                data: genericClass
            });
        } catch (error) {
            if (error.response?.status === 409) {
                await client.request({
                    url: `${apiBase}/genericClass/${encodeURIComponent(classId)}`,
                    method: 'PATCH',
                    data: {
                        classTemplateInfo: genericClass.classTemplateInfo
                    }
                });
            } else {
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
