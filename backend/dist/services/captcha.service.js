"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyRegistrationCaptcha = verifyRegistrationCaptcha;
const free_tier_risk_service_1 = require("./free-tier-risk.service");
async function verifyRegistrationCaptcha(token, req) {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Registration CAPTCHA is not configured');
        }
        return;
    }
    if (typeof token !== 'string' || !token.trim()) {
        throw new Error('Complete the CAPTCHA challenge');
    }
    const body = new URLSearchParams({ secret, response: token.trim() });
    const ip = (0, free_tier_risk_service_1.clientIp)(req);
    if (ip)
        body.set('remoteip', ip);
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok)
        throw new Error('CAPTCHA verification is temporarily unavailable');
    const result = await response.json();
    if (!result.success)
        throw new Error('CAPTCHA verification failed');
}
