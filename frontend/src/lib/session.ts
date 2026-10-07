export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const SESSION_WARNING_LEAD_MS = 2 * 60 * 1000;
export const SESSION_WARNING_AT_MS = SESSION_IDLE_TIMEOUT_MS - SESSION_WARNING_LEAD_MS;
export const SESSION_ACTIVITY_KEY = 'marsfield_session_last_activity';
export const SESSION_END_REASON_KEY = 'marsfield_session_end_reason';
export const SESSION_EXPIRED_EVENT = 'marsfield:session-expired';
export const SESSION_EXPIRED_MESSAGE = 'Your session expired. Please sign in again.';

export function dispatchSessionExpired(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

export function recordSessionActivity(now = Date.now()): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSION_ACTIVITY_KEY, String(now));
}
