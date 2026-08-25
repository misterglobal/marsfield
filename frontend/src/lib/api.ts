const API_BASE_URL = '/api/v1';

export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  const existing = localStorage.getItem('marsfield_device_id');
  if (existing) return existing;
  const created = crypto.randomUUID().replace(/-/g, '');
  localStorage.setItem('marsfield_device_id', created);
  return created;
}

async function request(endpoint: string, options: RequestInit = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (typeof window !== 'undefined') {
    headers['X-Device-ID'] = getDeviceId();
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
  forgotPassword: (email: string) => request('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }),
  resetPassword: (token: string, password: string) => request('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  }),
  verifyEmail: (token: string) => request('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  }),
  resendVerification: (email: string) => request('/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
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

  // Guided AI influencer workflow
  getInfluencers: () => request('/influencer/influencers'),
  createInfluencer: (payload: any) => request('/influencer/influencers', { method: 'POST', body: JSON.stringify(payload) }),
  getInfluencerGenerationPrompt: (id: string) => request(`/influencer/influencers/${id}/generation-prompt`),
  approveInfluencer: (id: string, predictionId: string) => request(`/influencer/influencers/${id}/approve`, { method: 'POST', body: JSON.stringify({ prediction_id: predictionId }) }),
  getInfluencerProducts: () => request('/influencer/products'),
  scanInfluencerProductUrl: (url: string) => request('/influencer/products/scan-url', { method: 'POST', body: JSON.stringify({ url }) }),
  createInfluencerProduct: (payload: any) => request('/influencer/products', { method: 'POST', body: JSON.stringify(payload) }),
  getInfluencerProjects: () => request('/influencer/projects'),
  getInfluencerProject: (id: string) => request(`/influencer/projects/${id}`),
  createInfluencerProject: (payload: any) => request('/influencer/projects', { method: 'POST', body: JSON.stringify(payload) }),
  duplicateInfluencerProject: (id: string, title?: string) => request(`/influencer/projects/${id}/duplicate`, { method: 'POST', body: JSON.stringify({ title }) }),
  planInfluencerProject: (id: string, sceneCount?: number) => request(`/influencer/projects/${id}/plan`, { method: 'POST', body: JSON.stringify({ scene_count: sceneCount }) }),
  updateInfluencerScene: (projectId: string, sceneId: string, payload: any) => request(`/influencer/projects/${projectId}/scenes/${sceneId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  addInfluencerScene: (projectId: string, payload: any) => request(`/influencer/projects/${projectId}/scenes`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteInfluencerScene: (projectId: string, sceneId: string) => request(`/influencer/projects/${projectId}/scenes/${sceneId}`, { method: 'DELETE' }),
  duplicateInfluencerScene: (projectId: string, sceneId: string) => request(`/influencer/projects/${projectId}/scenes/${sceneId}/duplicate`, { method: 'POST' }),
  reorderInfluencerScenes: (projectId: string, sceneIds: string[]) => request(`/influencer/projects/${projectId}/scenes/reorder`, { method: 'POST', body: JSON.stringify({ scene_ids: sceneIds }) }),
  rewriteInfluencerScene: (projectId: string, sceneId: string, instruction: string) => request(`/influencer/projects/${projectId}/scenes/${sceneId}/rewrite`, { method: 'POST', body: JSON.stringify({ instruction }) }),
  approveInfluencerScenes: (projectId: string) => request(`/influencer/projects/${projectId}/scenes/approve`, { method: 'POST' }),
  prepareInfluencerStoryboard: (projectId: string, payload: any) => request(`/influencer/projects/${projectId}/storyboards/prepare`, { method: 'POST', body: JSON.stringify(payload) }),
  saveInfluencerStoryboard: (projectId: string, payload: any) => request(`/influencer/projects/${projectId}/storyboards`, { method: 'POST', body: JSON.stringify(payload) }),
  approveInfluencerStoryboard: (projectId: string, storyboardId: string) => request(`/influencer/projects/${projectId}/storyboards/${storyboardId}/approve`, { method: 'POST' }),
  prepareInfluencerVideo: (projectId: string, payload: any) => request(`/influencer/projects/${projectId}/videos/prepare`, { method: 'POST', body: JSON.stringify(payload) }),
  saveInfluencerVideo: (projectId: string, payload: any) => request(`/influencer/projects/${projectId}/videos`, { method: 'POST', body: JSON.stringify(payload) }),
  approveInfluencerVideo: (projectId: string, videoId: string) => request(`/influencer/projects/${projectId}/videos/${videoId}/approve`, { method: 'POST' }),

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
  startPhoneVerification: (phone: string) => request('/account/phone/start', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  }),
  checkPhoneVerification: (phone: string, code: string) => request('/account/phone/check', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  }),
};
