const DISPOSABLE_DOMAINS = ['mailinator.com', 'airhemp.com', 'guerrillamail.com', 'tempmail.com', '10minutemail.com', 'yopmail.com'];

export function isDisposableEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1] || '';
  const blocked = [...DISPOSABLE_DOMAINS, ...(process.env.SIGNUP_BLOCKED_EMAIL_DOMAINS || '').split(',')];
  return blocked.some((entry) => {
    const value = entry.trim().toLowerCase();
    return value && (domain === value || domain.endsWith(`.${value}`));
  });
}
