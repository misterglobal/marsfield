'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '../layout';

type StudioTab = 'brief' | 'script' | 'storyboard' | 'delivery';
interface ProductionSummary { id: string; topic: string; targetDurationMin: number; status: string; estimatedCreditsMin: number; projectId: string | null; updatedAt: string }
interface Production extends ProductionSummary {
  audience: string | null; research: any; strategy: any; script: any; storyboard: any[];
  normalizedTopic?: any; narration?: any; captions?: any; audio?: any; seo: any; thumbnailConcepts: any[]; productionMetrics?: any;
}

const tabs: { id: StudioTab; label: string; kicker: string }[] = [
  { id: 'brief', label: '01 Brief', kicker: 'Strategy & research' },
  { id: 'script', label: '02 Script', kicker: 'Timed editorial draft' },
  { id: 'storyboard', label: '03 Storyboard', kicker: 'Shot plan & continuity' },
  { id: 'delivery', label: '04 Delivery', kicker: 'Audio, captions & release' },
];

const formatSeconds = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

const stageGuidance: Record<StudioTab, { title: string; description: string; next?: string }> = {
  brief: { title: 'Check the direction of your video', description: 'Read the hook, viewer takeaway, and research questions below. Keep a list of claims to verify before publishing. When the direction looks right, review the script outline.', next: 'Continue to script' },
  script: { title: 'Review the story and pacing', description: 'Read each section in order. Check the opening hook, key points, and ending. This is a draft outline; final narration and fact-checking happen outside this planner.', next: 'Continue to storyboard' },
  storyboard: { title: 'Check how the story will look', description: 'Review the shot sequence, camera directions, and continuity notes. These are planned shots; images and video have not been generated yet.', next: 'Continue to delivery' },
  delivery: { title: 'Prepare your handoff', description: 'Optionally preview narration timing and captions, then send your planned shots to an edit project. You can edit scenes and start generating media there.' },
};

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
  const [opening, setOpening] = useState(false);
  const [showBrief, setShowBrief] = useState(false);
  const selectionRequest = useRef(0);
  const stageHeading = useRef<HTMLHeadingElement>(null);
  const busy = planning || opening || projectCreating || narrationPreparing;

  const changeTab = (next: StudioTab) => {
    setTab(next);
    requestAnimationFrame(() => {
      stageHeading.current?.focus({ preventScroll: true });
      stageHeading.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const loadProductions = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api.getYoutubeProductions();
      setProductions(data);
    } catch (err: any) { setError(err.message || 'Failed loading productions'); }
    finally { setLoading(false); }
  }, [token]);

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
      setSelected(production); setShowBrief(false); setTopic(''); changeTab('brief');
      await loadProductions();
    } catch (err: any) { setError(err.message || 'Failed creating production plan'); }
    finally { setPlanning(false); }
  };

  const selectProduction = async (id: string) => {
    setError('');
    const request = ++selectionRequest.current;
    setOpening(true);
    try {
      const production = await api.getYoutubeProduction(id);
      if (request !== selectionRequest.current) return;
      setSelected(production); setShowBrief(false); changeTab(production.projectId || production.narration ? 'delivery' : 'brief');
    }
    catch (err: any) { if (request === selectionRequest.current) setError(err.message || 'Failed loading production'); }
    finally { if (request === selectionRequest.current) setOpening(false); }
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
  const stepIndex = tabs.findIndex((item) => item.id === tab);
  const projectLink = selected?.projectId ? `/projects?project_id=${encodeURIComponent(selected.projectId)}` : '/projects';

  if (!token) return <div className="glass-card youtube-empty"><h2>Sign in to open Production Studio</h2><p>Develop evidence-led scripts, shot plans, narration, and delivery packages.</p></div>;

  return (
    <div className="youtube-studio">
      <aside className="youtube-sidebar">
        {selected && <button className="btn btn-secondary" aria-expanded={showBrief} aria-controls="youtube-new-brief" onClick={() => setShowBrief(!showBrief)}>{showBrief ? 'Close new production brief' : 'Start a new production'}</button>}
        <form id="youtube-new-brief" style={selected && !showBrief ? { display: 'none' } : undefined} className="glass-card youtube-brief-form" onSubmit={createPlan}>
          <div className="youtube-eyebrow">New production</div>
          <h2>Creative brief</h2>
          <p className="youtube-muted">Start here: describe your video idea. We’ll build a draft you can review in four steps. Planning uses no generation credits.</p>
          <label className="form-label">Story or working title
            <textarea className="form-textarea" rows={5} placeholder="Paste a title, hook, or full story idea. Marsfield will structure it before planning." value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={4000} />
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
          <button className="btn btn-primary" disabled={busy || topic.trim().length < 3}>{planning ? 'Building production…' : 'Build production plan'}</button>
          {planning && <p role="status" className="youtube-muted">Preparing your brief, script outline, and shot plan. Your plan will open here when ready.</p>}
        </form>

        <section className="glass-card youtube-productions">
          <div className="youtube-section-heading"><strong>Productions</strong><button className="youtube-text-button" type="button" onClick={() => void loadProductions()}>Refresh</button></div>
          {loading && <span className="youtube-muted">Loading library…</span>}
          {productions.map((production) => (
            <button key={production.id} type="button" disabled={busy} className={`youtube-production-row ${selected?.id === production.id ? 'active' : ''}`} onClick={() => void selectProduction(production.id)}>
              <span>{production.topic}</span><small>{production.targetDurationMin} min · {production.status.replaceAll('_', ' ')}</small>
            </button>
          ))}
          {!loading && !productions.length && <span className="youtube-muted">Your production library is empty.</span>}
        </section>
      </aside>

      <main className="youtube-workspace">
        {error && <div role="alert" className="youtube-error">{error}</div>}
        {opening && <p role="status">Opening your production…</p>}
        {!selected ? <div className="glass-card youtube-empty"><span className="youtube-eyebrow">YouTube planning</span><h1>Turn your idea into a video plan.</h1><p>Enter a story or working title in the creative brief, then choose Build production plan. Or open a saved production from your library.</p><ol className="youtube-start-path"><li>Review your brief and research questions</li><li>Read the script outline</li><li>Check the planned shots</li><li>Prepare timing and continue in an edit project</li></ol><p>No video is generated until you start generation in your project.</p></div> : (
          <>
            <header className="glass-card youtube-production-header">
              <div>
                <div className="youtube-eyebrow">{selected.strategy?.format || 'Production'} · {selected.strategy?.tone || 'Editorial plan'}{selected.strategy?.plannerEngine === 'gpt-4o-mini' ? ' · Enhanced scene plan' : selected.strategy?.plannerFallback ? ' · Draft scene plan' : ''}</div>
                <h1>{selected.topic}</h1>
                <p>{selected.strategy?.positioning}</p>
              </div>
              <div className="youtube-header-actions">
                <span className="youtube-status">{selected.projectId ? 'Edit project created' : selected.narration ? 'Timing package prepared' : 'Draft plan created'}</span>
                {selected.projectId
                  ? <a className="btn btn-secondary" href={projectLink}>Open edit project</a>
                  : null}
              </div>
              <div className="youtube-metrics">
                <span><strong>{selected.script?.targetWords || '—'}</strong> target words</span>
                <span><strong>{selected.storyboard?.length || 0}</strong> planned shots</span>
                <span><strong>{formatSeconds(totalStoryboardSeconds)}</strong> picture runtime</span>
                <span><strong>{selected.productionMetrics?.openResearchTasks ?? 'Not generated'}</strong> {selected.productionMetrics?.openResearchTasks == null ? 'research tasks' : 'open research tasks'}</span>
              </div>
              <ReadinessChecklist production={selected} />
            </header>

            <nav className="youtube-tabs" aria-label="Production stages">
              {tabs.map((item) => <button key={item.id} aria-current={tab === item.id ? 'step' : undefined} className={tab === item.id ? 'active' : ''} onClick={() => changeTab(item.id)}><strong>{item.label}</strong><small>{item.kicker}</small></button>)}
            </nav>

            <section className="glass-card youtube-stage-guide" aria-labelledby="youtube-stage-title">
              <div><span className="youtube-eyebrow">Step {stepIndex + 1} of 4 · {tabs[stepIndex].kicker}</span><h2 id="youtube-stage-title" tabIndex={-1} ref={stageHeading}>{stageGuidance[tab].title}</h2><p>{stageGuidance[tab].description}</p></div>
              {stageGuidance[tab].next && <button className="btn btn-primary" onClick={() => changeTab(tabs[stepIndex + 1].id)}>{stageGuidance[tab].next}</button>}
            </section>

            {tab === 'brief' && <BriefPanel production={selected} />}
            {tab === 'script' && <ScriptPanel production={selected} />}
            {tab === 'storyboard' && <StoryboardPanel production={selected} />}
            {tab === 'delivery' && <DeliveryPanel production={selected} wordsPerMinute={wordsPerMinute} setWordsPerMinute={setWordsPerMinute} prepare={() => void prepareNarration()} preparing={narrationPreparing} />}
            <footer className="glass-card youtube-stage-footer">
              {stepIndex > 0 ? <button className="btn btn-secondary" onClick={() => changeTab(tabs[stepIndex - 1].id)}>Back to {tabs[stepIndex - 1].id}</button> : <span>You can return to any stage at any time.</span>}
              {tab !== 'delivery' ? <button className="btn btn-primary" onClick={() => changeTab(tabs[stepIndex + 1].id)}>{stageGuidance[tab].next}</button> : <div>
                <p>{selected.projectId ? 'Your planned shots are saved in your edit project. Open it to edit scenes and generate media.' : `Send up to 24 planned shots to a new project. This does not generate media or spend generation credits.${(selected.storyboard?.length || 0) > 24 ? ' Only the first 24 shots will be copied.' : ''}`}</p>
                {selected.projectId ? <a className="btn btn-primary" href={projectLink}>Continue in edit project</a> : <button className="btn btn-primary" onClick={() => void createProject()} disabled={busy || !selected.storyboard?.length}>{projectCreating ? 'Creating…' : 'Send to edit project'}</button>}
                {!selected.storyboard?.length && !selected.projectId && <p role="status">This plan has no shots to send. Create a new production plan from your brief to try again.</p>}
              </div>}
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

function readinessCriteria(production: Production) {
  const supplied = production.productionMetrics?.readinessCriteria;
  const base = Array.isArray(supplied) ? supplied : [
    { id: 'creative_direction', label: 'Creative direction', complete: Boolean(production.strategy) },
    { id: 'runtime_target', label: 'Runtime target', complete: production.targetDurationMin > 0 },
    { id: 'editorial_angle', label: 'Editorial angle', complete: Boolean(production.strategy?.centralQuestion) },
    { id: 'source_verification', label: 'Source verification', complete: production.research?.status === 'source_locked' },
    { id: 'script_approval', label: 'Script approval', complete: production.script?.status === 'approved' },
    { id: 'storyboard_approval', label: 'Storyboard approval', complete: production.strategy?.continuityReport?.status === 'approved' },
    { id: 'audio_generation', label: 'Audio generation', complete: production.audio?.status === 'generated' },
  ];
  return base.map((criterion: any) => {
    if (criterion.id === 'audio_generation') return { ...criterion, complete: production.audio?.status === 'generated' };
    return criterion;
  });
}

function ReadinessChecklist({ production }: { production: Production }) {
  const criteria = readinessCriteria(production);
  const complete = criteria.filter((item: any) => item.complete);
  const pending = criteria.filter((item: any) => !item.complete);
  return <details className="youtube-readiness-details"><summary>Editorial checklist (not required to continue)</summary><p className="youtube-muted">These are production reminders, not locked steps. Source verification, script approval, and audio recording are completed outside this planner. You can review all stages and create an edit project now.</p><div><section><strong>Completed</strong>{complete.map((item: any) => <span key={item.id}>✓ {item.label}</span>)}</section><section><strong>Pending</strong>{pending.map((item: any) => <span key={item.id}>○ {item.label}</span>)}</section></div></details>;
}

function BriefPanel({ production }: { production: Production }) {
  const normalized = production.normalizedTopic || production.strategy?.normalizedTopic || production.research?.normalizedTopic;
  return <div className="youtube-panel-stack">
    {normalized && <section className="glass-card youtube-normalized-topic"><div className="youtube-section-heading"><div><span className="youtube-eyebrow">Normalized story</span><h2>{normalized.title}</h2></div><span className="youtube-status">Structured input</span></div><div className="youtube-normalized-grid"><div><small>Core topic</small><p>{normalized.topic}</p></div><div><small>Hook</small><p>{normalized.hook}</p></div><div><small>Central tension</small><p>{normalized.centralTension}</p></div><div><small>Viewer takeaway</small><p>{normalized.viewerTakeaway}</p></div></div><div className="youtube-chip-row">{normalized.entities?.map((entity: string) => <span key={entity}>{entity}</span>)}</div></section>}
    <section className="glass-card youtube-two-column">
      <div><span className="youtube-eyebrow">Editorial spine</span><h3>{production.strategy?.centralQuestion}</h3><p className="youtube-muted">{production.strategy?.viewerPromise}</p></div>
      <div><span className="youtube-eyebrow">Objective</span><p>{production.strategy?.objective}</p><div className="youtube-chip-row">{production.strategy?.keywords?.map((word: string) => <span key={word}>{word}</span>)}</div></div>
    </section>
    <section className="glass-card"><div className="youtube-section-heading"><div><span className="youtube-eyebrow">Research desk</span><h2>Evidence lanes</h2></div><span className="youtube-warning">Verify sources before publishing</span></div><p className="youtube-muted">{production.research?.disclaimer}</p>
      <div className="youtube-research-grid">{production.research?.angles?.map((angle: any, index: number) => <article key={angle.angle}><span className="youtube-card-number">{String(index + 1).padStart(2, '0')}</span><h3>{angle.angle}</h3><p>{angle.tension}</p><small>Proof target</small><strong>{angle.proof}</strong><ul>{angle.questions?.slice(0, 2).map((q: string) => <li key={q}>{q}</li>)}</ul></article>)}</div>
    </section>
    <section className="glass-card"><span className="youtube-eyebrow">Before publishing</span><h2>Editorial review reminders</h2><p className="youtube-muted">Use these checks during your editorial review. There is no approval button to unlock the next stage.</p><div className="youtube-gates">{production.strategy?.reviewGates?.map((gate: any, index: number) => <div key={gate.stage}><span>{index + 1}</span><div><strong>{gate.stage}</strong><p>{gate.criteria}</p></div></div>)}</div></section>
  </div>;
}

function ScriptPanel({ production }: { production: Production }) {
  return <div className="youtube-panel-stack">
    <section className="glass-card youtube-section-heading"><div><span className="youtube-eyebrow">Writer’s room</span><h2>Timed editorial outline</h2><p className="youtube-muted">Read the draft below to check the story and pacing. Save a copy to write and fact-check your final narration outside this planner, then continue to the storyboard.</p></div><div className="youtube-script-total"><strong>{production.script?.targetWords}</strong><span>words at script lock</span></div></section>
    <section className="youtube-script-list">{production.script?.sections?.map((section: any, index: number) => <article className="glass-card" key={`${section.name}-${index}`}>
      <div className="youtube-script-time"><strong>{section.timecode}</strong><small>{section.wordTarget} words</small></div>
      <div><div className="youtube-section-heading"><h3>{section.name}</h3><span className="youtube-status">{section.draftStatus?.replaceAll('_', ' ')}</span></div><p className="youtube-script-purpose">{section.purpose}</p><p>{section.narration}</p>
      <div className="youtube-editor-note"><strong>Retention</strong><span>{section.retentionDevice}</span></div><div className="youtube-editor-note"><strong>Edit note</strong><span>{section.editorNotes}</span></div></div>
    </article>)}</section>
  </div>;
}

function StoryboardPanel({ production }: { production: Production }) {
  const continuityReport = production.strategy?.continuityReport;
  return <div className="youtube-panel-stack">
    <section className="glass-card youtube-section-heading"><div><span className="youtube-eyebrow">Shot deck</span><h2>{production.storyboard?.length} purposeful shots</h2><p className="youtube-muted">Characters appear only when they advance the story. Thematic, visual, causal, and audio threads connect the remaining shots.</p></div><span className="youtube-warning">{continuityReport?.issues?.length ? `${continuityReport.issues.length} continuity notes` : 'Continuity mapped'}</span></section>
    <section className="youtube-shot-grid">{production.storyboard?.map((scene: any) => <article className="glass-card youtube-shot-card" key={scene.index}>
      <div className="youtube-shot-top"><span>{String(scene.sceneNumber || scene.index + 1).padStart(2, '0')}</span><strong>{scene.timecode}</strong></div>
      <div className="youtube-shot-frame"><span>{scene.shotType || 'Planned shot'}</span><small>{scene.visualThread || scene.storyFunction}</small></div>
      <h3>{scene.chapter}</h3><p>{scene.sceneDescription}</p>
      <dl><div><dt>Story change</dt><dd>{scene.narrativeChange}</dd></div><div><dt>Camera</dt><dd>{scene.cameraDirection}</dd></div><div><dt>Transition</dt><dd>{scene.transition}</dd></div><div><dt>Sound</dt><dd>{scene.audioDirection}</dd></div></dl>
      <details><summary>Continuity contract</summary>
        <p><strong>From previous:</strong> {scene.previousShotSummary}</p>
        <p><strong>Preserve:</strong> {scene.continuityContract?.preserve?.join(' · ')}</p>
        <p><strong>Intentionally change:</strong> {scene.continuityContract?.change?.join(' · ')}</p>
        <p><strong>Set up next:</strong> {scene.nextShotSetup}</p>
        <p className="youtube-muted">Character reference: {scene.referenceRequirements?.characterReference || 'not required'} · Previous frame: {scene.referenceRequirements?.previousFrame ? 'use for this transition' : 'do not require'}</p>
      </details>
      <details><summary>Generation brief</summary><p>{scene.imagePrompt}</p></details>
    </article>)}</section>
    {continuityReport?.issues?.length ? <section className="glass-card"><span className="youtube-eyebrow">Continuity review</span><h3>{continuityReport.status?.replaceAll('_', ' ')}</h3><ul>{continuityReport.issues.map((issue: any, index: number) => <li key={`${issue.code}-${issue.sceneNumber}-${index}`}>Shot {issue.sceneNumber}: {issue.message}</li>)}</ul></section> : null}
  </div>;
}

function DeliveryPanel({ production, wordsPerMinute, setWordsPerMinute, prepare, preparing }: { production: Production; wordsPerMinute: number; setWordsPerMinute: (value: number) => void; prepare: () => void; preparing: boolean }) {
  return <div className="youtube-panel-stack">
    <section className="glass-card youtube-two-column"><div><span className="youtube-eyebrow">Optional ? Narration timing</span><h2>Voice & captions</h2><p className="youtube-muted">Optional: estimate speaking time and draft captions from the current outline. This does not create a voice recording or final video. You can skip this and send your shots to an edit project below.</p></div><div className="youtube-delivery-action"><label className="form-label">Read speed (WPM)<input className="form-input" type="number" min={90} max={210} value={wordsPerMinute} onChange={(e) => setWordsPerMinute(Number(e.target.value))} /></label><button className="btn btn-primary" onClick={prepare} disabled={preparing || !Number.isFinite(wordsPerMinute) || wordsPerMinute < 90 || wordsPerMinute > 210 || !(production.script?.ttsText?.trim() || production.script?.sections?.some((section: any) => section.narration?.trim()))}>{preparing ? 'Preparing…' : production.narration ? 'Rebuild timing package' : 'Prepare timing package'}</button></div></section>
    {(!Number.isFinite(wordsPerMinute) || wordsPerMinute < 90 || wordsPerMinute > 210) && <p role="alert" className="youtube-error">Enter a read speed between 90 and 210 words per minute.</p>}
    {!(production.script?.ttsText?.trim() || production.script?.sections?.some((section: any) => section.narration?.trim())) && <p className="youtube-muted">This outline has no narration text to time. You can still continue to an edit project.</p>}
    {production.narration && <p role="status" className="youtube-muted">Timing package prepared. Review the previews below, then continue to your edit project. Audio has not been generated.</p>}
    {production.narration ? <><section className="glass-card youtube-metrics"><span><strong>{production.narration.totalWords}</strong> current words</span><span><strong>{formatSeconds(production.narration.estimatedDurationSeconds)}</strong> estimated read</span><span><strong>{production.captions?.count || 0}</strong> caption cues</span><span><strong>{production.audio?.status?.replaceAll('_', ' ')}</strong> audio</span></section>
      <section className="youtube-two-column"><article className="glass-card"><span className="youtube-eyebrow">Narration preview</span><textarea className="form-textarea" readOnly rows={14} value={production.narration.ttsText || ''} /></article><article className="glass-card"><span className="youtube-eyebrow">Caption preview</span><pre className="youtube-caption-preview">{production.captions?.srt?.slice(0, 2200)}</pre></article></section></> :
      <section className="glass-card youtube-empty"><h3>No timing package yet</h3><p>Choose Prepare timing package above to preview draft captions and timing, or continue to an edit project below. No approval is needed to continue.</p></section>}
    <section className="glass-card"><span className="youtube-eyebrow">Release desk</span><h2>Packaging concepts</h2><div className="youtube-release-grid"><div><h3>Title directions</h3><ol>{production.seo?.titles?.map((title: string) => <li key={title}>{title}</li>)}</ol></div>{production.thumbnailConcepts?.map((concept: any) => <article key={concept.title}><span>Thumbnail route</span><h3>{concept.title}</h3><p>{concept.composition}</p><small>{concept.prompt}</small></article>)}</div></section>
  </div>;
}
