'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '../layout';

interface YoutubeProductionSummary {
  id: string;
  topic: string;
  audience: string | null;
  targetDurationMin: number;
  status: string;
  estimatedCreditsMin: number;
  projectId: string | null;
  updatedAt: string;
}

interface YoutubeProduction extends YoutubeProductionSummary {
  research: any;
  strategy: any;
  script: any;
  storyboard: any[];
  seo: any;
  thumbnailConcepts: any[];
}

export default function YoutubePlannerPage() {
  const { token } = useAuth();
  const [productions, setProductions] = useState<YoutubeProductionSummary[]>([]);
  const [selected, setSelected] = useState<YoutubeProduction | null>(null);
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('curious history and culture viewers');
  const [targetDurationMin, setTargetDurationMin] = useState(8);
  const [angleCount, setAngleCount] = useState(8);
  const [loading, setLoading] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [projectCreating, setProjectCreating] = useState(false);
  const [error, setError] = useState('');

  const loadProductions = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.getYoutubeProductions();
      setProductions(data);
      if (!selected && data[0]) setSelected(await api.getYoutubeProduction(data[0].id));
    } catch (err: any) {
      setError(err.message || 'Failed loading YouTube productions');
    } finally {
      setLoading(false);
    }
  }, [token, selected]);

  useEffect(() => {
    void loadProductions();
  }, [loadProductions]);

  const createPlan = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!topic.trim()) return;
    setPlanning(true);
    setError('');
    try {
      const production = await api.createYoutubeProduction({
        topic,
        audience,
        target_duration_min: targetDurationMin,
        angle_count: angleCount,
      });
      setSelected(production);
      setTopic('');
      await loadProductions();
    } catch (err: any) {
      setError(err.message || 'Failed creating YouTube plan');
    } finally {
      setPlanning(false);
    }
  };

  const selectProduction = async (id: string) => {
    setError('');
    try {
      setSelected(await api.getYoutubeProduction(id));
    } catch (err: any) {
      setError(err.message || 'Failed loading production');
    }
  };

  const createProject = async () => {
    if (!selected) return;
    setProjectCreating(true);
    setError('');
    try {
      const result = await api.createProjectFromYoutubeProduction(selected.id);
      setSelected({ ...selected, projectId: result.project_id || selected.projectId, status: 'project_created' });
      await loadProductions();
    } catch (err: any) {
      setError(err.message || 'Failed creating project from production');
    } finally {
      setProjectCreating(false);
    }
  };

  if (!token) {
    return (
      <div className="glass-card" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
        <h2>Sign in to use the YouTube Planner</h2>
        <p style={{ color: 'var(--foreground-muted)' }}>Create long-form production plans, scripts, storyboards, and SEO packages.</p>
      </div>
    );
  }

  return (
    <div className="youtube-planner-layout" style={{ display: 'grid', gridTemplateColumns: '340px minmax(0, 1fr)', gap: '1.5rem' }}>
      <aside style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <form className="glass-card" onSubmit={createPlan} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div>
            <h2 style={{ margin: 0 }}>YouTube Planner</h2>
            <p style={{ margin: '0.35rem 0 0', color: 'var(--foreground-muted)', fontSize: '0.84rem' }}>
              Phase 1 dry run: research scaffold, strategy, script, storyboard, SEO, and thumbnail concepts. 0 credits.
            </p>
          </div>
          <textarea
            className="form-textarea"
            rows={4}
            placeholder="Topic, e.g. The Sogdians and the Silk Road"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            maxLength={180}
          />
          <input className="form-input" placeholder="Audience" value={audience} onChange={(event) => setAudience(event.target.value)} maxLength={140} />
          <label className="form-label">
            Target minutes
            <input className="form-input" type="number" min={3} max={60} value={targetDurationMin} onChange={(event) => setTargetDurationMin(Number(event.target.value))} style={{ marginTop: '0.35rem' }} />
          </label>
          <label className="form-label">
            Research angles
            <input className="form-input" type="number" min={4} max={12} value={angleCount} onChange={(event) => setAngleCount(Number(event.target.value))} style={{ marginTop: '0.35rem' }} />
          </label>
          <button className="btn btn-primary" type="submit" disabled={planning || topic.trim().length < 3}>
            {planning ? 'Planning...' : 'Create dry-run plan'}
          </button>
        </form>

        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>Production records</strong>
            <button className="btn btn-secondary" type="button" onClick={() => void loadProductions()} style={{ padding: '0.35rem 0.6rem', fontSize: '0.72rem' }}>Refresh</button>
          </div>
          {loading && <small style={{ color: 'var(--foreground-muted)' }}>Loading...</small>}
          {productions.map((production) => (
            <button
              key={production.id}
              className={`btn ${selected?.id === production.id ? 'btn-primary' : 'btn-secondary'}`}
              type="button"
              onClick={() => void selectProduction(production.id)}
              style={{ textAlign: 'left', justifyContent: 'flex-start', padding: '0.7rem' }}
            >
              <span>
                <strong style={{ display: 'block' }}>{production.topic}</strong>
                <small>{production.targetDurationMin} min · {production.estimatedCreditsMin}+ credits later</small>
              </span>
            </button>
          ))}
          {!loading && productions.length === 0 && <small style={{ color: 'var(--foreground-muted)' }}>No production plans yet.</small>}
        </div>
      </aside>

      <main style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {error && <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5', padding: '0.8rem', borderRadius: 12 }}>{error}</div>}

        {selected ? (
          <>
            <section className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <h1 style={{ margin: 0 }}>{selected.topic}</h1>
                <p style={{ margin: '0.4rem 0 0', color: 'var(--foreground-muted)' }}>{selected.strategy?.positioning}</p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                  <span className="badge badge-purple">0 credits dry run</span>
                  <span className="badge badge-purple">{selected.targetDurationMin} min target</span>
                  <span className="badge badge-purple">{selected.estimatedCreditsMin}+ credits when generated</span>
                </div>
              </div>
              {selected.projectId ? (
                <a href={`/projects`} className="btn btn-secondary" style={{ textDecoration: 'none', alignSelf: 'flex-start' }}>Open Projects</a>
              ) : (
                <button className="btn btn-primary" type="button" onClick={() => void createProject()} disabled={projectCreating} style={{ alignSelf: 'flex-start' }}>
                  {projectCreating ? 'Creating project...' : 'Create storyboard project'}
                </button>
              )}
            </section>

            <section className="glass-card">
              <h3 style={{ marginTop: 0 }}>Research Agent</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                {selected.research?.angles?.map((angle: any) => (
                  <div key={angle.angle} style={{ border: '1px solid var(--panel-border)', borderRadius: 12, padding: '0.8rem' }}>
                    <strong>{angle.angle}</strong>
                    <ul style={{ marginBottom: 0, paddingLeft: '1.1rem', color: 'var(--foreground-muted)', fontSize: '0.78rem' }}>
                      {angle.questions?.slice(0, 2).map((question: string) => <li key={question}>{question}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            <section className="glass-card">
              <h3 style={{ marginTop: 0 }}>Content Strategy + SEO</h3>
              <p style={{ color: 'var(--foreground-muted)' }}>{selected.strategy?.targetAudience} · {selected.strategy?.contentType}</p>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {selected.strategy?.keywords?.map((keyword: string) => <span key={keyword} className="badge badge-purple">{keyword}</span>)}
              </div>
              <h4>Title options</h4>
              <ol>
                {selected.seo?.titles?.map((title: string) => <li key={title}>{title}</li>)}
              </ol>
            </section>

            <section className="glass-card">
              <h3 style={{ marginTop: 0 }}>Script Writer Agent</h3>
              <p style={{ color: 'var(--foreground-muted)' }}>{selected.script?.hook}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {selected.script?.sections?.map((section: any) => (
                  <div key={section.name} style={{ borderLeft: '3px solid var(--primary)', paddingLeft: '0.75rem' }}>
                    <strong>{section.name}</strong>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--foreground-muted)' }}>{section.narration}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="glass-card">
              <h3 style={{ marginTop: 0 }}>Storyboard Agent</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
                {selected.storyboard?.map((scene) => (
                  <article key={scene.index} style={{ border: '1px solid var(--panel-border)', borderRadius: 12, padding: '0.8rem' }}>
                    <strong>{scene.title}</strong>
                    <p style={{ color: 'var(--foreground-muted)', fontSize: '0.8rem' }}>{scene.sceneDescription}</p>
                    <small>{scene.durationSeconds}s · {scene.cameraDirection}</small>
                  </article>
                ))}
              </div>
            </section>

            <section className="glass-card">
              <h3 style={{ marginTop: 0 }}>Thumbnail Concepts</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                {selected.thumbnailConcepts?.map((concept) => (
                  <div key={concept.title} style={{ border: '1px solid var(--panel-border)', borderRadius: 12, padding: '0.8rem' }}>
                    <strong>{concept.title}</strong>
                    <p style={{ color: 'var(--foreground-muted)', fontSize: '0.8rem' }}>{concept.prompt}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <div className="glass-card" style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--foreground-muted)' }}>
            Create a dry-run production plan to begin.
          </div>
        )}
      </main>
    </div>
  );
}
