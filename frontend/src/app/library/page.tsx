'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '../layout';

interface AssetData {
  id: string;
  storageObjectId: string | null;
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

interface PackagingIdeas {
  hooks: string[];
  titleOverlays: string[];
  thumbnailPrompts: string[];
}

interface PackagingState {
  ideas?: PackagingIdeas;
  title: string;
  subtitle: string;
  loading?: string;
  message?: string;
  error?: string;
}

function actionHref(assetId: string, workflow: string, model?: string): string {
  const query = new URLSearchParams({ workflow, asset_id: assetId });
  if (model) query.set('model', model);
  return `/?${query.toString()}`;
}

function assetActions(asset: AssetData) {
  if (!asset.storageObjectId) return [];
  if (asset.type === 'image') return [
    { label: 'Save to kit', href: `/kits?asset_id=${encodeURIComponent(asset.id)}` },
    { label: 'Animate', href: actionHref(asset.id, 'image-to-video') },
    { label: 'Upscale', href: actionHref(asset.id, 'image-upscale') },
    { label: 'Kling reference', href: actionHref(asset.id, 'video-edit') },
    { label: 'Make variation', href: actionHref(asset.id, 'text-to-image', 'google/nano-banana-2') },
  ];
  if (asset.type === 'video') return [
    { label: 'Save to kit', href: `/kits?asset_id=${encodeURIComponent(asset.id)}` },
    { label: 'Resize for social', href: actionHref(asset.id, 'social-resize') },
    { label: 'Add captions', href: actionHref(asset.id, 'video-caption') },
    { label: 'Kling edit', href: actionHref(asset.id, 'video-edit') },
    { label: 'Enhance', href: actionHref(asset.id, 'video-enhance') },
    { label: 'Extend', href: actionHref(asset.id, 'video-enhance', 'xai/grok-imagine-video-extension') },
  ];
  if (asset.type === 'audio') return [
    { label: 'Save to kit', href: `/kits?asset_id=${encodeURIComponent(asset.id)}` },
    { label: 'Use for lip sync', href: actionHref(asset.id, 'lip-sync') },
  ];
  return [];
}

export default function LibraryPage() {
  const { token } = useAuth();
  const [filter, setFilter] = useState<'all' | 'video' | 'image' | 'audio'>('all');
  const [search, setSearch] = useState('');
  const [assets, setAssets] = useState<AssetData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [packaging, setPackaging] = useState<Record<string, PackagingState>>({});

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

  const updatePackaging = (assetId: string, patch: Partial<PackagingState>) => {
    const defaults: PackagingState = { title: '', subtitle: '' };
    setPackaging((current) => ({
      ...current,
      [assetId]: {
        ...defaults,
        ...(current[assetId] || {}),
        ...patch,
      },
    }));
  };

  const waitForPrediction = async (predictionId: string) => {
    for (let attempt = 0; attempt < 120; attempt++) {
      const status = await api.getPrediction(predictionId);
      if (status.status === 'succeeded') return status;
      if (status.status === 'failed') throw new Error(status.error || 'Local processing failed');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error('Processing is taking longer than expected. Check the library shortly.');
  };

  const generatePackagingIdeas = async (asset: AssetData) => {
    updatePackaging(asset.id, { loading: 'ideas', error: '', message: '' });
    try {
      const ideas = await api.getVideoPackagingIdeas(asset.id, { context: asset.prediction?.prompt || '' });
      updatePackaging(asset.id, {
        ideas,
        title: ideas.titleOverlays?.[0] || '',
        subtitle: ideas.hooks?.[0] || '',
        loading: '',
        message: 'Hook and overlay ideas ready.',
      });
    } catch (err: any) {
      updatePackaging(asset.id, { loading: '', error: err.message || 'Failed generating ideas' });
    }
  };

  const saveThumbnailStills = async (asset: AssetData) => {
    updatePackaging(asset.id, { loading: 'thumbnails', error: '', message: '' });
    try {
      const result = await api.createVideoThumbnailStills(asset.id);
      const predictions = Array.isArray(result.predictions) ? result.predictions : [];
      await Promise.all(predictions.map((prediction: any) => waitForPrediction(prediction.id)));
      updatePackaging(asset.id, {
        loading: '',
        message: `Saved ${predictions.length || 0} thumbnail stills to your library.`,
      });
      await fetchAssets();
    } catch (err: any) {
      updatePackaging(asset.id, { loading: '', error: err.message || 'Failed saving thumbnail stills' });
    }
  };

  const createTitleOverlay = async (asset: AssetData) => {
    const current = packaging[asset.id];
    if (!current?.title.trim()) {
      updatePackaging(asset.id, { error: 'Choose or enter a title first.' });
      return;
    }
    updatePackaging(asset.id, { loading: 'overlay', error: '', message: '' });
    try {
      const result = await api.createTitleOverlay(asset.id, {
        title: current.title,
        subtitle: current.subtitle,
      });
      if (result.id) await waitForPrediction(result.id);
      updatePackaging(asset.id, { loading: '', message: 'Title-overlay video saved to your library.' });
      await fetchAssets();
    } catch (err: any) {
      updatePackaging(asset.id, { loading: '', error: err.message || 'Failed creating title overlay' });
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
      'xai/grok-imagine-video-extension': 'Grok Video Extension',
      'topazlabs/video-upscale': 'Topaz Video Upscale',
      'philz1337x/crystal-video-upscaler': 'Crystal Video Upscaler',
      'prunaai/p-image-upscale': 'P-Image Upscale',
      'google/upscaler': 'Google Upscaler',
      'philz1337x/clarity-pro-upscaler': 'Clarity Pro Upscaler',
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
      <div className="library-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {['all', 'video', 'image', 'audio'].map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type as 'all' | 'video' | 'image' | 'audio')}
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

        <div className="library-search" style={{ position: 'relative', width: '300px' }}>
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
                {asset.thumbnailUrl && (
                  <img src={asset.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
                {!asset.thumbnailUrl && asset.type === 'audio' && <span style={{ fontSize: '3rem' }}>🎵</span>}
                {!asset.thumbnailUrl && asset.type === 'video' && <span style={{ fontSize: '3rem' }}>🎬</span>}
                {!asset.thumbnailUrl && asset.type === 'document' && <span style={{ fontSize: '3rem' }}>📄</span>}
                <span className="asset-tag" style={{ textTransform: 'capitalize' }}>
                  {asset.type === 'video' ? '🎬 Video' : asset.type === 'audio' ? '🎵 Audio' : asset.type === 'document' ? '📄 Transcript' : '🖼️ Image'}
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
                  <h3 className="asset-title" title={asset.prediction?.prompt || `Uploaded ${asset.type}`}>
                    {(asset.prediction?.prompt || `Uploaded ${asset.type}`).substring(0, 40)}
                  </h3>
                  <span className="badge badge-purple">
                    {asset.prediction ? getModelName(asset.prediction.model) : 'Upload'}
                  </span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--foreground-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', height: '2.4rem', lineHeight: '1.2rem', margin: '0.25rem 0' }}>
                  {asset.prediction?.prompt || ''}
                </p>
                {assetActions(asset).length > 0 && (
                  <div className="asset-send-actions" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.65rem' }}>
                    {assetActions(asset).map((action) => (
                      <a key={action.label} href={action.href} className="btn btn-secondary" style={{ padding: '0.35rem 0.55rem', fontSize: '0.7rem', textDecoration: 'none' }}>
                        {action.label}
                      </a>
                    ))}
                  </div>
                )}
                {asset.type === 'video' && asset.storageObjectId && (
                  <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--panel-border)', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '0.78rem' }}>Hooks, titles, thumbnails</strong>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-secondary" onClick={() => void generatePackagingIdeas(asset)} disabled={packaging[asset.id]?.loading === 'ideas'} style={{ padding: '0.35rem 0.55rem', fontSize: '0.7rem' }}>
                          {packaging[asset.id]?.loading === 'ideas' ? 'Thinking…' : 'Ideas'}
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => void saveThumbnailStills(asset)} disabled={packaging[asset.id]?.loading === 'thumbnails'} style={{ padding: '0.35rem 0.55rem', fontSize: '0.7rem' }}>
                          {packaging[asset.id]?.loading === 'thumbnails' ? 'Saving…' : 'Save stills'}
                        </button>
                      </div>
                    </div>
                    {packaging[asset.id]?.ideas && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                          {packaging[asset.id].ideas?.titleOverlays.slice(0, 3).map((title) => (
                            <button key={title} type="button" className="btn btn-secondary" onClick={() => updatePackaging(asset.id, { title })} style={{ padding: '0.3rem 0.5rem', fontSize: '0.68rem' }}>
                              {title}
                            </button>
                          ))}
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '1rem', color: 'var(--foreground-muted)', fontSize: '0.72rem' }}>
                          {packaging[asset.id].ideas?.hooks.slice(0, 2).map((hook) => <li key={hook}>{hook}</li>)}
                        </ul>
                      </div>
                    )}
                    <input
                      className="form-input"
                      aria-label={`Title overlay for ${asset.id}`}
                      placeholder="Title overlay"
                      maxLength={80}
                      value={packaging[asset.id]?.title || ''}
                      onChange={(event) => updatePackaging(asset.id, { title: event.target.value })}
                      style={{ fontSize: '0.75rem', padding: '0.5rem 0.65rem' }}
                    />
                    <input
                      className="form-input"
                      aria-label={`Subtitle overlay for ${asset.id}`}
                      placeholder="Optional subtitle / hook"
                      maxLength={100}
                      value={packaging[asset.id]?.subtitle || ''}
                      onChange={(event) => updatePackaging(asset.id, { subtitle: event.target.value })}
                      style={{ fontSize: '0.75rem', padding: '0.5rem 0.65rem' }}
                    />
                    <button type="button" className="btn btn-primary" onClick={() => void createTitleOverlay(asset)} disabled={packaging[asset.id]?.loading === 'overlay'} style={{ padding: '0.45rem 0.65rem', fontSize: '0.75rem' }}>
                      {packaging[asset.id]?.loading === 'overlay' ? 'Rendering overlay…' : 'Render title overlay'}
                    </button>
                    {packaging[asset.id]?.message && <small style={{ color: 'var(--primary)' }}>{packaging[asset.id]?.message}</small>}
                    {packaging[asset.id]?.error && <small style={{ color: '#ef4444' }}>{packaging[asset.id]?.error}</small>}
                  </div>
                )}
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
