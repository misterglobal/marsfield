'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '../layout';

type StudioTab = 'brief' | 'script' | 'storyboard' | 'delivery';
interface ProductionSummary { id: string; topic: string; targetDurationMin: number; status: string; estimatedCreditsMin: number; projectId: string | null; updatedAt: string }
interface Production extends ProductionSummary {
  audience: string | null; research: any; strategy: any; script: any; storyboard: any[];
  narration?: any; captions?: any; audio?: any; seo: any; thumbnailConcepts: any[]; productionMetrics?: any;
}

const tabs: { id: StudioTab; label: string; kicker: string }[] = [
  { id: 'brief', label: '01 Brief', kicker: 'Strategy & research' },
  { id: 'script', label: '02 Script', kicker: 'Timed editorial draft' },
  { id: 'storyboard', label: '03 Storyboard', kicker: 'Shot plan & continuity' },
  { id: 'delivery', label: '04 Delivery', kicker: 'Audio, captions & release' },
];

const formatSeconds = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

export default function YoutubePlannerPage() {
  const { token } = useAuth();
  const [productions, setProductions] = useState<ProductionSummary[]>([]);
  const [selected, setSelected] = useState<Production | null>(null);
  const [tab, setTab] = useState<StudioTab>('brief');
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('curious viewers who value clear, evidence-led storytelling');
  const [objective, setObjective] = useState('Make the viewer understand why this story matters now');
  const [format, setFormat] = useState('Cinematic explainer');
  const [tone, setTone] = useState('Authoritative and curious');
  const [targetDurationMin, setTargetDurationMin] = useState(10);
  const [angleCount, setAngleCount] = useState(8);
  const [loading, setLoading] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [projectCreating, setProjectCreating] = useState(false);
  const [narrationPreparing, setNarrationPreparing] = useState(false);
  const [wordsPerMinute, setWordsPerMinute] = useState(145);
  const [error, setError] = useState('');

  const loadProductions = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api.getYoutubeProductions();
      setProductions(data);
      if (!selected && data[0]) setSelected(await api.getYoutubeProduction(data[0].id));
    } catch (err: any) { setError(err.message || 'Failed loading productions'); }
    finally { setLoading(false); }
  }, [token, selected]);

  useEffect(() => { void loadProductions(); }, [loadProductions]);

  const createPlan = async (event: React.FormEvent) => {
    event.preventDefault();
    if (topic.trim().length < 3) return;
    setPlanning(true); setError('');
    try {
      const production = await api.createYoutubeProduction({
        topic, audience, objective, format, tone,
        target_duration_min: targetDurationMin, angle_count: angleCount,
      });
      setSelected(production); setTopic(''); setTab('brief');
      await loadProductions();
    } catch (err: any) { setError(err.message || 'Failed creating production plan'); }
    finally { setPlanning(false); }
  };

  const selectProduction = async (id: string) => {
    setError('');
    try { setSelected(await api.getYoutubeProduction(id)); setTab('brief'); }
    catch (err: any) { setError(err.message || 'Failed loading production'); }
  };

  const createProject = async () => {
    if (!selected) return;
    setProjectCreating(true); setError('');
    try {
      const result = await api.createProjectFromYoutubeProduction(selected.id);
      setSelected({ ...selected, projectId: result.project_id, status: 'project_created' });
      await loadProductions();
    } catch (err: any) { setError(err.message || 'Failed creating storyboard project'); }
    finally { setProjectCreating(false); }
  };

  const prepareNarration = async () => {
    if (!selected) return;
    setNarrationPreparing(true); setError('');
    try {
      const production = await api.createYoutubeNarrationPackage(selected.id, { words_per_minute: wordsPerMinute });
      setSelected(production); await loadProductions();
    } catch (err: any) { setError(err.message || 'Failed preparing narration package'); }
    finally { setNarrationPreparing(false); }
  };

  const totalStoryboardSeconds = useMemo(() => selected?.storyboard?.reduce((sum, scene) => sum + Number(scene.durationSeconds || 0), 0) || 0, [selected]);

  if (!token) return <div className="glass-card youtube-empty"><h2>Sign in to open Production Studio</h2><p>Develop evidence-led scripts, shot plans, narration, and delivery packages.</p></div>;

  return (
    <div className="youtube-studio">
      <aside className="youtube-sidebar">
        <form className="glass-card youtube-brief-form" onSubmit={createPlan}>
          <div className="youtube-eyebrow">New production</div>
          <h2>Creative brief</h2>
          <p className="youtube-muted">Set the editorial direction before the studio builds the plan.</p>
          <label className="form-label">Story or working title
            <textarea className="form-textarea" rows={3} placeholder="What is the film about?" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={180} />
          </label>
          <label className="form-label">Viewer
            <input className="form-input" value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={140} />
          </label>
          <label className="form-label">Editorial objective
            <textarea className="form-textarea" rows={2} value={objective} onChange={(e) => setObjective(e.target.value)} maxLength={180} />
          </label>
          <div className="youtube-form-grid">
            <label className="form-label">Format
              <select className="form-select" value={format} onChange={(e) => setFormat(e.target.value)}>
                <option>Cinematic explainer</option><option>Investigative video essay</option><option>Presenter-led documentary</option><option>Visual case study</option>
              </select>
            </label>
            <label className="form-label">Voice
              <select className="form-select" value={tone} onChange={(e) => setTone(e.target.value)}>
                <option>Authoritative and curious</option><option>Intimate and reflective</option><option>Urgent and investigative</option><option>Playful and precise</option>
              </select>
            </label>
            <label className="form-label">Runtime
              <input className="form-input" type="number" min={3} max={60} value={targetDurationMin} onChange={(e) => setTargetDurationMin(Number(e.target.value))} />
            </label>
            <label className="form-label">Research lanes
              <input className="form-input" type="number" min={4} max={12} value={angleCount} onChange={(e) => setAngleCount(Number(e.target.value))} />
            </label>
          </div>
          <button className="btn btn-primary" disabled={planning || topic.trim().length < 3}>{planning ? 'Building production…' : 'Build production plan'}</button>
        </form>

        <section className="glass-card youtube-productions">
          <div className="youtube-section-heading"><strong>Productions</strong><button className="youtube-text-button" type="button" onClick={() => void loadProductions()}>Refresh</button></div>
          {loading && <span className="youtube-muted">Loading library…</span>}
          {productions.map((production) => (
            <button key={production.id} type="button" className={`youtube-production-row ${selected?.id === production.id ? 'active' : ''}`} onClick={() => void selectProduction(production.id)}>
              <span>{production.topic}</span><small>{production.targetDurationMin} min · {production.status.replaceAll('_', ' ')}</small>
            </button>
          ))}
          {!loading && !productions.length && <span className="youtube-muted">Your production library is empty.</span>}
        </section>
      </aside>

      <main className="youtube-workspace">
        {error && <div className="youtube-error">{error}</div>}
        {!selected ? <div className="glass-card youtube-empty"><span className="youtube-eyebrow">Production studio</span><h1>Start with a clear creative brief.</h1><p>The studio will turn it into a research checklist, timed script outline, varied shot plan, and delivery package.</p></div> : (
          <>
            <header className="glass-card youtube-production-header">
              <div>
                <div className="youtube-eyebrow">{selected.strategy?.format || 'Production'} · {selected.strategy?.tone || 'Editorial plan'}</div>
                <h1>{selected.topic}</h1>
                <p>{selected.strategy?.positioning}</p>
              </div>
              <div className="youtube-header-actions">
                <span className="youtube-readiness"><strong>{selected.productionMetrics?.readiness || 25}%</strong> pre-production ready</span>
                {selected.projectId
                  ? <a className="btn btn-secondary" href="/projects">Open edit project</a>
                  : <button className="btn btn-primary" onClick={() => void createProject()} disabled={projectCreating}>{projectCreating ? 'Creating…' : 'Send to edit project'}</button>}
              </div>
              <div className="youtube-metrics">
                <span><strong>{selected.script?.targetWords || '—'}</strong> target words</span>
                <span><strong>{selected.storyboard?.length || 0}</strong> planned shots</span>
                <span><strong>{formatSeconds(totalStoryboardSeconds)}</strong> picture runtime</span>
                <span><strong>{selected.productionMetrics?.openResearchTasks || '—'}</strong> open research tasks</span>
              </div>
            </header>

            <nav className="youtube-tabs" aria-label="Production stages">
              {tabs.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}><strong>{item.label}</strong><small>{item.kicker}</small></button>)}
            </nav>

            {tab === 'brief' && <BriefPanel production={selected} />}
            {tab === 'script' && <ScriptPanel production={selected} />}
            {tab === 'storyboard' && <StoryboardPanel production={selected} />}
            {tab === 'delivery' && <DeliveryPanel production={selected} wordsPerMinute={wordsPerMinute} setWordsPerMinute={setWordsPerMinute} prepare={() => void prepareNarration()} preparing={narrationPreparing} />}
          </>
        )}
      </main>
    </div>
  );
}

