const API_BASE_URL = '/api/v1';

async function request(endpoint: string, options: RequestInit = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  // Auth
  login: (credentials: any) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  }),
  register: (data: any) => request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // Predictions
  generate: (payload: any) => request('/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  getPrediction: (id: string) => request(`/predictions/${id}`),

  uploadFile: async (file: File, purpose = 'generation-reference', onProgress?: (percent: number) => void) => {
    const prepared = await request('/uploads/presign', {
      method: 'POST',
      body: JSON.stringify({
        name: file.name,
        mime_type: file.type,
        byte_size: file.size,
        purpose,
      }),
    });

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', prepared.upload_url);
      Object.entries(prepared.headers || {}).forEach(([name, value]) => xhr.setRequestHeader(name, String(value)));
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 95));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Direct storage upload failed with status ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('Direct storage upload failed. Check the R2 bucket CORS policy.'));
      xhr.send(file);
    });

    onProgress?.(98);
    const completed = await request('/uploads/complete', {
      method: 'POST',
      body: JSON.stringify({ id: prepared.id }),
    });
    onProgress?.(100);
    return completed;
  },

  // Assets
  getAssets: (projectId?: string) => request(projectId ? `/assets?project_id=${encodeURIComponent(projectId)}` : '/assets'),
  toggleFavorite: (id: string) => request(`/assets/${id}/favorite`, {
    method: 'POST',
  }),
  getVideoPackagingIdeas: (id: string, payload: any = {}) => request(`/assets/${id}/packaging/ideas`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  createVideoThumbnailStills: (id: string, payload: any = {}) => request(`/assets/${id}/packaging/thumbnails`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  createTitleOverlay: (id: string, payload: any) => request(`/assets/${id}/packaging/title-overlay`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  quoteGeneration: (payload: any) => request('/generate/quote', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),

  // Projects / storyboards
  getProjects: () => request('/projects'),
  getProject: (id: string) => request(`/projects/${id}`),
  createProject: (payload: any) => request('/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  saveStoryboardScene: (projectId: string, payload: any) => request(`/projects/${projectId}/storyboard-scenes`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  createStoryboardPlan: (projectId: string, payload: any) => request(`/projects/${projectId}/storyboard-plan`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  exportTimeline: (projectId: string, payload: any) => request(`/projects/${projectId}/timeline-export`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),

  // YouTube dry-run production planner
  getYoutubeProductions: () => request('/youtube/productions'),
  getYoutubeProduction: (id: string) => request(`/youtube/productions/${id}`),
  createYoutubeProduction: (payload: any) => request('/youtube/productions', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  createProjectFromYoutubeProduction: (id: string) => request(`/youtube/productions/${id}/create-project`, {
    method: 'POST',
  }),
  createYoutubeNarrationPackage: (id: string, payload: any) => request(`/youtube/productions/${id}/narration-package`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),

  // Reusable character and brand kits
  getKits: () => request('/kits'),
  createKit: (payload: any) => request('/kits', { method: 'POST', body: JSON.stringify(payload) }),
  updateKit: (id: string, payload: any) => request(`/kits/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteKit: (id: string) => request(`/kits/${id}`, { method: 'DELETE' }),

  // Feedback
  submitFeedback: (payload: any) => request('/feedback', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),

  // Account
  getUsage: () => request('/account/usage'),
  getPlans: () => request('/account/plans'),
  createCheckout: (payload: any) => request('/account/billing/checkout', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  getApiKeys: () => request('/account/api-keys'),
  createApiKey: (payload: any) => request('/account/api-keys', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  deleteApiKey: (id: string) => request(`/account/api-keys/${id}`, {
    method: 'DELETE',
  }),
};
