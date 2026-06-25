const API_BASE_URL = 'http://localhost:3001/api/v1';

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

  return response.json();
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

  // Assets
  getAssets: () => request('/assets'),
  toggleFavorite: (id: string) => request(`/assets/${id}/favorite`, {
    method: 'POST',
  }),
};
