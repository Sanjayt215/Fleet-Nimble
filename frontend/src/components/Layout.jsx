import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useMode } from '../context/ModeContext';

/** Approved production nav (8 modules) + settings/admin */
const getNav = (basePath) => [
  { to: basePath, label: 'Dashboard', icon: '📊' },
  { to: `${basePath}/vehicles`, label: 'Vehicles', icon: '🚗' },
  { to: `${basePath}/gps-tracking`, label: 'GPS Tracking', icon: '🗺️' },
  { to: `${basePath}/diagnostics`, label: 'Live Diagnostics', icon: '🔧' },
  { to: `${basePath}/dtc`, label: 'DTC Codes', icon: '⚠️' },
  { to: `${basePath}/fuel`, label: 'Fuel Management', icon: '⛽' },
  { to: `${basePath}/maintenance`, label: 'Maintenance', icon: '🔩' },
  { to: `${basePath}/drivers`, label: 'Drivers', icon: '👤' },
  { to: `${basePath}/reports`, label: 'Reports & Alerts', icon: '📈' },
  { to: `${basePath}/ai-assistant`, label: 'AI Assistant', icon: '🤖' },
  { to: `${basePath}/ai-receptionist`, label: 'AI Receptionist', icon: '📞' },
  { to: `${basePath}/fleet-brain`, label: 'Fleet Brain', icon: '🧠' },
  { to: `${basePath}/settings`, label: 'Settings', icon: '⚙️' },
  { to: `${basePath}/admin`, label: 'Admin', icon: '🛡️', adminOnly: true },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { isDemo, isLive, returnToLanding } = useMode();
  const navigate = useNavigate();
  const location = useLocation();

  const [basePath, setBasePath] = useState('/demo');

  useEffect(() => {
    if (location.pathname.startsWith('/demo')) {
      setBasePath('/demo');
    } else if (location.pathname.startsWith('/analysis')) {
      setBasePath('/analysis');
    }
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const nav = getNav(basePath);
  const filteredNav = nav.filter((n) => !n.adminOnly || user?.role?.name === 'ADMIN');

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-slate-800 bg-slate-950 text-white">
        <div className="flex h-16 items-center gap-2 border-b border-slate-800 px-6">
          <span className="text-xl font-bold text-cyan-400">FleetNimble</span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {filteredNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-800 p-4">
          <p className="truncate text-sm font-medium text-white">{user?.name}</p>
          <p className="truncate text-xs text-slate-400">{user?.email}</p>
        </div>
      </aside>

      <div className="ml-64 flex flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-col gap-3 border-b border-slate-800 bg-slate-950/80 px-8 py-3 backdrop-blur">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-white">FleetNimble Dashboard</h1>
            <div className="flex items-center gap-4">
              <span className="rounded-full bg-cyan-900/50 px-3 py-1 text-xs font-medium text-cyan-200">
                {user?.role?.name}
              </span>
              <button type="button" onClick={handleLogout} className="btn-secondary bg-slate-800 text-white border-slate-700">
                Logout
              </button>
            </div>
          </div>
          {isDemo && (
            <div className="flex flex-wrap items-center justify-between rounded-3xl border border-cyan-400/30 bg-slate-900/80 px-4 py-3 text-sm text-cyan-100 shadow-inner">
              <span className="font-semibold">DEMO MODE ACTIVE</span>
              <button type="button" onClick={returnToLanding} className="btn-secondary bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-100 border-cyan-400/30">
                Exit Demo
              </button>
            </div>
          )}
          {isLive && (
            <div className="flex flex-wrap items-center justify-between rounded-3xl border border-blue-400/30 bg-slate-900/80 px-4 py-3 text-sm text-blue-100 shadow-inner">
              <span className="font-semibold">LIVE ANALYSIS ACTIVE</span>
              <button type="button" onClick={returnToLanding} className="btn-secondary bg-blue-600/30 hover:bg-blue-600/50 text-blue-100 border-blue-400/30">
                Exit Live
              </button>
            </div>
          )}
        </header>
        <main className="flex-1 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
