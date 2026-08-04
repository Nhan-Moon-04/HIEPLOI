import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

let cachedPublicIp = sessionStorage.getItem('client_public_ip') || '';

export async function fetchPublicIp() {
  if (cachedPublicIp) return cachedPublicIp;
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    if (data && data.ip) {
      cachedPublicIp = data.ip;
      sessionStorage.setItem('client_public_ip', data.ip);
      return data.ip;
    }
  } catch {
    try {
      const res2 = await fetch('https://icanhazip.com', { signal: AbortSignal.timeout(3000) });
      const text = await res2.text();
      if (text && text.trim()) {
        cachedPublicIp = text.trim();
        sessionStorage.setItem('client_public_ip', cachedPublicIp);
        return cachedPublicIp;
      }
    } catch {
      // ignore
    }
  }
  return '';
}

// Fetch in background immediately
fetchPublicIp();

// Request interceptor - add JWT token & Public IP header
api.interceptors.request.use(async (config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (!cachedPublicIp) {
    await fetchPublicIp();
  }
  if (cachedPublicIp) {
    config.headers['X-Client-Public-IP'] = cachedPublicIp;
  }
  return config;
});

// Response interceptor - handle 401 and format error details
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Format error details if they are structured objects (e.g. 422 validation errors)
    if (error.response?.data?.detail) {
      const detail = error.response.data.detail;
      if (Array.isArray(detail)) {
        error.response.data.detail = detail.map(err => {
          const field = err.loc ? err.loc.filter(l => l !== 'body').join('.') : '';
          return `${field ? field + ': ' : ''}${err.msg}`;
        }).join(', ');
      } else if (typeof detail === 'object') {
        error.response.data.detail = JSON.stringify(detail);
      }
    }

    if (error.response?.status === 401) {
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken && !error.config._retry) {
        error.config._retry = true;
        try {
          const res = await axios.post('/api/auth/refresh', { refresh_token: refreshToken });
          localStorage.setItem('access_token', res.data.access_token);
          localStorage.setItem('refresh_token', res.data.refresh_token);
          error.config.headers.Authorization = `Bearer ${res.data.access_token}`;
          return api(error.config);
        } catch {
          localStorage.clear();
          window.location.href = '/login';
        }
      } else {
        localStorage.clear();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
