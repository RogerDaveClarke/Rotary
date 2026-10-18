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

module.exports = {
    text,
    httpsUrl,
    getCardData,
    localized
};
