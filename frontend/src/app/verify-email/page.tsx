'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function VerifyEmailPage() {
  const [status, setStatus] = useState('Verifying your email…');
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token') || '';
    if (!token) {
      setStatus('This verification link is missing its token.');
      return;
    }
    void api.verifyEmail(token)
      .then((result) => { setVerified(true); setStatus(result.message); })
      .catch((error) => setStatus(error.message || 'Email verification failed.'));
  }, []);

  return (
    <div className="glass-card" style={{ width: 'min(480px, 100%)', margin: '4rem auto', padding: '2rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '1.5rem' }}>Email verification</h1>
      <p style={{ color: 'var(--foreground-muted)' }}>{status}</p>
      {verified && <Link className="btn btn-primary" href="/">Continue to sign in</Link>}
    </div>
  );
}