function BriefPanel({ production }: { production: Production }) {
  return <div className="youtube-panel-stack">
    <section className="glass-card youtube-two-column">
      <div><span className="youtube-eyebrow">Editorial spine</span><h3>{production.strategy?.centralQuestion}</h3><p className="youtube-muted">{production.strategy?.viewerPromise}</p></div>
      <div><span className="youtube-eyebrow">Objective</span><p>{production.strategy?.objective}</p><div className="youtube-chip-row">{production.strategy?.keywords?.map((word: string) => <span key={word}>{word}</span>)}</div></div>
    </section>
    <section className="glass-card"><div className="youtube-section-heading"><div><span className="youtube-eyebrow">Research desk</span><h2>Evidence lanes</h2></div><span className="youtube-warning">Source lock required</span></div><p className="youtube-muted">{production.research?.disclaimer}</p>
      <div className="youtube-research-grid">{production.research?.angles?.map((angle: any, index: number) => <article key={angle.angle}><span className="youtube-card-number">{String(index + 1).padStart(2, '0')}</span><h3>{angle.angle}</h3><p>{angle.tension}</p><small>Proof target</small><strong>{angle.proof}</strong><ul>{angle.questions?.slice(0, 2).map((q: string) => <li key={q}>{q}</li>)}</ul></article>)}</div>
    </section>
    <section className="glass-card"><span className="youtube-eyebrow">Approval workflow</span><h2>Review gates</h2><div className="youtube-gates">{production.strategy?.reviewGates?.map((gate: any, index: number) => <div key={gate.stage}><span>{index + 1}</span><div><strong>{gate.stage}</strong><p>{gate.criteria}</p></div></div>)}</div></section>
  </div>;
}

