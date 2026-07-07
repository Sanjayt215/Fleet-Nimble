import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export const AuthContext = createContext(null);

function clearTokens() {
  ['accessToken', 'refreshToken', 'token', 'authToken'].forEach(k => localStorage.removeItem(k));
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  const loadProfile = useCallback(async () => {
    const token =
      localStorage.getItem('token') ||
      localStorage.getItem('accessToken') ||
      localStorage.getItem('authToken');
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/auth/profile');
      setUser(data.data?.user || data.user);
      setSessionExpired(false);
    } catch {
      clearTokens();
      setSessionExpired(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    const accessToken = data.accessToken || data.data?.accessToken;
    const refreshToken = data.refreshToken || data.data?.refreshToken;
    const userData = data.user || data.data?.user;

    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('token', accessToken);
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
    setUser(userData);
    setSessionExpired(false);
    return data.data || data;
  };

  const register = async (name, email, password) => {
    const { data } = await api.post('/auth/register', { name, email, password });
    const accessToken = data.accessToken || data.data?.accessToken;
    const refreshToken = data.refreshToken || data.data?.refreshToken;
    const userData = data.user || data.data?.user;

    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('token', accessToken);
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
    setUser(userData);
    setSessionExpired(false);
    return data.data || data;
  };

  const logout = async () => {
    const rt = localStorage.getItem('refreshToken');
    try {
      await api.post('/auth/logout', { refreshToken: rt });
    } catch { /* ignore */ }
    clearTokens();
    setUser(null);
    setSessionExpired(false);
  };

  const clearSession = useCallback(() => {
    clearTokens();
    setUser(null);
    setSessionExpired(true);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, isAuthenticated: !!user, sessionExpired, clearSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
