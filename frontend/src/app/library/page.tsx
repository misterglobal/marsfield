'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '../layout';

interface AssetData {
  id: string;
  url: string;
  type: string;
  thumbnailUrl: string | null;
  isFavorite: boolean;
  createdAt: string;
  prediction: {
    prompt: string | null;
    model: string;
    workflow: string;
  } | null;
}

export default function LibraryPage() {
  const { token } = useAuth();
  const [filter, setFilter] = useState<'all' | 'video' | 'image'>('all');
  const [search, setSearch] = useState('');
  const [assets, setAssets] = useState<AssetData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchAssets = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.getAssets();
      setAssets(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const toggleFavorite = async (id: string) => {
    try {
      await api.toggleFavorite(id);
      setAssets((prev) =>
        prev.map((asset) =>
          asset.id === id ? { ...asset, isFavorite: !asset.isFavorite } : asset
        )
      );
    } catch (err: any) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  const filteredAssets = assets.filter((asset) => {
    const matchesFilter = filter === 'all' || asset.type === filter;
    const promptText = asset.prediction?.prompt || '';
    const matchesSearch = promptText.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getModelName = (model: string) => {
    const names: Record<string, string> = {
      'alibaba/happyhorse-1.1': 'Happy Horse 1.1',
      'openai/sora-2': 'Sora 2',
      'kuaishou/kling-v2-1': 'Kling 2.1',
      'bytedance/wan-2.5-fast': 'Wan 2.5 Fast',
      'black-forest-labs/flux-schnell': 'Flux Schnell',
      'stability-ai/stable-diffusion-3': 'SD 3',
    };
    return names[model] || model;
  };

  const gradients = [
    'linear-gradient(135deg, #311042, #1e1b4b)',
    'linear-gradient(135deg, #1e293b, #0f172a)',
    'linear-gradient(135deg, #064e3b, #022c22)',
    'linear-gradient(135deg, #78350f, #451a03)',
    'linear-gradient(135deg, #1e1b4b, #312e81)',
  ];

  if (!token) {
    return (
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5rem 2rem', gap: '1rem', textAlign: 'center' }}>
        <span style={{ fontSize: '3rem' }}>🔒</span>
        <h3 style={{ margin: 0 }}>Sign in to access your library</h3>
        <p style={{ color: 'var(--foreground-muted)', maxWidth: '300px' }}>
          Use the Sign In button in the sidebar to authenticate and view your generated assets.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      {/* Search & Filter Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {['all', 'video', 'image'].map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type as 'all' | 'video' | 'image')}
              className={`btn ${filter === type ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem', textTransform: 'capitalize' }}
            >
              {type === 'all' ? 'All' : `${type}s`}
            </button>
          ))}
          <button onClick={fetchAssets} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
            🔄 Refresh
          </button>
        </div>

        <div style={{ position: 'relative', width: '300px' }}>
          <input
            type="text"
            placeholder="Search prompts..."
            className="form-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '2.5rem' }}
          />
          <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--foreground-muted)' }}>
            🔍
          </span>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', color: '#ef4444' }}>
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', gap: '1rem' }}>
          <span style={{ display: 'inline-block', width: '16px', height: '16px', border: '3px solid var(--primary)', borderRadius: '50%', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }}></span>
          <span>Loading assets...</span>
        </div>
      )}

      {/* Assets Grid */}
      {!loading && filteredAssets.length > 0 && (
        <div className="asset-grid">
          {filteredAssets.map((asset, index) => (
            <article key={asset.id} className="asset-card">
              <div className="asset-preview" style={{ background: gradients[index % gradients.length] }}>
                <span className="asset-tag" style={{ textTransform: 'capitalize' }}>
                  {asset.type === 'video' ? '🎬 Video' : '🖼️ Image'}
                </span>
                <button
                  onClick={() => toggleFavorite(asset.id)}
                  style={{
                    position: 'absolute', top: '10px', right: '10px',
                    background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%',
                    width: '32px', height: '32px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1rem', color: asset.isFavorite ? '#f43f5e' : '#fff',
                    transition: 'transform 0.1s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  {asset.isFavorite ? '❤️' : '🤍'}
                </button>
              </div>

              <div className="asset-meta">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 className="asset-title" title={asset.prediction?.prompt || 'Untitled'}>
                    {(asset.prediction?.prompt || 'Untitled').substring(0, 40)}
                  </h3>
                  <span className="badge badge-purple">
                    {asset.prediction ? getModelName(asset.prediction.model) : 'Unknown'}
                  </span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--foreground-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', height: '2.4rem', lineHeight: '1.2rem', margin: '0.25rem 0' }}>
                  {asset.prediction?.prompt || ''}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', borderTop: '1px solid var(--panel-border)', paddingTop: '0.75rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)' }}>
                    {new Date(asset.createdAt).toLocaleDateString()}
                  </span>
                  <a
                    href={asset.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', textDecoration: 'none' }}
                  >
                    💾 Download
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredAssets.length === 0 && !error && (
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5rem 2rem', gap: '1rem', textAlign: 'center' }}>
          <span style={{ fontSize: '3rem' }}>📂</span>
          <h3 style={{ margin: 0 }}>No generations found</h3>
          <p style={{ color: 'var(--foreground-muted)', maxWidth: '300px' }}>
            Head to the Studio to generate your first asset, then come back here to browse your library!
          </p>
        </div>
      )}

      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
