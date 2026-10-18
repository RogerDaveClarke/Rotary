const { OAuth2Client, GoogleAuth } = require('google-auth-library');
const { Firestore, FieldValue } = require('@google-cloud/firestore');
const config = require('../config');
const { logWalletEvent } = require('../utils/logger');

const firestore = new Firestore();
const oidcClient = new OAuth2Client();

async function checkInstalls(authHeader, publicBaseUrl) {
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const installsInvokerEmail = config.installs.invokerEmail;

    if (!token || !publicBaseUrl || !installsInvokerEmail) {
        return {
            error: {
                status: 503,
                message: 'Install tracking is not configured.'
            }
        };
    }

    try {
        const ticket = await oidcClient.verifyIdToken({ idToken: token, audience: publicBaseUrl });
        const payload = ticket.getPayload();
        if (!payload || payload.email !== installsInvokerEmail || payload.email_verified !== true) {
            return {
                error: {
                    status: 403,
                    message: 'Unauthorized invoker.'
                }
            };
        }
    } catch {
        return {
            error: {
                status: 401,
                message: 'Invalid token.'
            }
        };
    }

    try {
        const snapshot = await firestore.collection('walletObjects')
            .where('hasUsers', '==', false)
            .orderBy('createdAt', 'asc')
            .limit(200)
            .get();

        if (snapshot.empty) {
            return { data: { checked: 0, confirmed: 0 } };
        }

        const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'] });
        const client = await auth.getClient();
        let confirmed = 0;

        for (const doc of snapshot.docs) {
            try {
                const response = await client.request({
                    url: `https://walletobjects.googleapis.com/walletobjects/v1/genericObject/${encodeURIComponent(doc.id)}`,
                    method: 'GET'
                });
                if (response.data?.hasUsers === true) {
                    await doc.ref.update({ hasUsers: true, confirmedAt: FieldValue.serverTimestamp() });
                    logWalletEvent('object_saved', 'google', doc.data().source);
                    confirmed += 1;
                }
            } catch (error) {
                console.error(`Unable to check install status for ${doc.id}:`, error.message);
            }
        }

        return { data: { checked: snapshot.size, confirmed } };
    } catch (error) {
        console.error('Unable to run install check job:', error.message);
        return {
            error: {
                status: 500,
                message: 'Unable to run the install check job.'
            }
        };
    }
}

module.exports = {
    checkInstalls
};