function ScriptPanel({ production }: { production: Production }) {
  return <div className="youtube-panel-stack">
    <section className="glass-card youtube-section-heading"><div><span className="youtube-eyebrow">Writer’s room</span><h2>Timed editorial outline</h2><p className="youtube-muted">This outline defines argument, pacing, and retention. It is intentionally labelled before record-ready copy.</p></div><div className="youtube-script-total"><strong>{production.script?.targetWords}</strong><span>words at script lock</span></div></section>
    <section className="youtube-script-list">{production.script?.sections?.map((section: any, index: number) => <article className="glass-card" key={`${section.name}-${index}`}>
      <div className="youtube-script-time"><strong>{section.timecode}</strong><small>{section.wordTarget} words</small></div>
      <div><div className="youtube-section-heading"><h3>{section.name}</h3><span className="youtube-status">{section.draftStatus?.replaceAll('_', ' ')}</span></div><p className="youtube-script-purpose">{section.purpose}</p><p>{section.narration}</p>
      <div className="youtube-editor-note"><strong>Retention</strong><span>{section.retentionDevice}</span></div><div className="youtube-editor-note"><strong>Edit note</strong><span>{section.editorNotes}</span></div></div>
    </article>)}</section>
  </div>;
}

function StoryboardPanel({ production }: { production: Production }) {
  return <div className="youtube-panel-stack">
    <section className="glass-card youtube-section-heading"><div><span className="youtube-eyebrow">Shot deck</span><h2>{production.storyboard?.length} purposeful shots</h2><p className="youtube-muted">Shot grammar changes with story function. Continuity and transitions are specified at every cut.</p></div><span className="youtube-warning">References needed</span></section>
    <section className="youtube-shot-grid">{production.storyboard?.map((scene: any) => <article className="glass-card youtube-shot-card" key={scene.index}>
      <div className="youtube-shot-top"><span>{String(scene.sceneNumber || scene.index + 1).padStart(2, '0')}</span><strong>{scene.timecode}</strong></div>
      <div className="youtube-shot-frame"><span>{scene.shotType || 'Planned shot'}</span><small>{scene.storyFunction}</small></div>
      <h3>{scene.chapter}</h3><p>{scene.sceneDescription}</p>
      <dl><div><dt>Camera</dt><dd>{scene.cameraDirection}</dd></div><div><dt>Transition</dt><dd>{scene.transition}</dd></div><div><dt>Sound</dt><dd>{scene.audioDirection}</dd></div></dl>
      <details><summary>Generation brief & continuity</summary><p>{scene.imagePrompt}</p><p className="youtube-muted">{scene.continuity}</p></details>
    </article>)}</section>
  </div>;
}

