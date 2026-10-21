const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { PKPass, PassType } = require('passkit-generator');
const config = require('../config');
const { encodeCardData } = require('../utils/cardData');
const { logWalletEvent } = require('../utils/logger');

function validateAppleSettings(appleSettings) {
    const missingSettings = Object.entries(appleSettings)
        .filter(([, value]) => !value)
        .map(([name]) => name);

    if (missingSettings.length > 0) {
        return {
            valid: false,
            error: {
                status: 500,
                message: `Missing Apple Wallet settings: ${missingSettings.join(', ')}`
            }
        };
    }
    return { valid: true };
}

function validateAppleFiles(requiredFiles) {
    const missingFiles = Object.values(requiredFiles).filter((filePath) => !fs.existsSync(filePath));

    if (missingFiles.length > 0) {
        return {
            valid: false,
            error: {
                status: 500,
                message: `Missing pass files: ${missingFiles.map((filePath) => path.basename(filePath)).join(', ')}`
            }
        };
    }
    return { valid: true };
}

async function generateApplePass(data, source, baseUrl = null) {
    const appleSettings = config.apple;
    const settingsValidation = validateAppleSettings(appleSettings);
    if (!settingsValidation.valid) {
        return { error: settingsValidation.error };
    }

    const projectRoot = config.projectRoot;
    const assetsPath = config.assetsPath;
    const requiredFiles = {
        signerCert: path.resolve(projectRoot, appleSettings.signerCertPath),
        signerKey: path.resolve(projectRoot, appleSettings.signerKeyPath),
        wwdr: path.resolve(projectRoot, appleSettings.wwdrCertPath),
        icon: path.join(assetsPath, 'icon.png'),
        icon2x: path.join(assetsPath, 'icon@2x.png'),
        logo: path.join(assetsPath, 'logo.png'),
        logo2x: path.join(assetsPath, 'logo@2x.png')
    };

    const filesValidation = validateAppleFiles(requiredFiles);
    if (!filesValidation.valid) {
        return { error: filesValidation.error };
    }

    try {
        const pass = new PKPass(
            {
                'icon.png': fs.readFileSync(requiredFiles.icon),
                'icon@2x.png': fs.readFileSync(requiredFiles.icon2x),
                'logo.png': fs.readFileSync(requiredFiles.logo),
                'logo@2x.png': fs.readFileSync(requiredFiles.logo2x)
            },
            {
                signerCert: fs.readFileSync(requiredFiles.signerCert),
                signerKey: fs.readFileSync(requiredFiles.signerKey),
                wwdr: fs.readFileSync(requiredFiles.wwdr)
            },
            {
                formatVersion: 1,
                passTypeIdentifier: appleSettings.passTypeIdentifier,
                serialNumber: randomUUID(),
                teamIdentifier: appleSettings.teamIdentifier,
                organizationName: appleSettings.organizationName,
                description: `Rotary Club of ${data.clubName} card`,
                sharingProhibited: false,
                backgroundColor: 'rgb(255, 255, 255)',
                foregroundColor: 'rgb(0, 0, 0)',
                labelColor: 'rgb(0, 80, 160)'
            }
        );

        const generic = new PassType('generic');
        generic.primaryFields.push({ key: 'schedule', label: 'Meeting Schedule', value: `${data.dinnerTime}\n${data.meetingTime}` });
        if (data.venue) {
            generic.secondaryFields.push({ key: 'venue', label: 'Venue', value: data.venue });
        }
        generic.auxiliaryFields.push({ key: 'member', label: 'Referring Member', value: `${data.memberName} - ${data.memberPhone}` });
        generic.backFields.push({ key: 'addressFull', label: 'Full Address', value: [data.venue, data.venueAddress].filter(Boolean).join('\n') });
        if (data.logisticNotes) {
            generic.backFields.push({ key: 'notesFull', label: 'Full Notes', value: data.logisticNotes });
        }
        generic.backFields.push({
            key: 'website',
            label: 'Club Website',
            value: data.websiteUrl,
            attributedValue: `<a href="${data.websiteUrl}">${data.websiteUrl}</a>`,
            dataDetectorTypes: ['PKDataDetectorTypeLink']
        });

        const publicHost = baseUrl || config.google.publicBaseUrl || '';
        if (publicHost) {
            const normalizedHost = publicHost.replace(/\/$/, '');
            const encodedData = encodeCardData(data);
            const shareUrl = `${normalizedHost}/share?data=${encodedData}`;

            pass.setBarcodes({
                format: 'PKBarcodeFormatQR',
                message: shareUrl,
                messageEncoding: 'iso-8859-1',
                altText: 'Scan to save to Apple or Google Wallet'
            });

            generic.backFields.push({
                key: 'shareGoogle',
                label: 'Add to Google Wallet (Android)',
                value: `${shareUrl}&platform=google`,
                attributedValue: `<a href="${shareUrl}&platform=google">Add to Google Wallet</a>`,
                dataDetectorTypes: ['PKDataDetectorTypeLink']
            });
            generic.backFields.push({
                key: 'shareUniversal',
                label: 'Share Card Link',
                value: shareUrl,
                attributedValue: `<a href="${shareUrl}">Share with any device</a>`,
                dataDetectorTypes: ['PKDataDetectorTypeLink']
            });
        }

        pass.types.push(generic);

        const passBuffer = pass.getAsBuffer();
        logWalletEvent('pass_issued', 'apple', source);

        return {
            buffer: passBuffer,
            mimeType: pass.mimeType,
            filename: 'rotary_club-card.pkpass'
        };
    } catch (error) {
        console.error('Unable to generate Apple Wallet pass:', error.message);
        return {
            error: {
                status: 500,
                message: 'Unable to generate the Apple Wallet pass. Check the signing certificates and server log.'
            }
        };
    }
}

module.exports = {
    validateAppleSettings,
    validateAppleFiles,
    generateApplePass
};
