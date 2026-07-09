'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '../layout';

interface AssetOption { id: string; url: string; thumbnailUrl: string | null; type: string; storageObjectId: string | null }
interface ProjectOption { id: string; name: string }
interface Kit {
  id: string; name: string; kind: 'character' | 'brand'; description: string | null; promptRules: string | null; voice: string | null;
  colors: string[] | null; fonts: string[] | null;
  kitAssets: Array<{ asset: AssetOption }>;
  projectAssignments: Array<{ project: ProjectOption }>;
}

const emptyForm = {
  name: '', kind: 'character' as 'character' | 'brand', description: '', promptRules: '', voice: '', colors: '', fonts: '',
  assetIds: [] as string[], projectIds: [] as string[],
};

export default function KitsPage() {
  const { token } = useAuth();
  const [kits, setKits] = useState<Kit[]>([]);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [kitData, assetData, projectData] = await Promise.all([api.getKits(), api.getAssets(), api.getProjects()]);
      setKits(kitData);
      setAssets(assetData.filter((asset: AssetOption) => asset.storageObjectId && ['image', 'video', 'audio'].includes(asset.type)));
      setProjects(projectData.map((project: ProjectOption) => ({ id: project.id, name: project.name })));
      const deepLinkedAssetId = new URLSearchParams(window.location.search).get('asset_id');
      if (deepLinkedAssetId && assetData.some((asset: AssetOption) => asset.id === deepLinkedAssetId && asset.storageObjectId)) {
        setForm((current) => ({ ...current, assetIds: current.assetIds.includes(deepLinkedAssetId) ? current.assetIds : [...current.assetIds, deepLinkedAssetId] }));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load kits');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const toggle = (field: 'assetIds' | 'projectIds', id: string) => {
    setForm((current) => ({ ...current, [field]: current[field].includes(id) ? current[field].filter((value) => value !== id) : [...current[field], id] }));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const payload = {
      name: form.name, kind: form.kind, description: form.description, prompt_rules: form.promptRules, voice: form.voice,
      colors: form.colors.split(',').map((value) => value.trim()).filter(Boolean),
      fonts: form.fonts.split(',').map((value) => value.trim()).filter(Boolean),
      asset_ids: form.assetIds, project_ids: form.projectIds,
    };
    try {
      if (editingId) await api.updateKit(editingId, payload); else await api.createKit(payload);
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to save kit');
    }
  };

  const edit = (kit: Kit) => {
    setEditingId(kit.id);
    setForm({
      name: kit.name, kind: kit.kind, description: kit.description || '', promptRules: kit.promptRules || '', voice: kit.voice || '',
      colors: Array.isArray(kit.colors) ? kit.colors.join(', ') : '', fonts: Array.isArray(kit.fonts) ? kit.fonts.join(', ') : '',
      assetIds: kit.kitAssets.map(({ asset }) => asset.id), projectIds: kit.projectAssignments.map(({ project }) => project.id),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (kit: Kit) => {
    if (!window.confirm(`Delete ${kit.name}? Assets and generated media will not be deleted.`)) return;
    try { await api.deleteKit(kit.id); await load(); } catch (err: any) { setError(err.message || 'Failed to delete kit'); }
  };

  if (!token) return <div className="glass-card" style={{ padding: '4rem', textAlign: 'center' }}>Sign in to create reusable characters and brand kits.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="glass-card">
        <h2 style={{ margin: 0 }}>Characters & Brand Kits</h2>
        <p style={{ color: 'var(--foreground-muted)', marginBottom: 0 }}>Keep identity, references, colors, voice, and style consistent across every scene in a project.</p>
      </div>

      {error && <div style={{ color: '#ef4444', padding: '0.8rem', border: '1px solid rgba(239,68,68,.35)', borderRadius: 10 }}>{error}</div>}

      <form className="glass-card kit-editor" onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <h3 style={{ margin: 0 }}>{editingId ? 'Edit reusable kit' : 'Create reusable kit'}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '0.75rem' }} className="kit-basics">
          <select className="form-select" aria-label="Kit type" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as 'character' | 'brand' })}>
            <option value="character">Character</option><option value="brand">Brand</option>
          </select>
          <input className="form-input" required maxLength={120} placeholder={form.kind === 'character' ? 'Character name' : 'Brand kit name'} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </div>
        <textarea className="form-textarea" rows={2} placeholder="Description and identity summary" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        <textarea className="form-textarea" rows={4} placeholder={form.kind === 'character' ? 'Appearance, wardrobe, mannerisms, and details that must remain consistent' : 'Visual style, logo rules, product identity, and details that must remain consistent'} value={form.promptRules} onChange={(event) => setForm({ ...form, promptRules: event.target.value })} />
        <input className="form-input" placeholder="Voice and tone guidance" value={form.voice} onChange={(event) => setForm({ ...form, voice: event.target.value })} />
        {form.kind === 'brand' && <div className="kit-basics" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <input className="form-input" placeholder="Colors, comma separated" value={form.colors} onChange={(event) => setForm({ ...form, colors: event.target.value })} />
          <input className="form-input" placeholder="Fonts, comma separated" value={form.fonts} onChange={(event) => setForm({ ...form, fonts: event.target.value })} />
        </div>}

        <div><strong style={{ fontSize: '0.85rem' }}>Reference assets</strong><p style={{ margin: '0.2rem 0 0.65rem', color: 'var(--foreground-muted)', fontSize: '0.78rem' }}>Select up to 12 durable library assets.</p>
          <div className="asset-picker-grid">
            {assets.map((asset) => <button key={asset.id} type="button" aria-label={`Reference ${asset.type} ${asset.id}`} className={`asset-picker-card ${form.assetIds.includes(asset.id) ? 'selected' : ''}`} onClick={() => toggle('assetIds', asset.id)} disabled={!form.assetIds.includes(asset.id) && form.assetIds.length >= 12}>
              {asset.type === 'image' ? <img src={asset.thumbnailUrl || asset.url} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8 }} /> : <span style={{ display: 'grid', placeItems: 'center', aspectRatio: '1', fontSize: '1.8rem' }}>{asset.type === 'video' ? '🎬' : '🎵'}</span>}
              <span style={{ fontSize: '0.7rem' }}>{asset.type}</span>
            </button>)}
            {!assets.length && <span style={{ color: 'var(--foreground-muted)', fontSize: '0.8rem' }}>Upload or generate assets first.</span>}
          </div>
        </div>

        <div><strong style={{ fontSize: '0.85rem' }}>Apply to projects</strong>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
            {projects.map((project) => <button key={project.id} type="button" className={`btn ${form.projectIds.includes(project.id) ? 'btn-primary' : 'btn-secondary'}`} onClick={() => toggle('projectIds', project.id)}>{project.name}</button>)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}><button className="btn btn-primary" type="submit">{editingId ? 'Save changes' : 'Create kit'}</button>{editingId && <button className="btn btn-secondary" type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }}>Cancel</button>}</div>
      </form>

      <div className="kit-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
        {kits.map((kit) => <article className="glass-card" key={kit.id}>
          <span className="badge badge-purple">{kit.kind}</span><h3 style={{ margin: '0.65rem 0 0.35rem' }}>{kit.name}</h3>
          <p style={{ color: 'var(--foreground-muted)', fontSize: '0.85rem' }}>{kit.description || kit.promptRules || 'No guidance added yet.'}</p>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>{kit.kitAssets.slice(0, 5).map(({ asset }) => asset.type === 'image' ? <img key={asset.id} src={asset.thumbnailUrl || asset.url} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} /> : <span key={asset.id} className="badge badge-purple">{asset.type}</span>)}</div>
          <p style={{ color: 'var(--foreground-muted)', fontSize: '0.75rem' }}>{kit.projectAssignments.length ? `Used in ${kit.projectAssignments.map(({ project }) => project.name).join(', ')}` : 'Not assigned to a project'}</p>
          <div style={{ display: 'flex', gap: '0.5rem' }}><button className="btn btn-secondary" onClick={() => edit(kit)}>Edit</button><button className="btn btn-secondary" onClick={() => void remove(kit)}>Delete</button></div>
        </article>)}
      </div>
      {!loading && !kits.length && <div className="glass-card" style={{ textAlign: 'center', color: 'var(--foreground-muted)', padding: '3rem' }}>Create your first reusable character or brand kit above.</div>}
    </div>
  );
}
