import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

if (window.location.hostname !== 'localhost' && API_URL.includes('localhost')) {
  console.warn('⚠️ VITE_API_URL is not set! Frontend will not connect to backend. Set it in your environment.');
}

const TOKEN_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';

let isRefreshing = false;
let failedQueue = [];

function processQueue(error, token = null) {
  const queue = failedQueue.slice();
  failedQueue = [];
  queue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
}

function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const errCode = error.response?.data?.code || error.response?.data?.error?.code;

    const isTokenExpired = error.response?.status === 401 && errCode === 'ACCESS_TOKEN_EXPIRED';
    const isGeneric401 = error.response?.status === 401 && !errCode;

    if (
      (isTokenExpired || isGeneric401) &&
      !original._retry &&
      !original.url?.includes('/auth/login') &&
      !original.url?.includes('/auth/register') &&
      !original.url?.includes('/auth/refresh') &&
      !original.url?.includes('/auth/logout')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
      }

      original._retry = true;
      isRefreshing = true;

      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        clearTokens();
        processQueue(new Error('No refresh token'));
        window.dispatchEvent(new CustomEvent('auth:sessionExpired'));
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
        const newAccess = data.accessToken || data.data?.accessToken;
        const newRefresh = data.refreshToken || data.data?.refreshToken;

        if (!newAccess) {
          throw new Error('No access token in refresh response');
        }

        localStorage.setItem(TOKEN_KEY, newAccess);
        if (newRefresh) {
          localStorage.setItem(REFRESH_KEY, newRefresh);
        }

        processQueue(null, newAccess);
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api(original);
      } catch (refreshError) {
        clearTokens();
        processQueue(refreshError);
        window.dispatchEvent(new CustomEvent('auth:sessionExpired'));
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (error.response?.status === 401 && errCode === 'INVALID_ACCESS_TOKEN') {
      clearTokens();
      window.dispatchEvent(new CustomEvent('auth:sessionExpired'));
    }

    return Promise.reject(error);
  }
);

export { TOKEN_KEY, REFRESH_KEY, getAccessToken, getRefreshToken, clearTokens };
export default api;
