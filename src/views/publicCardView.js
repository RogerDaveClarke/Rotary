function renderPublicCardPage({
    cardData,
    appleUrl,
    googleUrl,
    qrImageUrl,
    errorMessage = null
}) {
    const venueFull = [cardData.venue, cardData.venueAddress].filter(Boolean).join(', ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Rotary Club of ${cardData.clubName} - Digital Membership Pass</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background: #f4f6f9;
            margin: 0;
            padding: 24px 16px;
            color: #202124;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            box-sizing: border-box;
        }
        .container {
            width: 100%;
            max-width: 460px;
            background: white;
            border-radius: 16px;
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
            overflow: hidden;
            border: 1px solid #e1e4e8;
        }
        .header {
            background: #0050A0;
            color: white;
            padding: 24px 20px;
            text-align: center;
        }
        .header img {
            width: 50px;
            height: 50px;
            margin-bottom: 8px;
        }
        .header h1 {
            margin: 0;
            font-size: 22px;
            font-weight: 700;
        }
        .header p {
            margin: 6px 0 0;
            font-size: 14px;
            opacity: 0.9;
        }
        .body {
            padding: 24px 20px;
        }
        .info-card {
            background: #f8f9fa;
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 24px;
            border: 1px solid #edf0f2;
        }
        .info-row {
            margin-bottom: 12px;
        }
        .info-row:last-child {
            margin-bottom: 0;
        }
        .info-label {
            font-size: 11px;
            text-transform: uppercase;
            font-weight: 700;
            color: #5f6368;
            letter-spacing: 0.5px;
        }
        .info-value {
            font-size: 14px;
            color: #202124;
            margin-top: 4px;
            white-space: pre-line;
            line-height: 1.4;
        }
        .actions {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-bottom: 24px;
        }
        .btn-wallet {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            padding: 14px 20px;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 700;
            text-decoration: none;
            cursor: pointer;
            border: none;
            transition: transform 0.1s ease, box-shadow 0.1s ease;
        }
        .btn-wallet:active {
            transform: scale(0.98);
        }
        .btn-apple {
            background: #000000;
            color: white;
        }
        .btn-apple:hover {
            background: #1a1a1a;
            color: white;
        }
        .btn-google {
            background: #202124;
            color: white;
            border: 1px solid #3c4043;
        }
        .btn-google:hover {
            background: #303134;
            color: white;
        }
        .qr-section {
            text-align: center;
            padding-top: 16px;
            border-top: 1px solid #edf0f2;
        }
        .qr-section img {
            width: 160px;
            height: 160px;
            border-radius: 8px;
            border: 1px solid #e1e4e8;
            margin-bottom: 8px;
        }
        .qr-caption {
            font-size: 12px;
            color: #5f6368;
        }
        .error-alert {
            background: #fce8e6;
            color: #c5221f;
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 16px;
            font-size: 13px;
            line-height: 1.4;
        }
        .footer {
            text-align: center;
            font-size: 12px;
            color: #5f6368;
            margin-top: 16px;
        }
        .footer a {
            color: #0050A0;
            text-decoration: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="/assets/rotary-wheel.png" alt="Rotary International Wheel">
            <h1>Rotary Club of ${cardData.clubName}</h1>
            <p>Digital Member Pass</p>
        </div>
        <div class="body">
            ${errorMessage ? `<div class="error-alert">${errorMessage}</div>` : ''}
            
            <div class="actions">
                <a class="btn-wallet btn-apple" href="${appleUrl}">
                    <svg width="20" height="24" viewBox="0 0 170 170" fill="currentColor">
                        <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.69-3.04-7.69-7.85-12-14.42-6.19-9.45-10.88-20.2-14.07-32.26-3.18-12.06-4.78-23.14-4.78-33.24 0-14.34 3.73-26.06 11.19-35.15 7.46-9.09 16.71-13.72 27.75-13.88 5.43 0 11.05 1.41 16.86 4.23 5.81 2.83 9.68 4.3 11.61 4.42 1.63 0 5.66-1.57 12.09-4.71 6.43-3.14 12.08-4.46 16.96-3.97 12.61.98 22.42 5.66 29.43 14.04-10.87 6.52-16.19 15.44-15.97 26.75.22 8.91 3.74 16.42 10.55 22.51 6.81 6.1 14.89 9.68 24.24 10.76-2.5 7.72-5.65 15.54-9.45 23.46zM119.22 33.15c0-7.39 2.66-14.34 7.99-20.86 5.33-6.52 11.96-10.76 19.89-12.29.22 1.09.33 2.17.33 3.26 0 7.39-2.83 14.56-8.48 21.52-5.65 6.96-12.39 11.08-20.22 12.39.22-1.3.49-2.65.49-4.02z"/>
                    </svg>
                    Add to Apple Wallet
                </a>
                <a class="btn-wallet btn-google" href="${googleUrl}">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                    </svg>
                    Save to Google Wallet
                </a>
            </div>

            <div class="info-card">
                <div class="info-row">
                    <div class="info-label">Referring Rotarian</div>
                    <div class="info-value"><strong>${cardData.memberName}</strong> ${cardData.memberPhone ? `(${cardData.memberPhone})` : ''}</div>
                </div>
                <div class="info-row">
                    <div class="info-label">Meeting Schedule</div>
                    <div class="info-value">${cardData.dinnerTime}\n${cardData.meetingTime}</div>
                </div>
                ${venueFull ? `
                <div class="info-row">
                    <div class="info-label">Meeting Location</div>
                    <div class="info-value">${venueFull}</div>
                </div>` : ''}
                ${cardData.logisticNotes ? `
                <div class="info-row">
                    <div class="info-label">Notes</div>
                    <div class="info-value">${cardData.logisticNotes}</div>
                </div>` : ''}
            </div>

            ${qrImageUrl ? `
            <div class="qr-section">
                <img src="${qrImageUrl}" alt="Scan QR code with phone camera to add to wallet">
                <div class="qr-caption">On computer? Scan with your phone camera to add directly.</div>
            </div>` : ''}

            <div class="footer">
                <p><a href="${cardData.websiteUrl}" target="_blank" rel="noopener">Visit Rotary Club Website &rarr;</a></p>
            </div>
        </div>
    </div>
</body>
</html>`;
}

module.exports = {
    renderPublicCardPage
};

