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

    const nextIndex = selectedProject.scenes.length
      ? Math.max(...selectedProject.scenes.map((scene) => scene.index)) + 1
      : 0;

    try {
      await api.saveStoryboardScene(selectedProject.id, {
        index: nextIndex,
        title: sceneTitle || `Scene ${nextIndex + 1}`,
        prompt: scenePrompt,
      });
      setSceneTitle('');
      setScenePrompt('');
      setSelectedProject(await api.getProject(selectedProject.id));
      await loadProjects();
    } catch (err: any) {
      setError(err.message || 'Failed to save storyboard scene');
    }
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

            <form className="glass-card" onSubmit={addScene} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Add Storyboard Scene</h3>
              <input className="form-input" placeholder="Scene title" value={sceneTitle} onChange={(event) => setSceneTitle(event.target.value)} />
              <textarea className="form-textarea" rows={4} placeholder="Describe the shot, action, camera, dialogue, and mood..." value={scenePrompt} onChange={(event) => setScenePrompt(event.target.value)} />
              <button className="btn btn-primary" type="submit">Save Scene</button>
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
