'use client';

import Link from 'next/link';
import { Suspense, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const result = await api.resetPassword(token, password);
      setStatus(result.message);
      setPassword('');
      setConfirmation('');
    } catch (err: any) {
      setError(err.message || 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  };

  return <main style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', padding: '2rem 1rem' }}>
    <form className="glass-card auth-modal" onSubmit={submit} style={{ width: 'min(440px, 100%)', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <span className="youtube-eyebrow">Account recovery</span>
      <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.5rem' }}>Choose a new password</h1>
      <p style={{ margin: 0, color: 'var(--foreground-muted)', fontSize: '0.88rem' }}>The recovery link is single-use and expires after 30 minutes.</p>
      {!token && <div style={{ color: '#ef4444' }}>This recovery link is missing its token. Request a new link.</div>}
      {error && <div style={{ color: '#ef4444' }}>{error}</div>}
      {status ? <>
        <div style={{ color: '#86efac' }}>{status}</div>
        <Link className="btn btn-primary" href="/">Return to Marsfield and sign in</Link>
      </> : <>
        <label className="form-label">New password
          <input className="form-input" type="password" minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        <label className="form-label">Confirm new password
          <input className="form-input" type="password" minLength={8} maxLength={128} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
        </label>
        <button className="btn btn-primary" disabled={loading || !token || password.length < 8 || confirmation.length < 8}>{loading ? 'Resetting…' : 'Reset password'}</button>
      </>}
    </form>
  </main>;
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<main style={{ minHeight: '70vh', display: 'grid', placeItems: 'center' }}>Loading recovery link…</main>}>
    <ResetPasswordForm />
  </Suspense>;
}
