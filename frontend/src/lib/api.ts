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

  uploadFile: (file: File, purpose = 'generation-reference', onProgress?: (percent: number) => void) => new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/uploads`);
    const token = localStorage.getItem('token');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      let data: any = {};
      try { data = xhr.responseText ? JSON.parse(xhr.responseText) : {}; } catch { /* use generic error */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || `Upload failed with status ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Upload failed due to a network error'));
    const body = new FormData();
    body.append('file', file);
    body.append('purpose', purpose);
    xhr.send(body);
  }),

  // Assets
  getAssets: (projectId?: string) => request(projectId ? `/assets?project_id=${encodeURIComponent(projectId)}` : '/assets'),
  toggleFavorite: (id: string) => request(`/assets/${id}/favorite`, {
    method: 'POST',
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
