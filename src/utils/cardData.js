const config = require('../config');

const text = (value, fallback, maxLength = 500) => String(value || fallback).trim().slice(0, maxLength);

function httpsUrl(value, fallback) {
    try {
        const url = new URL(String(value || fallback));
        return url.protocol === 'https:' ? url.toString() : fallback;
    } catch {
        return fallback;
    }
}

function getCardData(body = {}) {
    return {
        clubName: text(body.clubName, 'Kirkland', 30),
        dinnerTime: text(body.dinnerTime, 'Dinner at 5:45 pm', 30),
        meetingTime: text(body.meetingTime, 'Club Meetings at 6:15 pm', 30),
        venue: text(body.venue, '', 60),
        venueAddress: text(body.venueAddress, 'Kirkland, WA', 300),
        logisticNotes: text(body.logisticNotes, '', 500),
        memberName: text(body.memberName, 'Rotary Member', 40),
        memberPhone: text(body.memberPhone, '', 20),
        websiteUrl: httpsUrl(body.websiteUrl || body.calendarUrl, 'https://kirklandrotary.org')
    };
}

function localized(value) {
    return { defaultValue: { language: 'en-US', value } };
}

function encodeCardData(data) {
    try {
        const json = JSON.stringify(data);
        return Buffer.from(json).toString('base64url');
    } catch {
        return '';
    }
}

function decodeCardData(encoded) {
    if (!encoded || typeof encoded !== 'string') {
        return null;
    }
    try {
        const json = Buffer.from(encoded, 'base64url').toString('utf8');
        return JSON.parse(json);
    } catch {
        return null;
    }
}

function detectPlatform(userAgent = '', override = '') {
    if (override === 'apple' || override === 'google' || override === 'web') {
        return override;
    }
    const ua = String(userAgent).toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
        return 'apple';
    }
    if (/android/.test(ua)) {
        return 'google';
    }
    return 'web';
}

function getBaseUrl(req) {
    if (config.google && config.google.publicBaseUrl) {
        return config.google.publicBaseUrl.replace(/\/$/, '');
    }
    if (req) {
        const host = req.get('host') || `localhost:${config.port}`;
        const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
        return `${proto}://${host}`;
    }
    return `http://localhost:${config.port}`;
}

module.exports = {
    text,
    httpsUrl,
    getCardData,
    localized,
    encodeCardData,
    decodeCardData,
    detectPlatform,
    getBaseUrl
};
