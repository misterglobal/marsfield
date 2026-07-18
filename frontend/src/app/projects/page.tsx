'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '../layout';

interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
  _count: {
    assets: number;
    predictions: number;
    scenes: number;
  };
}

interface ProjectDetail extends ProjectSummary {
  scenes: Array<{
    id: string;
    index: number;
    title: string | null;
    prompt: string | null;
    notes: string | null;
    durationSeconds: number | null;
    predictions: Array<{
      id: string;
      status: string;
      outputUrl: string | null;
      model: string;
      workflow?: string | null;
      prompt?: string | null;
      createdAt: string;
      assets?: Array<{
        id: string;
        url: string;
        type: string;
        thumbnailUrl: string | null;
        storageObjectId: string | null;
      }>;
    }>;
  }>;
}

interface TimelineAsset {
  id: string;
  url: string;
  type: string;
  thumbnailUrl: string | null;
  storageObjectId: string | null;
  prediction?: { prompt?: string | null; workflow?: string | null; model?: string | null } | null;
}

interface TimelineClip {
  assetId: string;
  label: string;
  startSeconds: number;
  endSeconds: string;
}

type StoryboardScene = ProjectDetail['scenes'][number];
type StoryboardPrediction = StoryboardScene['predictions'][number];

export default function ProjectsPage() {
  const { token } = useAuth();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectDetail | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sceneTitle, setSceneTitle] = useState('');
  const [scenePrompt, setScenePrompt] = useState('');
  const [editingSceneIndex, setEditingSceneIndex] = useState<number | null>(null);
  const [script, setScript] = useState('');
  const [sceneCount, setSceneCount] = useState(6);
  const [totalDuration, setTotalDuration] = useState(30);
  const [visualStyle, setVisualStyle] = useState('cinematic realism');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [continuity, setContinuity] = useState('');
  const [timelineAssets, setTimelineAssets] = useState<TimelineAsset[]>([]);
  const [timelineClips, setTimelineClips] = useState<TimelineClip[]>([]);
  const [timelineTitle, setTimelineTitle] = useState('Final timeline export');
  const [timelineExporting, setTimelineExporting] = useState(false);
  const [timelineResultUrl, setTimelineResultUrl] = useState('');
  const [planning, setPlanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadProjects = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.getProjects();
      setProjects(data);
      if (!selectedProject && data[0]) {
        setSelectedProject(await api.getProject(data[0].id));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [token, selectedProject]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const createProject = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setError('');
    try {
      const project = await api.createProject({ name, description });
      setName('');
      setDescription('');
      setProjects((current) => [project, ...current]);
      setSelectedProject(await api.getProject(project.id));
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    }
  };

  const selectProject = async (projectId: string) => {
    setError('');
    try {
      setSelectedProject(await api.getProject(projectId));
    } catch (err: any) {
      setError(err.message || 'Failed to load project');
    }
  };

  const loadTimelineAssets = useCallback(async (projectId: string) => {
    try {
      const assets = await api.getAssets(projectId);
      setTimelineAssets(assets.filter((asset: TimelineAsset) => asset.type === 'video' && asset.storageObjectId));
    } catch (err: any) {
      setError(err.message || 'Failed to load project video assets');
    }
  }, []);

  useEffect(() => {
    if (!token || !selectedProject) {
      setTimelineAssets([]);
      setTimelineClips([]);
      return;
    }
    void loadTimelineAssets(selectedProject.id);
    setTimelineClips([]);
    setTimelineResultUrl('');
  }, [token, selectedProject?.id, loadTimelineAssets]);

  const addTimelineClip = (asset: TimelineAsset) => {
    setTimelineClips((current) => [...current, {
      assetId: asset.id,
      label: asset.prediction?.prompt?.slice(0, 36) || `Clip ${current.length + 1}`,
      startSeconds: 0,
      endSeconds: '',
    }]);
  };

  const scenePredictionToTimelineClip = (scene: StoryboardScene, prediction: StoryboardPrediction): TimelineClip | null => {
    const videoAsset = prediction.assets?.find((asset) => asset.type === 'video' && asset.storageObjectId);
    if (!videoAsset) return null;

    return {
      assetId: videoAsset.id,
      label: `${scene.title || `Scene ${scene.index + 1}`} result`,
      startSeconds: 0,
      endSeconds: '',
    };
  };

  const storyboardReadyClips = selectedProject?.scenes
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((scene) => {
      const readyPrediction = scene.predictions.find((prediction) => prediction.status === 'succeeded' && scenePredictionToTimelineClip(scene, prediction));
      return readyPrediction ? scenePredictionToTimelineClip(scene, readyPrediction) : null;
    })
    .filter((clip): clip is TimelineClip => Boolean(clip)) ?? [];

  const addStoryboardResultsToTimeline = () => {
    if (!selectedProject || storyboardReadyClips.length === 0) return;
    setTimelineTitle(`${selectedProject.name} final cut`);
    setTimelineClips(storyboardReadyClips);
    setTimelineResultUrl('');
  };

  const moveTimelineClip = (index: number, direction: -1 | 1) => {
    setTimelineClips((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const updateTimelineClip = (index: number, patch: Partial<TimelineClip>) => {
    setTimelineClips((current) => current.map((clip, clipIndex) => clipIndex === index ? { ...clip, ...patch } : clip));
  };

  const exportTimeline = async () => {
    if (!selectedProject || timelineClips.length === 0) return;
    setTimelineExporting(true);
    setTimelineResultUrl('');
    setError('');
    try {
      const payload = {
        title: timelineTitle,
        clips: timelineClips.map((clip) => ({
          asset_id: clip.assetId,
          start_seconds: Number(clip.startSeconds || 0),
          end_seconds: clip.endSeconds === '' ? undefined : Number(clip.endSeconds),
        })),
      };
      const result = await api.exportTimeline(selectedProject.id, payload);
      let outputUrl = result.output_url || '';
      if (!outputUrl && result.id) {
        for (let attempt = 0; attempt < 120; attempt++) {
          const status = await api.getPrediction(result.id);
          if (status.status === 'succeeded' && status.output_url) {
            outputUrl = status.output_url;
            break;
          }
          if (status.status === 'failed') throw new Error(status.error || 'Timeline export failed');
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
      if (!outputUrl) throw new Error('Timeline export is taking longer than expected. Check the Asset Library shortly.');
      setTimelineResultUrl(outputUrl);
      setSelectedProject(await api.getProject(selectedProject.id));
      await loadTimelineAssets(selectedProject.id);
      await loadProjects();
    } catch (err: any) {
      setError(err.message || 'Failed exporting timeline');
    } finally {
      setTimelineExporting(false);
    }
  };

  const addScene = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProject || !scenePrompt.trim()) return;

    const nextIndex = editingSceneIndex ?? (selectedProject.scenes.length
      ? Math.max(...selectedProject.scenes.map((scene) => scene.index)) + 1
      : 0);

    try {
      await api.saveStoryboardScene(selectedProject.id, {
        index: nextIndex,
        title: sceneTitle || `Scene ${nextIndex + 1}`,
        prompt: scenePrompt,
      });
      setSceneTitle('');
      setScenePrompt('');
      setEditingSceneIndex(null);
      setSelectedProject(await api.getProject(selectedProject.id));
      await loadProjects();
    } catch (err: any) {
      setError(err.message || 'Failed to save storyboard scene');
    }
  };

  const createPlan = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProject || script.trim().length < 20) return;
    const replaceExisting = selectedProject.scenes.length > 0;
    if (replaceExisting && !window.confirm('Replace the existing storyboard scenes with this new script plan? Existing scene generations remain in your account, but their storyboard links will be removed.')) return;

    setPlanning(true);
    setError('');
    try {
      await api.createStoryboardPlan(selectedProject.id, {
        script,
        scene_count: sceneCount,
        total_duration_seconds: totalDuration,
        visual_style: visualStyle,
        aspect_ratio: aspectRatio,
        continuity,
        replace_existing: replaceExisting,
      });
      setSelectedProject(await api.getProject(selectedProject.id));
      await loadProjects();
    } catch (err: any) {
      setError(err.message || 'Failed to create storyboard plan');
    } finally {
      setPlanning(false);
    }
  };

  const editScene = (scene: ProjectDetail['scenes'][number]) => {
    setEditingSceneIndex(scene.index);
    setSceneTitle(scene.title || '');
    setScenePrompt(scene.prompt || '');
  };

  if (!token) {
    return (
      <div className="glass-card" style={{ padding: '4rem', textAlign: 'center' }}>
        Sign in to create projects and storyboards.
      </div>
    );
  }

  return (
    <div className="projects-layout" style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '2rem' }}>
      <aside className="projects-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <form className="glass-card" onSubmit={createProject} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>New Project</h3>
          <input className="form-input" placeholder="Project name" value={name} onChange={(event) => setName(event.target.value)} />
          <textarea className="form-textarea" rows={3} placeholder="Optional description" value={description} onChange={(event) => setDescription(event.target.value)} />
          <button className="btn btn-primary" type="submit">Create Project</button>
        </form>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', padding: '0.75rem', borderRadius: '8px', color: '#ef4444', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Projects</h3>
          {loading && <span style={{ color: 'var(--foreground-muted)', fontSize: '0.85rem' }}>Loading...</span>}
          {projects.map((project) => (
            <button
              key={project.id}
              className={`btn ${selectedProject?.id === project.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => void selectProject(project.id)}
              style={{ display: 'block', textAlign: 'left', padding: '0.8rem' }}
            >
              <strong>{project.name}</strong>
              <span style={{ display: 'block', marginTop: '0.3rem', fontSize: '0.75rem', color: 'var(--foreground-muted)' }}>
                {project._count.scenes} scenes · {project._count.assets} assets
              </span>
            </button>
          ))}
          {!loading && projects.length === 0 && (
            <span style={{ color: 'var(--foreground-muted)', fontSize: '0.85rem' }}>No projects yet.</span>
          )}
        </div>
      </aside>

      <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {selectedProject ? (
          <>
            <div className="glass-card">
              <h2 style={{ margin: 0 }}>{selectedProject.name}</h2>
              <p style={{ color: 'var(--foreground-muted)' }}>{selectedProject.description || 'No description yet.'}</p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span className="badge badge-purple">{selectedProject._count.scenes} storyboard scenes</span>
                <span className="badge badge-purple">{selectedProject._count.predictions} generations</span>
                <span className="badge badge-purple">{selectedProject._count.assets} assets</span>
              </div>
            </div>

            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Timeline editor v1</h3>
                <p style={{ margin: '0.35rem 0 0', color: 'var(--foreground-muted)', fontSize: '0.82rem' }}>
                  Add project video assets, reorder them, trim start/end, and export a final silent 1080p MP4. Audio tools come next.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 180px 220px', gap: '0.75rem' }}>
                <input className="form-input" aria-label="Timeline title" value={timelineTitle} onChange={(event) => setTimelineTitle(event.target.value)} placeholder="Timeline export title" />
                <button className="btn btn-secondary" type="button" onClick={() => selectedProject && void loadTimelineAssets(selectedProject.id)}>
                  Refresh assets
                </button>
                <button className="btn btn-secondary" type="button" onClick={addStoryboardResultsToTimeline} disabled={storyboardReadyClips.length === 0}>
                  Add storyboard results
                </button>
              </div>
              {storyboardReadyClips.length > 0 && (
                <p style={{ margin: '-0.45rem 0 0', color: 'var(--foreground-muted)', fontSize: '0.8rem' }}>
                  {storyboardReadyClips.length} generated scene result{storyboardReadyClips.length === 1 ? '' : 's'} can be assembled in storyboard order.
                </p>
              )}

              {timelineAssets.length > 0 ? (
                <div style={{ display: 'flex', gap: '0.6rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                  {timelineAssets.slice(0, 16).map((asset) => (
                    <button key={asset.id} type="button" className="btn btn-secondary" onClick={() => addTimelineClip(asset)} style={{ minWidth: 150, padding: '0.7rem', textAlign: 'left' }}>
                      <span style={{ display: 'block', fontWeight: 700 }}>Add clip</span>
                      <small style={{ color: 'var(--foreground-muted)' }}>{asset.prediction?.prompt?.slice(0, 34) || asset.id.slice(0, 8)}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, color: 'var(--foreground-muted)', fontSize: '0.82rem' }}>
                  No project video assets yet. Generate storyboard scenes in Studio, then refresh assets here.
                </p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {timelineClips.map((clip, index) => (
                  <div key={`${clip.assetId}-${index}`} className="timeline-clip-row" style={{ display: 'grid', gridTemplateColumns: '44px 1fr 110px 110px 170px', gap: '0.65rem', alignItems: 'center', padding: '0.75rem', border: '1px solid var(--panel-border)', borderRadius: '12px' }}>
                    <strong>{index + 1}</strong>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clip.label}</span>
                    <input className="form-input" aria-label={`Clip ${index + 1} start`} type="number" min={0} step={0.1} value={clip.startSeconds} onChange={(event) => updateTimelineClip(index, { startSeconds: Number(event.target.value) })} />
                    <input className="form-input" aria-label={`Clip ${index + 1} end`} type="number" min={0} step={0.1} placeholder="End" value={clip.endSeconds} onChange={(event) => updateTimelineClip(index, { endSeconds: event.target.value })} />
                    <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                      <button className="btn btn-secondary" type="button" onClick={() => moveTimelineClip(index, -1)} disabled={index === 0} style={{ padding: '0.45rem 0.6rem' }}>Up</button>
                      <button className="btn btn-secondary" type="button" onClick={() => moveTimelineClip(index, 1)} disabled={index === timelineClips.length - 1} style={{ padding: '0.45rem 0.6rem' }}>Down</button>
                      <button className="btn btn-secondary" type="button" onClick={() => setTimelineClips((current) => current.filter((_, clipIndex) => clipIndex !== index))} style={{ padding: '0.45rem 0.6rem' }}>Remove</button>
                    </div>
                  </div>
                ))}
                {timelineClips.length === 0 && (
                  <div style={{ border: '1px dashed var(--panel-border)', borderRadius: '12px', padding: '1rem', color: 'var(--foreground-muted)', fontSize: '0.85rem' }}>
                    Add clips above to build a timeline.
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--foreground-muted)', fontSize: '0.8rem' }}>{timelineClips.length} clip{timelineClips.length === 1 ? '' : 's'} · 0 credits</span>
                <button className="btn btn-primary" type="button" onClick={() => void exportTimeline()} disabled={timelineExporting || timelineClips.length === 0}>
                  {timelineExporting ? 'Exporting timeline...' : 'Export final video'}
                </button>
              </div>
              {timelineResultUrl && (
                <a href={timelineResultUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontSize: '0.85rem' }}>
                  Timeline export ready — open video
                </a>
              )}
            </div>

            <form className="glass-card" onSubmit={createPlan} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Script-to-film planner</h3>
                <p style={{ margin: '0.35rem 0 0', color: 'var(--foreground-muted)', fontSize: '0.82rem' }}>
                  Turn a script into an editable shot plan. Planning is free; credits are only charged when you generate a scene.
                </p>
              </div>
              <textarea
                className="form-textarea"
                rows={9}
                maxLength={20000}
                placeholder="Paste a screenplay, narration, ad concept, or scene outline..."
                value={script}
                onChange={(event) => setScript(event.target.value)}
              />
              <div className="storyboard-plan-controls" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.75rem' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--foreground-muted)' }}>
                  Scenes
                  <input className="form-input" type="number" min={2} max={20} value={sceneCount} onChange={(event) => setSceneCount(Number(event.target.value))} style={{ marginTop: '0.35rem' }} />
                </label>
                <label style={{ fontSize: '0.78rem', color: 'var(--foreground-muted)' }}>
                  Total seconds
                  <input className="form-input" type="number" min={sceneCount} max={300} value={totalDuration} onChange={(event) => setTotalDuration(Number(event.target.value))} style={{ marginTop: '0.35rem' }} />
                </label>
                <label style={{ fontSize: '0.78rem', color: 'var(--foreground-muted)' }}>
                  Frame
                  <select className="form-select" value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)} style={{ marginTop: '0.35rem' }}>
                    <option value="16:9">16:9 landscape</option>
                    <option value="9:16">9:16 vertical</option>
                    <option value="1:1">1:1 square</option>
                    <option value="21:9">21:9 cinematic</option>
                  </select>
                </label>
                <label style={{ fontSize: '0.78rem', color: 'var(--foreground-muted)' }}>
                  Visual style
                  <select className="form-select" value={visualStyle} onChange={(event) => setVisualStyle(event.target.value)} style={{ marginTop: '0.35rem' }}>
                    <option value="cinematic realism">Cinematic realism</option>
                    <option value="premium commercial photography">Premium commercial</option>
                    <option value="stylized 3D animation">Stylized 3D</option>
                    <option value="hand-drawn graphic novel">Graphic novel</option>
                    <option value="documentary naturalism">Documentary</option>
                  </select>
                </label>
              </div>
              <input className="form-input" placeholder="Continuity brief: character appearance, wardrobe, location, palette..." value={continuity} onChange={(event) => setContinuity(event.target.value)} maxLength={1000} />
              <button className="btn btn-primary" type="submit" disabled={planning || script.trim().length < 20}>
                {planning ? 'Planning scenes...' : selectedProject.scenes.length ? 'Replace with script plan' : 'Create storyboard plan'}
              </button>
            </form>

            <form className="glass-card" onSubmit={addScene} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>{editingSceneIndex === null ? 'Add Storyboard Scene' : `Edit Scene ${editingSceneIndex + 1}`}</h3>
              <input className="form-input" placeholder="Scene title" value={sceneTitle} onChange={(event) => setSceneTitle(event.target.value)} />
              <textarea className="form-textarea" rows={4} placeholder="Describe the shot, action, camera, dialogue, and mood..." value={scenePrompt} onChange={(event) => setScenePrompt(event.target.value)} />
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-primary" type="submit">Save Scene</button>
                {editingSceneIndex !== null && <button className="btn btn-secondary" type="button" onClick={() => { setEditingSceneIndex(null); setSceneTitle(''); setScenePrompt(''); }}>Cancel</button>}
              </div>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {selectedProject.scenes.map((scene) => (
                <article key={scene.id} className="glass-card storyboard-scene" style={{ display: 'grid', gridTemplateColumns: '56px 1fr', gap: '1rem' }}>
                  <div style={{ width: 44, height: 44, borderRadius: '14px', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                    {scene.index + 1}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1rem' }}>{scene.title || `Scene ${scene.index + 1}`}</h3>
                    <p style={{ color: 'var(--foreground-muted)', fontSize: '0.9rem', marginBottom: 0 }}>{scene.prompt}</p>
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <a
                        href={`/?project_id=${encodeURIComponent(selectedProject.id)}&scene_id=${encodeURIComponent(scene.id)}`}
                        className="btn btn-primary"
                        style={{ textDecoration: 'none', padding: '0.55rem 0.9rem', fontSize: '0.8rem' }}
                      >
                        Generate in Studio
                      </a>
                      <button className="btn btn-secondary" type="button" onClick={() => editScene(scene)} style={{ padding: '0.55rem 0.9rem', fontSize: '0.8rem' }}>
                        Edit scene
                      </button>
                      {scene.predictions?.slice(0, 3).map((prediction) => {
                        const clip = scenePredictionToTimelineClip(scene, prediction);
                        return (
                          <div key={prediction.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            {prediction.outputUrl ? (
                              <a href={prediction.outputUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontSize: '0.8rem' }}>
                                Result {prediction.status === 'succeeded' ? 'ready' : prediction.status}
                              </a>
                            ) : (
                              <span className="badge badge-purple">{prediction.status}</span>
                            )}
                            {clip && (
                              <button className="btn btn-secondary" type="button" onClick={() => setTimelineClips((current) => [...current, clip])} style={{ padding: '0.45rem 0.7rem', fontSize: '0.78rem' }}>
                                Add to timeline
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </article>
              ))}
              {selectedProject.scenes.length === 0 && (
                <div className="glass-card" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--foreground-muted)' }}>
                  Build your storyboard scene by scene, then generate each shot from the Studio.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="glass-card" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--foreground-muted)' }}>
            Create or select a project to start storyboarding.
          </div>
        )}
      </section>
    </div>
  );
}