function DeliveryPanel({ production, wordsPerMinute, setWordsPerMinute, prepare, preparing }: { production: Production; wordsPerMinute: number; setWordsPerMinute: (value: number) => void; prepare: () => void; preparing: boolean }) {
  return <div className="youtube-panel-stack">
    <section className="glass-card youtube-two-column"><div><span className="youtube-eyebrow">Narration desk</span><h2>Voice & captions</h2><p className="youtube-muted">Prepare a timing package after the script has been reviewed. The current outline is not a substitute for final copy.</p></div><div className="youtube-delivery-action"><label className="form-label">Read speed (WPM)<input className="form-input" type="number" min={90} max={210} value={wordsPerMinute} onChange={(e) => setWordsPerMinute(Number(e.target.value))} /></label><button className="btn btn-primary" onClick={prepare} disabled={preparing}>{preparing ? 'Preparing…' : production.narration ? 'Rebuild timing package' : 'Prepare timing package'}</button></div></section>
    {production.narration ? <><section className="glass-card youtube-metrics"><span><strong>{production.narration.totalWords}</strong> current words</span><span><strong>{formatSeconds(production.narration.estimatedDurationSeconds)}</strong> estimated read</span><span><strong>{production.captions?.count || 0}</strong> caption cues</span><span><strong>{production.audio?.status?.replaceAll('_', ' ')}</strong> audio</span></section>
      <section className="youtube-two-column"><article className="glass-card"><span className="youtube-eyebrow">Narration preview</span><textarea className="form-textarea" readOnly rows={14} value={production.narration.ttsText || ''} /></article><article className="glass-card"><span className="youtube-eyebrow">Caption preview</span><pre className="youtube-caption-preview">{production.captions?.srt?.slice(0, 2200)}</pre></article></section></> :
      <section className="glass-card youtube-empty"><h3>No timing package yet</h3><p>Lock the editorial outline, write and review the final narration, then prepare captions and shot timing here.</p></section>}
    <section className="glass-card"><span className="youtube-eyebrow">Release desk</span><h2>Packaging concepts</h2><div className="youtube-release-grid"><div><h3>Title directions</h3><ol>{production.seo?.titles?.map((title: string) => <li key={title}>{title}</li>)}</ol></div>{production.thumbnailConcepts?.map((concept: any) => <article key={concept.title}><span>Thumbnail route</span><h3>{concept.title}</h3><p>{concept.composition}</p><small>{concept.prompt}</small></article>)}</div></section>
  </div>;
}
