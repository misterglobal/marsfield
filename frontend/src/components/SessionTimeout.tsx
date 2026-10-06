'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SESSION_ACTIVITY_KEY,
  SESSION_EXPIRED_EVENT,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_WARNING_AT_MS,
  recordSessionActivity,
} from '@/lib/session';

interface SessionTimeoutProps {
  onExpire: () => void;
}

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = ['keydown', 'pointerdown', 'scroll', 'touchstart'];
const ACTIVITY_WRITE_THROTTLE_MS = 5_000;
const TIMER_INTERVAL_MS = 1_000;

function storedActivityTime(now: number): number {
  const stored = Number(localStorage.getItem(SESSION_ACTIVITY_KEY));
  return Number.isFinite(stored) && stored > 0 && stored <= now ? stored : now;
}

export function SessionTimeout({ onExpire }: SessionTimeoutProps) {
  const [showWarning, setShowWarning] = useState(false);
  const lastActivityRef = useRef(0);
  const lastWriteRef = useRef(0);
  const expiredRef = useRef(false);
  const warningRef = useRef(false);
  const continueButtonRef = useRef<HTMLButtonElement>(null);

  const updateWarning = useCallback((visible: boolean) => {
    warningRef.current = visible;
    setShowWarning(visible);
  }, []);

  const continueSession = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    lastWriteRef.current = now;
    expiredRef.current = false;
    recordSessionActivity(now);
    updateWarning(false);
  }, [updateWarning]);

  useEffect(() => {
    const now = Date.now();
    lastActivityRef.current = storedActivityTime(now);
    lastWriteRef.current = lastActivityRef.current;
    recordSessionActivity(lastActivityRef.current);

    const registerActivity = () => {
      if (warningRef.current) return;
      const activityTime = Date.now();
      lastActivityRef.current = activityTime;
      expiredRef.current = false;
      updateWarning(false);
      if (activityTime - lastWriteRef.current >= ACTIVITY_WRITE_THROTTLE_MS) {
        lastWriteRef.current = activityTime;
        recordSessionActivity(activityTime);
      }
    };

    const synchronizeActivity = (event: StorageEvent) => {
      if (event.key !== SESSION_ACTIVITY_KEY || !event.newValue) return;
      const activityTime = Number(event.newValue);
      if (!Number.isFinite(activityTime) || activityTime <= 0) return;
      lastActivityRef.current = activityTime;
      lastWriteRef.current = activityTime;
      expiredRef.current = false;
      updateWarning(false);
    };

    const expire = () => {
      if (expiredRef.current) return;
      expiredRef.current = true;
      updateWarning(false);
      onExpire();
    };

    const checkIdleTime = () => {
      const idleTime = Date.now() - lastActivityRef.current;
      if (idleTime >= SESSION_IDLE_TIMEOUT_MS) {
        expire();
        return;
      }
      updateWarning(idleTime >= SESSION_WARNING_AT_MS);
    };

    const handleSessionExpired = () => expire();
    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, registerActivity, { passive: true, capture: eventName === 'scroll' });
    }
    window.addEventListener('storage', synchronizeActivity);
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    const timer = window.setInterval(checkIdleTime, TIMER_INTERVAL_MS);
    checkIdleTime();

    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, registerActivity, { capture: eventName === 'scroll' });
      }
      window.removeEventListener('storage', synchronizeActivity);
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
      window.clearInterval(timer);
    };
  }, [onExpire, updateWarning]);

  if (!showWarning) return null;

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        display: 'grid',
        placeItems: 'center',
        padding: '1rem',
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-timeout-title"
      aria-describedby="session-timeout-description"
      className="glass-card auth-modal"
      style={{ width: 'min(420px, 100%)', padding: '2rem' }}
      onKeyDown={(event) => {
        if (event.key === 'Tab') {
          event.preventDefault();
          continueButtonRef.current?.focus();
        }
      }}
      >
        <h2 id="session-timeout-title" style={{ margin: 0 }}>Your session is about to expire</h2>
        <p id="session-timeout-description" style={{ color: 'var(--foreground-muted)', lineHeight: 1.6 }}>
          You have been inactive. MarsField will sign you out in two minutes to protect your account.
        </p>
        <button ref={continueButtonRef} type="button" className="btn btn-primary" onClick={continueSession} autoFocus>
          Continue session
        </button>
      </section>
    </div>
  );
}
