import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

if (window.location.hostname !== 'localhost' && API_URL.includes('localhost')) {
  console.warn('⚠️ VITE_API_URL is not set! Frontend will not connect to backend. Set it in your environment.');
}

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token =
    localStorage.getItem('token') ||
    localStorage.getItem('accessToken') ||
    localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function clearAllTokens() {
  ['accessToken', 'refreshToken', 'token', 'authToken'].forEach(k => localStorage.removeItem(k));
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && !original.url?.includes('/auth/login') && !original.url?.includes('/auth/refresh')) {
      original._retry = true;
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
          const newAccess = data.accessToken || data.data?.accessToken;
          const newRefresh = data.refreshToken || data.data?.refreshToken;
          if (newAccess) {
            localStorage.setItem('accessToken', newAccess);
            localStorage.setItem('token', newAccess);
            if (newRefresh) localStorage.setItem('refreshToken', newRefresh);
            original.headers.Authorization = `Bearer ${newAccess}`;
            return api(original);
          }
        } catch {
          clearAllTokens();
          window.location.href = '/login?expired=1';
        }
      } else {
        clearAllTokens();
        window.location.href = '/login?expired=1';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
