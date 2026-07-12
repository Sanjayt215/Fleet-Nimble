import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { TOKEN_KEY, REFRESH_KEY, clearTokens, getAccessToken } from '../services/api';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [authError, setAuthError] = useState(null);

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
    } catch (err) {
      if (err.response?.status === 401) {
        clearTokens();
        setSessionExpired(true);
        setAuthError('Your session expired. Please sign in again.');
      } else {
        setAuthError(err.response?.data?.message || 'Failed to load profile');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const storeTokens = (accessToken, refreshToken, userData) => {
    if (accessToken) localStorage.setItem(TOKEN_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
    setUser(userData);
    setSessionExpired(false);
    setAuthError(null);
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
    const rt = localStorage.getItem(REFRESH_KEY);
    try {
      await api.post('/auth/logout', { refreshToken: rt });
    } catch { /* ignore */ }
    clearTokens();
    setUser(null);
    setSessionExpired(false);
    setAuthError(null);
  };

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
