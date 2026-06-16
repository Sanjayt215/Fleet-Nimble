import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const ModeContext = createContext(null);

export function ModeProvider({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = useState(() => {
    const path = location.pathname;
    if (path.startsWith('/demo')) return 'demo';
    if (path.startsWith('/analysis')) return 'live';
    const stored = localStorage.getItem('fleetNimbleMode');
    return stored || 'landing';
  });

  useEffect(() => {
    const path = location.pathname;
    if (path === '/') {
      setMode('landing');
    } else if (path.startsWith('/demo')) {
      setMode('demo');
    } else if (path.startsWith('/analysis')) {
      setMode('live');
    }
  }, [location.pathname]);

  const switchToDemo = () => {
    navigate('/demo');
  };

  const switchToLive = () => {
    navigate('/analysis');
  };

  const returnToLanding = () => {
    navigate('/');
  };

  const value = useMemo(() => ({
    mode,
    isDemo: mode === 'demo',
    isLive: mode === 'live',
    isLanding: mode === 'landing',
    setMode,
    switchToDemo,
    switchToLive,
    returnToLanding,
  }), [mode]);

  useEffect(() => {
    if (mode === 'landing') {
      localStorage.removeItem('fleetNimbleMode');
    } else {
      localStorage.setItem('fleetNimbleMode', mode);
    }
  }, [mode]);

  return (
    <ModeContext.Provider value={value}>
      {children}
    </ModeContext.Provider>
  );
}

export function useMode() {
  const context = useContext(ModeContext);
  if (!context) {
    throw new Error('useMode must be used within a ModeProvider');
  }
  return context;
}
