'use client';

import { useState } from 'react';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
}

export default function SettingsPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([
    { id: '1', name: 'Agent Production Key', key: 'mf_live_8f0a2...d43', createdAt: '2026-06-20' },
    { id: '2', name: 'Local Test Dev', key: 'mf_test_3a8b1...e90', createdAt: '2026-06-24' }
  ]);
  const [newKeyName, setNewKeyName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('https://api.my-studio.com/v1/webhook');
  const [webhookEvents, setWebhookEvents] = useState({
    completed: true,
    failed: true,
    processing: false
  });

  const handleGenerateKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName) return;
    
    const randomHex = Array.from({ length: 16 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
    
    const newKey: ApiKey = {
      id: String(apiKeys.length + 1),
      name: newKeyName,
      key: `mf_live_${randomHex}...${randomHex.substring(12)}`,
      createdAt: new Date().toISOString().split('T')[0]
    };

    setApiKeys([...apiKeys, newKey]);
    setNewKeyName('');
    alert("New API Key generated successfully!");
  };

  const handleRevokeKey = (id: string) => {
    if (confirm("Are you sure you want to revoke this API key? This action is permanent.")) {
      setApiKeys(apiKeys.filter(k => k.id !== id));
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '2rem' }}>
      
      {/* Settings Options (Left Column) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* API Keys Configuration */}
        <section className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>🔑 API Credentials</h3>
          <p style={{ color: 'var(--foreground-muted)', fontSize: '0.85rem' }}>
            Generate access tokens to programmatically create generations using Marsfield models from external scripts or AI agents.
          </p>

          <form onSubmit={handleGenerateKey} style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <input
              type="text"
              placeholder="e.g. Production Script Token"
              className="form-input"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
              Create Key
            </button>
          </form>

          {/* List of Keys */}
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {apiKeys.map((key) => (
              <div 
                key={key.id} 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  padding: '0.75rem 1rem', 
                  background: 'rgba(255, 255, 255, 0.02)', 
                  border: '1px solid var(--panel-border)', 
                  borderRadius: '10px' 
                }}
              >
                <div>
                  <h4 style={{ fontSize: '0.9rem', margin: 0 }}>{key.name}</h4>
                  <code style={{ fontSize: '0.8rem', color: 'var(--primary)', marginTop: '0.2rem', display: 'block' }}>{key.key}</code>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)' }}>Created {key.createdAt}</span>
                  <button 
                    onClick={() => handleRevokeKey(key.id)}
                    className="btn" 
                    style={{ 
                      padding: '0.35rem 0.6rem', 
                      background: 'rgba(239, 68, 68, 0.1)', 
                      color: '#ef4444', 
                      borderRadius: '6px',
                      fontSize: '0.75rem' 
                    }}
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Webhooks Section */}
        <section className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>⚡ Webhook Subscriptions</h3>
          <p style={{ color: 'var(--foreground-muted)', fontSize: '0.85rem' }}>
            Receive real-time callback payloads on your servers when long-running Replicate predictions complete or fail.
          </p>

          <div>
            <label className="form-label">Endpoint URL</label>
            <input
              type="url"
              className="form-input"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
          </div>

          <div>
            <label className="form-label" style={{ marginBottom: '0.75rem' }}>Events Filter</label>
            <div style={{ display: 'flex', gap: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={webhookEvents.completed}
                  onChange={(e) => setWebhookEvents({ ...webhookEvents, completed: e.target.checked })}
                  style={{ accentColor: 'var(--primary)' }}
                />
                Completed
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={webhookEvents.failed}
                  onChange={(e) => setWebhookEvents({ ...webhookEvents, failed: e.target.checked })}
                  style={{ accentColor: 'var(--primary)' }}
                />
                Failed
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={webhookEvents.processing}
                  onChange={(e) => setWebhookEvents({ ...webhookEvents, processing: e.target.checked })}
                  style={{ accentColor: 'var(--primary)' }}
                />
                Processing
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => alert("Webhook configuration updated!")}>
              Save Webhook Configuration
            </button>
          </div>
        </section>

      </div>

      {/* Credit & Plan Panel (Right Column) */}
      <aside className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: 'fit-content' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.75rem' }}>
          💎 Account Plan
        </h3>

        <div style={{ padding: '1rem', background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.15)', borderRadius: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#c084fc' }}>Current Tier: Free Plan</h4>
          <p style={{ fontSize: '0.8rem', color: 'var(--foreground-muted)', marginTop: '0.25rem' }}>
            Limited to 10 standard generation credits per month.
          </p>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--foreground-muted)', marginBottom: '0.5rem' }}>
            <span>Credits Remaining</span>
            <strong>8 / 10</strong>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: '80%', height: '100%', background: 'var(--accent-gradient)', borderRadius: '3px' }}></div>
          </div>
        </div>

        <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => alert("Redirecting to pricing checkout...")}>
          Upgrade to Pro ($29/mo)
        </button>
      </aside>

    </div>
  );
}
