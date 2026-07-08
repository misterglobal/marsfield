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
      createdAt: string;
    }>;
  }>;
}

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
                      {scene.predictions?.slice(0, 3).map((prediction) => (
                        prediction.outputUrl ? (
                          <a key={prediction.id} href={prediction.outputUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontSize: '0.8rem' }}>
                            Result {prediction.status === 'succeeded' ? 'ready' : prediction.status}
                          </a>
                        ) : (
                          <span key={prediction.id} className="badge badge-purple">{prediction.status}</span>
                        )
                      ))}
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
