import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { TOKEN_KEY, REFRESH_KEY, clearTokens, getAccessToken, getRefreshToken } from '../services/api';
import { resetSocket, updateSocketAuth } from '../services/socket';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [authError, setAuthError] = useState(null);

  const goToLogin = useCallback((reason) => {
    clearTokens();
    resetSocket();
    setUser(null);
    setSessionExpired(true);
    setAuthError(reason || 'Your session expired. Please sign in again.');
    setLoading(false);
    setTimeout(() => {
      window.location.href = '/login?expired=1';
    }, 100);
  }, []);

  const loadProfile = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/auth/profile');
      setUser(data.data?.user || data.user);
      setSessionExpired(false);
      setAuthError(null);
      setLoading(false);
    } catch (err) {
      const errCode = err.response?.data?.code || err.response?.data?.error?.code;
      if (err.response?.status === 401 && (errCode === 'ACCESS_TOKEN_EXPIRED' || !errCode)) {
        const rt = getRefreshToken();
        if (!rt) {
          goToLogin('No refresh token available.');
          return;
        }
        try {
          const { data: refreshData } = await api.post('/auth/refresh', { refreshToken: rt });
          const newAccess = refreshData.accessToken || refreshData.data?.accessToken;
          const newRefresh = refreshData.refreshToken || refreshData.data?.refreshToken;
          if (newAccess) {
            localStorage.setItem(TOKEN_KEY, newAccess);
            if (newRefresh) localStorage.setItem(REFRESH_KEY, newRefresh);
            updateSocketAuth();
            const { data: profileData } = await api.get('/auth/profile');
            setUser(profileData.data?.user || profileData.user);
            setSessionExpired(false);
            setAuthError(null);
          }
        } catch (refreshErr) {
          goToLogin('Session expired. Please sign in again.');
          return;
        }
      } else if (err.response?.status === 401 && errCode === 'INVALID_ACCESS_TOKEN') {
        goToLogin('Invalid session. Please sign in again.');
        return;
      } else {
        setAuthError(err.response?.data?.message || 'Failed to load profile');
      }
      setLoading(false);
    }
  }, [goToLogin]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const handler = () => {
      goToLogin('Your session expired. Please sign in again.');
    };
    window.addEventListener('auth:sessionExpired', handler);
    return () => window.removeEventListener('auth:sessionExpired', handler);
  }, [goToLogin]);

  const storeTokens = (accessToken, refreshToken, userData) => {
    if (accessToken) localStorage.setItem(TOKEN_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
    updateSocketAuth();
    setUser(userData);
    setSessionExpired(false);
    setAuthError(null);
    setLoading(false);
  };

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    const accessToken = data.accessToken || data.data?.accessToken;
    const refreshToken = data.refreshToken || data.data?.refreshToken;
    const userData = data.user || data.data?.user;
    storeTokens(accessToken, refreshToken, userData);
    return data.data || data;
  };

  const register = async (name, email, password) => {
    const { data } = await api.post('/auth/register', { name, email, password });
    const accessToken = data.accessToken || data.data?.accessToken;
    const refreshToken = data.refreshToken || data.data?.refreshToken;
    const userData = data.user || data.data?.user;
    storeTokens(accessToken, refreshToken, userData);
    return data.data || data;
  };

  const logout = async () => {
    const rt = getRefreshToken();
    try {
      await api.post('/auth/logout', { refreshToken: rt });
    } catch { /* ignore */ }
    clearTokens();
    resetSocket();
    setUser(null);
    setSessionExpired(false);
    setAuthError(null);
  };

  const refreshSession = useCallback(async () => {
    const rt = getRefreshToken();
    if (!rt) return false;
    try {
      const { data } = await api.post('/auth/refresh', { refreshToken: rt });
      const newAccess = data.accessToken || data.data?.accessToken;
      const newRefresh = data.refreshToken || data.data?.refreshToken;
      if (!newAccess) return false;
      localStorage.setItem(TOKEN_KEY, newAccess);
      if (newRefresh) localStorage.setItem(REFRESH_KEY, newRefresh);
      updateSocketAuth();
      return true;
    } catch {
      return false;
    }
  }, []);

  const clearSession = useCallback(() => {
    clearTokens();
    setUser(null);
    setSessionExpired(true);
    setAuthError('Your session expired. Please sign in again.');
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      register,
      logout,
      refreshSession,
      isAuthenticated: !!user,
      isAuthLoading: loading,
      sessionExpired,
      authError,
      clearSession,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
