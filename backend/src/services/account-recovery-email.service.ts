import { Resend } from 'resend';

let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!resendClient) resendClient = new Resend(apiKey);
  return resendClient;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function sendAccountRecoveryEmail(input: {
  email: string;
  name?: string | null;
  resetUrl: string;
  expiresMinutes: number;
}): Promise<{ status: 'sent' | 'disabled' | 'failed'; error?: string }> {
  const resend = getResendClient();
  const from = process.env.ACCOUNT_EMAIL_FROM || process.env.FEEDBACK_FROM_EMAIL;
  if (!resend || !from) {
    return { status: 'disabled', error: 'Account email is not configured' };
  }

  const greeting = input.name?.trim() ? `Hi ${input.name.trim()},` : 'Hello,';
  const text = [
    greeting,
    '',
    'We received a request to reset your Marsfield password.',
    `Open this secure link within ${input.expiresMinutes} minutes:`,
    input.resetUrl,
    '',
    'If you did not request this, you can ignore this email. Your password has not changed.',
  ].join('\n');
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#111827;max-width:560px">
      <h2>Reset your Marsfield password</h2>
      <p>${escapeHtml(greeting)}</p>
      <p>We received a request to reset your Marsfield password.</p>
      <p><a href="${escapeHtml(input.resetUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#7c3aed;color:#fff;text-decoration:none">Reset password</a></p>
      <p>This single-use link expires in ${input.expiresMinutes} minutes.</p>
      <p>If you did not request this, ignore this email. Your password has not changed.</p>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from,
      to: input.email,
      subject: 'Reset your Marsfield password',
      text,
      html,
    });
    if (result.error) return { status: 'failed', error: result.error.message };
    return { status: 'sent' };
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : 'Unknown account email failure' };
  }
}
