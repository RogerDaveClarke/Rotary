const { createHmac, timingSafeEqual } = require('crypto');

function equalText(left, right) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sessionSignature(expiresAt, sessionSecret) {
    return createHmac('sha256', sessionSecret).update(String(expiresAt)).digest('base64url');
}

module.exports = {
    equalText,
    sessionSignature
};
