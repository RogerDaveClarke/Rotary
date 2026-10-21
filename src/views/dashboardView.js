function renderDashboardPage({ source = 'direct' } = {}) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Rotary Digital Card Creator</title>
        <style>
            body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #f4f6f9; padding: 30px; margin: 0; display: flex; gap: 30px; }
            .form-container { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); width: 45%; }
            .preview-container { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); width: 45%; display: flex; flex-direction: column; align-items: center; justify-content: center; }
            h2 { color: #0050A0; margin-top: 0; }
            .form-group { margin-bottom: 15px; display: flex; flex-direction: column; }
            label { font-weight: bold; margin-bottom: 5px; font-size: 14px; color: #333; }
            label em { font-style: italic; font-weight: normal; color: #666; font-size: 12px; }
            input, textarea { padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; }
            button { background: #0050A0; color: white; border: none; padding: 12px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 16px; margin-top: 10px; }
            button:hover { background: #00366d; }
            .wallet-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            .google-wallet { background: #202124; }
            .google-wallet:hover { background: #000; }
            button:focus-visible, input:focus-visible, textarea:focus-visible, a:focus-visible { outline: 3px solid #f7a81b; outline-offset: 2px; }
            
            /* Card Layout Graphics Matching Kirkland */
            .preview-platform { width: 100%; max-width: 350px; }
            .preview-tabs { display: grid; grid-template-columns: 1fr 1fr; width: 100%; margin-bottom: 12px; border: 1px solid #0050A0; border-radius: 6px; overflow: hidden; }
            .preview-tab { margin: 0; border-radius: 0; background: white; color: #0050A0; }
            .preview-tab[aria-selected="true"] { background: #0050A0; color: white; }
            .card-mockup { width: 100%; max-width: 350px; height: 514px; background: white; border: 1px solid #ddd; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.08); padding: 16px 15px; box-sizing: border-box; }
            [hidden] { display: none !important; }
            .card-header { height: 68px; display: flex; justify-content: flex-end; align-items: flex-start; }
            .pass-logo { width: 160px; height: 50px; display: flex; justify-content: flex-end; align-items: center; color: #0050a4; }
            .apple-logo { height: 50px; object-fit: contain; }
            .rotary-wordmark { font-size: 19px; line-height: 1; font-weight: 700; }
            .rotary-wheel { width: 36px; height: 36px; margin-left: 3px; object-fit: cover; }
            .brand-divider { width: 1px; height: 34px; margin: 0 5px; background: #0050a4; }
            .club-wordmark { font-size: 11px; line-height: 1.05; font-weight: 700; }
            .card-body { margin-top: 27px; display: flex; flex-direction: column; gap: 27px; }
            .field-label { color: #0050A0; font-size: 12px; line-height: 1; font-weight: 700; text-transform: uppercase; }
            .field-value { color: #000; margin-top: 8px; white-space: pre-line; overflow-wrap: anywhere; }
            .schedule-value { font-size: 27px; line-height: 1.25; }
            .member-value { font-size: 15px; line-height: 1.2; }
            .back-fields { display: flex; flex-direction: column; gap: 18px; }
            .back-field .field-value { font-size: 13px; line-height: 1.3; }
            .back-field a { color: #0050A0; overflow-wrap: anywhere; }
            .google-device { min-height: 514px; padding: 16px; box-sizing: border-box; border-radius: 20px; background: #f1f3f4; box-shadow: 0 10px 25px rgba(0,0,0,0.08); font-family: 'Google Sans', 'Helvetica Neue', Arial, sans-serif; }
            .google-pass-card { overflow: hidden; border: 1px solid #dadce0; border-radius: 16px; background: white; box-shadow: 0 2px 6px rgba(60,64,67,0.15); }
            .google-pass-main { padding: 18px; }
            .google-header { margin-top: 24px; color: #202124; font-size: 24px; line-height: 1.15; font-weight: 500; overflow-wrap: anywhere; }
            .google-qr { display: block; width: 126px; height: 126px; margin: 22px auto 8px; image-rendering: pixelated; }
            .google-qr-caption { color: #5f6368; font-size: 11px; text-align: center; }
            .google-details { padding: 0 18px 18px; border-top: 1px solid #e0e0e0; }
            .google-module { padding-top: 16px; }
            .google-module-title { color: #5f6368; font-size: 11px; font-weight: 700; text-transform: uppercase; }
            .google-module-value { margin-top: 5px; color: #202124; font-size: 13px; line-height: 1.35; white-space: pre-line; overflow-wrap: anywhere; }
            .google-module-value a { color: #1967d2; }
            .google-link { display: block; padding: 9px 0; color: #1967d2; text-decoration: none; }
            .google-link + .google-link { border-top: 1px solid #e0e0e0; }
            @media (max-width: 800px) {
                body { padding: 16px; flex-direction: column; }
                .form-container, .preview-container { box-sizing: border-box; width: 100%; }
            }
        </style>
    </head>
    <body>
        <div class="form-container">
            <h2>Rotary Pass Parameter Configurator</h2>
            <form action="/generate" method="POST">
                <input type="hidden" name="source" value="${source}">
                <div class="form-group">
                    <label for="inputClub">Club Name <em>(max 30 characters)</em></label>
                    <input type="text" id="inputClub" name="clubName" value="Kirkland" maxlength="30" oninput="updatePreview()">
                </div>
                <div class="form-group">
                    <label for="inputDinnerTime">Dinner Time <em>(max 30 characters)</em></label>
                    <input type="text" id="inputDinnerTime" name="dinnerTime" value="Dinner at 5:45 pm" maxlength="30" oninput="updatePreview()">
                </div>
                <div class="form-group">
                    <label for="inputTime">Meeting Time &amp; Schedule Header <em>(max 30 characters)</em></label>
                    <input type="text" id="inputTime" name="meetingTime" value="Club Meetings at 6:15 pm" maxlength="30" oninput="updatePreview()">
                </div>
                <div class="form-group">
                    <label for="inputVenue">Venue <em>(max 60 characters)</em></label>
                    <input type="text" id="inputVenue" name="venue" value="Prosecco Restaurant & Pizzeria" maxlength="60" oninput="updatePreview()">
                </div>
                <div class="form-group">
                    <label for="inputAddress">Venue Address <em>(max 300 characters)</em></label>
                    <textarea id="inputAddress" name="venueAddress" rows="3" maxlength="300" oninput="updatePreview()">7 Lakeshore Plaza\nKirkland, WA 98033\nUnited States of America</textarea>
                </div>
                <div class="form-group">
                    <label for="inputNotes">Additional Logistic Notes <em>(max 500 characters)</em></label>
                    <textarea id="inputNotes" name="logisticNotes" rows="3" maxlength="500" oninput="updatePreview()">In-person the 1st and 3rd Monday and socials on the second Monday of the month. No meetings on federal holidays or the fourth and fifth Mondays.</textarea>
                </div>
                <div class="form-group">
                    <label for="inputMember">Referring Rotarian Member Name <em>(max 40 characters)</em></label>
                    <input type="text" id="inputMember" name="memberName" value="Jane Doe" maxlength="40" oninput="updatePreview()">
                </div>
                <div class="form-group">
                    <label for="inputPhone">Member Phone Number <em>(max 20 characters)</em></label>
                    <input type="tel" id="inputPhone" name="memberPhone" value="+1-425-555-0199" maxlength="20" oninput="updatePreview()">
                </div>
                <div class="form-group">
                    <label for="inputUrl">Club Website <em>(max 200 characters)</em></label>
                    <input type="url" id="inputUrl" name="websiteUrl" value="https://kirklandrotary.org" maxlength="200" oninput="updatePreview()">
                </div>
                <div class="wallet-actions">
                    <button type="submit" formaction="/generate">Add to Apple Wallet</button>
                    <button type="submit" class="google-wallet" formaction="/generate/google">Add to Google Wallet</button>
                </div>
            </form>
        </div>

        <div class="preview-container">
            <h2>Real-Time Live Device Preview</h2>
            <div class="preview-platform">
                <div class="preview-tabs" role="tablist" aria-label="Wallet platform">
                    <button type="button" class="preview-tab" id="applePlatformTab" role="tab" aria-selected="true" aria-controls="applePlatformPreview" onclick="showPlatform('apple')">Apple</button>
                    <button type="button" class="preview-tab" id="googlePlatformTab" role="tab" aria-selected="false" aria-controls="googlePlatformPreview" onclick="showPlatform('google')">Google</button>
                </div>
                <section id="applePlatformPreview" role="tabpanel" aria-labelledby="applePlatformTab">
                    <div class="preview-tabs" role="tablist" aria-label="Apple pass side">
                        <button type="button" class="preview-tab" id="frontTab" role="tab" aria-selected="true" aria-controls="frontPreview" onclick="showPreviewSide('front')">Front</button>
                        <button type="button" class="preview-tab" id="backTab" role="tab" aria-selected="false" aria-controls="backPreview" onclick="showPreviewSide('back')">Back</button>
                    </div>
                    <div class="card-mockup">
                        <section class="card-face" id="frontPreview" role="tabpanel" aria-labelledby="frontTab">
                    <div class="card-header">
                        <img class="apple-logo" src="/assets/logo@2x.png" alt="Rotary Club of Kirkland">
                    </div>
                    <div class="card-body">
                        <div>
                            <div class="field-label">Meeting Schedule</div>
                            <div class="field-value schedule-value"><span id="prevDinnerTime">Dinner at 5:45 pm</span>\n<span id="prevTime">Club Meetings at 6:15 pm</span></div>
                        </div>
                        <div>
                            <div class="field-label">Venue</div>
                            <div class="field-value member-value" id="prevVenue">Prosecco Restaurant &amp; Pizzeria</div>
                        </div>
                        <div>
                            <div class="field-label">Referring Member</div>
                            <div class="field-value member-value"><span id="prevMember">Jane Doe</span> - <span id="prevPhone">+1-425-555-0199</span></div>
                        </div>
                    </div>
                        </section>
                        <section class="card-face" id="backPreview" role="tabpanel" aria-labelledby="backTab" hidden>
                            <div class="back-fields">
                                <div class="back-field"><div class="field-label">Full Address</div><div class="field-value" id="prevBackAddress">Prosecco Restaurant &amp; Pizzeria\n7 Lakeshore Plaza\nKirkland, WA 98033\nUnited States of America</div></div>
                                <div class="back-field"><div class="field-label">Full Notes</div><div class="field-value" id="prevBackNotes">In-person the 1st and 3rd Monday and socials on the second Monday of the month. No meetings on federal holidays or the fourth and fifth Mondays.</div></div>
                                <div class="back-field"><div class="field-label">Add to Google Wallet</div><div class="field-value"><a href="#">Add to Google Wallet (Android)</a></div></div>
                                <div class="back-field"><div class="field-label">Share Card Link</div><div class="field-value"><a href="#">Share Card with Any Device</a></div></div>
                                <div class="back-field"><div class="field-label">Club Website</div><div class="field-value"><a id="prevWebsite" href="https://kirklandrotary.org">https://kirklandrotary.org</a></div></div>
                            </div>
                        </section>
                    </div>
                </section>
                <section id="googlePlatformPreview" role="tabpanel" aria-labelledby="googlePlatformTab" hidden>
                    <div class="google-device">
                        <div class="google-pass-card">
                            <div class="google-pass-main">
                                <div class="card-header">
                                    <div class="pass-logo" aria-label="Rotary Club of Kirkland">
                                        <span class="rotary-wordmark">Rotary</span>
                                        <img class="rotary-wheel" src="/assets/rotary-wheel.png" alt="">
                                        <span class="brand-divider" aria-hidden="true"></span>
                                        <span class="club-wordmark">Club of<br>Kirkland</span>
                                    </div>
                                </div>
                                <div class="google-header" id="prevGoogleHeader">Jane Doe</div>
                                <img class="google-qr" src="/preview/google-qr" alt="QR code to share with a potential member">
                                <div class="google-qr-caption">Scan to save on iPhone or Android</div>
                            </div>
                            <div class="google-details">
                                <div class="google-module"><div class="google-module-title">Meeting Schedule</div><div class="google-module-value"><span id="prevGoogleScheduleDinner">Dinner at 5:45 pm</span>\n<span id="prevGoogleScheduleTime">Club Meetings at 6:15 pm</span>\n\n<span id="prevGoogleAddress">Prosecco Restaurant &amp; Pizzeria\n7 Lakeshore Plaza\nKirkland, WA 98033\nUnited States of America</span></div></div>
                                <div class="google-module"><div class="google-module-title">Notes</div><div class="google-module-value" id="prevGoogleNotes"></div></div>
                                <div class="google-module"><div class="google-module-title">Referring Member</div><div class="google-module-value"><span id="prevGoogleMember">Jane Doe</span> - <span id="prevGooglePhone">+1-425-555-0199</span></div></div>
                                <div class="google-module"><div class="google-module-title">Share This Card</div><div class="google-module-value">Have any iPhone or Android user scan the QR code with their phone camera to save this card to Apple Wallet or Google Wallet.</div></div>
                                <div class="google-module"><div class="google-module-title">Links</div><div class="google-module-value"><a class="google-link" href="#">Add to Apple Wallet (iPhone)</a><a class="google-link" href="#">Share Card (iPhone &amp; Android)</a><a class="google-link" id="prevGoogleWebsite" href="https://kirklandrotary.org">Open Club Website</a></div></div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>

        <script>
            function updatePreview() {
                document.getElementById('prevDinnerTime').innerText = document.getElementById('inputDinnerTime').value;
                document.getElementById('prevTime').innerText = document.getElementById('inputTime').value;
                document.getElementById('prevVenue').innerText = document.getElementById('inputVenue').value;
                document.getElementById('prevBackAddress').innerText = [document.getElementById('inputVenue').value, document.getElementById('inputAddress').value].filter(Boolean).join('\\n');
                document.getElementById('prevBackNotes').innerText = document.getElementById('inputNotes').value;
                document.getElementById('prevMember').innerText = document.getElementById('inputMember').value;
                document.getElementById('prevPhone').innerText = document.getElementById('inputPhone').value;
                const website = document.getElementById('inputUrl').value;
                document.getElementById('prevWebsite').innerText = website;
                document.getElementById('prevWebsite').href = website;
                document.getElementById('prevGoogleHeader').innerText = document.getElementById('inputMember').value;
                document.getElementById('prevGoogleScheduleDinner').innerText = document.getElementById('inputDinnerTime').value;
                document.getElementById('prevGoogleScheduleTime').innerText = document.getElementById('inputTime').value;
                document.getElementById('prevGoogleAddress').innerText = [document.getElementById('inputVenue').value, document.getElementById('inputAddress').value].filter(Boolean).join('\\n');
                document.getElementById('prevGoogleNotes').innerText = document.getElementById('inputNotes').value;
                document.getElementById('prevGoogleMember').innerText = document.getElementById('inputMember').value;
                document.getElementById('prevGooglePhone').innerText = document.getElementById('inputPhone').value;
                document.getElementById('prevGoogleWebsite').href = website;
            }
            function showPlatform(platform) {
                const showApple = platform === 'apple';
                document.getElementById('applePlatformPreview').hidden = !showApple;
                document.getElementById('googlePlatformPreview').hidden = showApple;
                document.getElementById('applePlatformTab').setAttribute('aria-selected', showApple);
                document.getElementById('googlePlatformTab').setAttribute('aria-selected', !showApple);
            }
            function showPreviewSide(side) {
                const showFront = side === 'front';
                document.getElementById('frontPreview').hidden = !showFront;
                document.getElementById('backPreview').hidden = showFront;
                document.getElementById('frontTab').setAttribute('aria-selected', showFront);
                document.getElementById('backTab').setAttribute('aria-selected', !showFront);
            }
            // Fire initial render sequence
            updatePreview();
        </script>
    </body>
    </html>`;
}

module.exports = {
    renderDashboardPage
};
