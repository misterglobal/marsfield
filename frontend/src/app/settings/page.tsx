'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '../layout';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  created_at: string;
  last_used_at: string | null;
  scopes: string[];
  expires_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  status: 'active' | 'expired' | 'revoked';
}

const API_SCOPES = [
  ['generation:write', 'Submit generations'],
  ['predictions:read', 'Read generation status'],
  ['uploads:write', 'Upload reference media'],
  ['assets:read', 'Read asset library'],
  ['assets:write', 'Update assets'],
  ['projects:read', 'Read projects'],
  ['projects:write', 'Create projects and scenes'],
] as const;

interface UsageSummary {
  plan: string;
  credits_used: number;
  credits_limit: number;
  credits_remaining: number;
  storage_usage_bytes?: number;
  storage_limit_bytes?: string;
  storage_remaining_bytes?: string;
  project_count: number;
  asset_count: number;
  recent_usage: Array<{
    id: string;
    event_type: string;
    credits: number;
    created_at: string;
    prediction: {
      workflow: string;
      model: string;
      prompt: string | null;
      variationCount: number;
    } | null;
  }>;
}

interface PlanSummary {
  tier: string;
  name: string;
  price_usd: number;
  credits_limit: number;
  storage_limit_bytes: string;
  retention_days?: number;
  freemius_configured: boolean;
}

