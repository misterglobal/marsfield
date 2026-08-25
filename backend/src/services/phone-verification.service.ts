function twilioConfig(): { serviceSid: string; accountSid: string; authToken: string } {
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!serviceSid || !accountSid || !authToken) throw new Error('Phone verification is not configured');
  return { serviceSid, accountSid, authToken };
}

export function normalizePhone(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Phone number is required');
  const normalized = value.trim().replace(/[\s().-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new Error('Use an international phone number such as +14165551234');
  return normalized;
}

async function verifyRequest(path: string, params: Record<string, string>): Promise<any> {
  const config = twilioConfig();
  const response = await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(config.serviceSid)}/${path}`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'Phone verification provider rejected the request');
  return result;
}

export async function startPhoneVerification(phone: string): Promise<void> {
  await verifyRequest('Verifications', { To: phone, Channel: 'sms' });
}

export async function checkPhoneVerification(phone: string, code: unknown): Promise<boolean> {
  if (typeof code !== 'string' || !/^\d{4,10}$/.test(code.trim())) throw new Error('Enter the verification code');
  const result = await verifyRequest('VerificationCheck', { To: phone, Code: code.trim() });
  return result.status === 'approved';
}
