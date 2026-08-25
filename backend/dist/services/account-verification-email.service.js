"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendAccountVerificationEmail = sendAccountVerificationEmail;
const resend_1 = require("resend");
let resendClient = null;
function escapeHtml(value) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
async function sendAccountVerificationEmail(input) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.ACCOUNT_EMAIL_FROM || process.env.FEEDBACK_FROM_EMAIL;
    if (!apiKey || !from)
        return { status: 'disabled', error: 'Account email is not configured' };
    if (!resendClient)
        resendClient = new resend_1.Resend(apiKey);
    const greeting = input.name?.trim() ? `Hi ${input.name.trim()},` : 'Hello,';
    const text = `${greeting}\n\nVerify your Marsfield email to activate free generation credits:\n${input.verificationUrl}\n\nThis link expires in ${input.expiresHours} hours.`;
    const html = `<div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#111827;max-width:560px"><h2>Verify your Marsfield email</h2><p>${escapeHtml(greeting)}</p><p>Verify your email to activate free generation credits.</p><p><a href="${escapeHtml(input.verificationUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#7c3aed;color:#fff;text-decoration:none">Verify email</a></p><p>This single-use link expires in ${input.expiresHours} hours.</p></div>`;
    try {
        const result = await resendClient.emails.send({ from, to: input.email, subject: 'Verify your Marsfield email', text, html });
        if (result.error)
            return { status: 'failed', error: result.error.message };
        return { status: 'sent' };
    }
    catch (error) {
        return { status: 'failed', error: error instanceof Error ? error.message : 'Unknown verification email failure' };
    }
}