export default function SettingsPage() {
  const { token } = useAuth();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(['generation:write', 'predictions:read']);
  const [newKeyExpiry, setNewKeyExpiry] = useState('90');
  const [newlyCreatedKey, setNewlyCreatedKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkoutTier, setCheckoutTier] = useState('');

  const loadSettings = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const [usageData, keysData, plansData] = await Promise.all([
        api.getUsage(),
        api.getApiKeys(),
        api.getPlans(),
      ]);
      setUsage(usageData);
      setApiKeys(keysData);
      setPlans(plansData);
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleGenerateKey = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newKeyName.trim()) return;
    setError('');
    setNewlyCreatedKey('');

    try {
      const created = await api.createApiKey({
        name: newKeyName.trim(),
        scopes: newKeyScopes,
        expires_in_days: newKeyExpiry === 'never' ? null : Number(newKeyExpiry),
      });
      setNewlyCreatedKey(created.key);
      setNewKeyName('');
      await loadSettings();
    } catch (err: any) {
      setError(err.message || 'Failed to create API key');
    }
  };

  const handleRevokeKey = async (id: string) => {
    if (!confirm('Revoke this API key immediately? Its audit record will be retained.')) return;
    setError('');
    try {
      await api.deleteApiKey(id);
      await loadSettings();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke API key');
    }
  };

  const handleCheckout = async (tier: string) => {
    setError('');
    setCheckoutTier(tier);
    try {
      const checkout = await api.createCheckout({ tier });
      window.location.href = checkout.checkout_url;
    } catch (err: any) {
      setError(err.message || 'Failed to start checkout');
      setCheckoutTier('');
    }
  };

  if (!token) {
    return (
      <div className="glass-card" style={{ padding: '4rem', textAlign: 'center' }}>
        Sign in to manage account settings.
      </div>
    );
  }

  const usedPercent = usage ? Math.min(100, Math.round((usage.credits_used / Math.max(1, usage.credits_limit)) * 100)) : 0;
  const storageLimitBytes = Number(usage?.storage_limit_bytes || 0);
  const storageUsedBytes = usage?.storage_usage_bytes || 0;
  const storageUsedPercent = storageLimitBytes ? Math.min(100, Math.round((storageUsedBytes / storageLimitBytes) * 100)) : 0;
  const formatBytes = (value: number | string | undefined) => {
    const bytes = typeof value === 'string' ? Number(value) : value || 0;
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  };

  return (
    <div className="settings-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '2rem' }}>
      <div className="settings-main" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', color: '#ef4444' }}>
            {error}
          </div>
        )}

        {newlyCreatedKey && (
          <section className="glass-card" style={{ borderLeft: '4px solid var(--accent)' }}>
            <h3 style={{ marginTop: 0 }}>Copy your new API key</h3>
            <p style={{ color: 'var(--foreground-muted)', fontSize: '0.85rem' }}>
              This is shown once. Store it somewhere safe.
            </p>
            <code style={{ display: 'block', padding: '1rem', borderRadius: '10px', background: 'rgba(0,0,0,0.35)', color: 'var(--primary)', wordBreak: 'break-all' }}>
              {newlyCreatedKey}
            </code>
          </section>
        )}

        <section className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>🔑 API Credentials</h3>
          <p style={{ color: 'var(--foreground-muted)', fontSize: '0.85rem' }}>
            Create access tokens for scripts and automation. Full keys are only shown once.
          </p>

          <form className="api-key-form" onSubmit={handleGenerateKey} style={{ display: 'grid', gap: '0.75rem', marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="e.g. Production Script Token"
                className="form-input"
                value={newKeyName}
                onChange={(event) => setNewKeyName(event.target.value)}
                style={{ flex: '1 1 240px' }}
              />
              <select className="form-input" value={newKeyExpiry} onChange={(event) => setNewKeyExpiry(event.target.value)} aria-label="API key expiry">
                <option value="30">Expires in 30 days</option>
                <option value="90">Expires in 90 days</option>
                <option value="365">Expires in 1 year</option>
                <option value="never">Never expires</option>
              </select>
              <button type="submit" className="btn btn-primary" disabled={!newKeyScopes.length} style={{ whiteSpace: 'nowrap' }}>
                Create Key
              </button>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem 1rem', flexWrap: 'wrap' }}>
              {API_SCOPES.map(([scope, label]) => (
                <label key={scope} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.8rem', color: 'var(--foreground-muted)' }}>
                  <input
                    type="checkbox"
                    checked={newKeyScopes.includes(scope)}
                    onChange={(event) => setNewKeyScopes((current) => event.target.checked ? [...current, scope] : current.filter((item) => item !== scope))}
                  />
                  {label}
                </label>
              ))}
            </div>
          </form>

          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className="api-key-row"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 1rem',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--panel-border)',
                  borderRadius: '10px',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <h4 style={{ fontSize: '0.9rem', margin: 0 }}>{key.name}</h4>
                  <code style={{ fontSize: '0.8rem', color: 'var(--primary)', marginTop: '0.2rem', display: 'block' }}>{key.key}</code>
                  <span style={{ display: 'block', color: 'var(--foreground-muted)', fontSize: '0.72rem', marginTop: '0.25rem' }}>
                    {key.scopes.join(', ')}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)' }}>
                    {key.status === 'active'
                      ? key.expires_at ? `Expires ${new Date(key.expires_at).toLocaleDateString()}` : 'Never expires'
                      : key.status === 'expired' ? 'Expired' : `Revoked ${key.revoked_at ? new Date(key.revoked_at).toLocaleDateString() : ''}`}
                  </span>
                  {key.status === 'active' && (
                    <button
                      onClick={() => void handleRevokeKey(key.id)}
                      className="btn"
                      style={{ padding: '0.35rem 0.6rem', background: 'rgba(239, 68, 68,0.1)', color: '#ef4444', borderRadius: '6px', fontSize: '0.75rem' }}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!loading && apiKeys.length === 0 && (
              <span style={{ color: 'var(--foreground-muted)', fontSize: '0.85rem' }}>No API keys yet.</span>
            )}
          </div>
        </section>

        <section className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Subscription Tiers</h3>
          <p style={{ color: 'var(--foreground-muted)', fontSize: '0.85rem', margin: 0 }}>
            Plans are handled through Freemius. Marsfield grants monthly credits and storage after the signed Freemius webhook confirms the purchase.
          </p>
          <div className="plan-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem' }}>
            {plans.map((plan) => {
              const isCurrent = usage?.plan?.toLowerCase() === plan.tier;
              const isFree = plan.tier === 'free';
              return (
                <div key={plan.tier} style={{ padding: '1rem', borderRadius: '12px', border: isCurrent ? '1px solid var(--primary)' : '1px solid var(--panel-border)', background: isCurrent ? 'rgba(139, 92, 246, 0.08)' : 'rgba(255,255,255,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                    <strong>{plan.name}</strong>
                    <span style={{ color: 'var(--primary)', fontWeight: 700 }}>${plan.price_usd}</span>
                  </div>
                  <p style={{ color: 'var(--foreground-muted)', fontSize: '0.8rem', margin: '0.5rem 0' }}>
                    {plan.credits_limit.toLocaleString()} credits · {formatBytes(plan.storage_limit_bytes)}
                    {plan.retention_days ? ` · ${plan.retention_days}-day retention` : ''}
                  </p>
                  {!isFree && (
                    <button
                      className="btn btn-primary"
                      disabled={checkoutTier === plan.tier || isCurrent || !plan.freemius_configured}
                      onClick={() => void handleCheckout(plan.tier)}
                      style={{ width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.8rem' }}
                    >
                      {isCurrent ? 'Current Plan' : checkoutTier === plan.tier ? 'Opening…' : plan.freemius_configured ? 'Subscribe' : 'Configure Plan ID'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Usage History</h3>
          {usage?.recent_usage.length ? usage.recent_usage.map((event) => (
            <div key={event.id} className="usage-row" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.85rem 0', borderBottom: '1px solid var(--panel-border)' }}>
              <div>
                <strong style={{ textTransform: 'capitalize' }}>{event.event_type}</strong>
                <p style={{ margin: '0.2rem 0 0', color: 'var(--foreground-muted)', fontSize: '0.82rem' }}>
                  {event.prediction?.workflow || 'Account activity'} · {event.prediction?.model || 'Marsfield'}
                  {event.prediction?.variationCount && event.prediction.variationCount > 1 ? ` · ${event.prediction.variationCount} variations` : ''}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong>{event.credits} credits</strong>
                <span style={{ display: 'block', color: 'var(--foreground-muted)', fontSize: '0.75rem' }}>
                  {new Date(event.created_at).toLocaleString()}
                </span>
              </div>
            </div>
          )) : (
            <span style={{ color: 'var(--foreground-muted)', fontSize: '0.85rem' }}>No usage events yet.</span>
          )}
        </section>
      </div>

      <aside className="glass-card account-summary" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: 'fit-content' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.75rem' }}>
          💎 Account Plan
        </h3>

        <div style={{ padding: '1rem', background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.15)', borderRadius: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#c084fc', textTransform: 'capitalize' }}>
            Current Tier: {usage?.plan || 'Free'}
          </h4>
          <p style={{ fontSize: '0.8rem', color: 'var(--foreground-muted)', marginTop: '0.25rem' }}>
            Credits are charged by model, workflow, and variation count.
          </p>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--foreground-muted)', marginBottom: '0.5rem' }}>
            <span>Credits Remaining</span>
            <strong>{usage?.credits_remaining ?? 0} / {usage?.credits_limit ?? 0}</strong>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${100 - usedPercent}%`, height: '100%', background: 'var(--accent-gradient)', borderRadius: '3px' }}></div>
          </div>
          <p style={{ color: 'var(--foreground-muted)', fontSize: '0.75rem' }}>
            Used {usage?.credits_used ?? 0} credits.
          </p>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--foreground-muted)', marginBottom: '0.5rem' }}>
            <span>Storage</span>
            <strong>{formatBytes(storageUsedBytes)} / {formatBytes(usage?.storage_limit_bytes)}</strong>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${storageUsedPercent}%`, height: '100%', background: 'var(--accent-gradient)', borderRadius: '3px' }}></div>
          </div>
          <p style={{ color: 'var(--foreground-muted)', fontSize: '0.75rem' }}>
            Generated assets are stored durably in R2.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div style={{ padding: '0.85rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
            <strong>{usage?.project_count ?? 0}</strong>
            <span style={{ display: 'block', color: 'var(--foreground-muted)', fontSize: '0.75rem' }}>Projects</span>
          </div>
          <div style={{ padding: '0.85rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
            <strong>{usage?.asset_count ?? 0}</strong>
            <span style={{ display: 'block', color: 'var(--foreground-muted)', fontSize: '0.75rem' }}>Assets</span>
          </div>
        </div>

        <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          View Plans
        </button>
      </aside>
    </div>
  );
}
