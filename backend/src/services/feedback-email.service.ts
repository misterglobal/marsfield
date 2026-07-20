import { Resend } from 'resend';

export type FeedbackEmailInput = {
  reportId: string;
  type: string;
  message: string;
  pageUrl?: string | null;
  userAgent?: string | null;
  user: {
    id: string;
    email: string;
    plan?: string;
  };
  context?: unknown;
};

type FeedbackEmailResult =
  | { status: 'sent'; messageId?: string }
  | { status: 'disabled'; error: string }
  | { status: 'failed'; error: string };

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

function formatContext(context: unknown): string {
  if (!context || typeof context !== 'object') return '';
  try {
    return JSON.stringify(context, null, 2).slice(0, 8_000);
  } catch {
    return '';
  }
}

export async function sendFeedbackEmail(input: FeedbackEmailInput): Promise<FeedbackEmailResult> {
  const resend = getResendClient();
  const to = process.env.FEEDBACK_TO_EMAIL || 'marsfieldapp@gmail.com';
  const from = process.env.FEEDBACK_FROM_EMAIL;

  if (!resend || !from) {
    return {
      status: 'disabled',
      error: 'Feedback email is not configured. Set RESEND_API_KEY and FEEDBACK_FROM_EMAIL.',
    };
  }

  const context = formatContext(input.context);
  const subject = `[Marsfield Feedback] ${input.type}`;
  const text = [
    `Feedback ID: ${input.reportId}`,
    `Type: ${input.type}`,
    `User: ${input.user.email} (${input.user.id})`,
    `Plan: ${input.user.plan || 'unknown'}`,
    `Page: ${input.pageUrl || 'not provided'}`,
    `User agent: ${input.userAgent || 'not provided'}`,
    '',
    'Message:',
    input.message,
    context ? ['', 'Context:', context].join('\n') : '',
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#111827">
      <h2 style="margin:0 0 12px">Marsfield feedback: ${escapeHtml(input.type)}</h2>
      <p><strong>Feedback ID:</strong> ${escapeHtml(input.reportId)}</p>
      <p><strong>User:</strong> ${escapeHtml(input.user.email)} (${escapeHtml(input.user.id)})</p>
      <p><strong>Plan:</strong> ${escapeHtml(input.user.plan || 'unknown')}</p>
      <p><strong>Page:</strong> ${escapeHtml(input.pageUrl || 'not provided')}</p>
      <p><strong>User agent:</strong> ${escapeHtml(input.userAgent || 'not provided')}</p>
      <h3>Message</h3>
      <pre style="white-space:pre-wrap;background:#f3f4f6;border-radius:8px;padding:12px">${escapeHtml(input.message)}</pre>
      ${context ? `<h3>Context</h3><pre style="white-space:pre-wrap;background:#f3f4f6;border-radius:8px;padding:12px">${escapeHtml(context)}</pre>` : ''}
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from,
      to,
      subject,
      text,
      html,
      replyTo: input.user.email,
    });

    if (result.error) {
      return { status: 'failed', error: result.error.message };
    }

    return { status: 'sent', messageId: result.data?.id };
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown feedback email failure',
    };
  }
}
