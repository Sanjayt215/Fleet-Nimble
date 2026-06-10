import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

/** Approved production nav (8 modules) + settings/admin */
const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/vehicles', label: 'Vehicles', icon: '🚗' },
  { to: '/diagnostics', label: 'Live Diagnostics', icon: '🔧' },
  { to: '/dtc', label: 'DTC Codes', icon: '⚠️' },
  { to: '/fuel', label: 'Fuel Management', icon: '⛽' },
  { to: '/maintenance', label: 'Maintenance', icon: '🔩' },
  { to: '/drivers', label: 'Drivers', icon: '👤' },
  { to: '/reports', label: 'Reports & Alerts', icon: '📈' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
  { to: '/admin', label: 'Admin', icon: '🛡️', adminOnly: true },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const filteredNav = nav.filter((n) => !n.adminOnly || user?.role?.name === 'ADMIN');

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-6 dark:border-slate-800">
          <span className="text-xl font-bold text-fleet-600">FleetNimble</span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {filteredNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-fleet-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-4 dark:border-slate-800">
          <p className="truncate text-sm font-medium">{user?.name}</p>
          <p className="truncate text-xs text-slate-500">{user?.email}</p>
        </div>
      </aside>

      <div className="ml-64 flex flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-8 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
          <h1 className="text-lg font-semibold">FleetNimble Dashboard</h1>
          <div className="flex items-center gap-4">
            <button type="button" onClick={toggle} className="btn-secondary">
              {dark ? '☀️ Light' : '🌙 Dark'}
            </button>
            <span className="rounded-full bg-fleet-100 px-3 py-1 text-xs font-medium text-fleet-700 dark:bg-fleet-900 dark:text-fleet-100">
              {user?.role?.name}
            </span>
            <button type="button" onClick={handleLogout} className="btn-secondary">
              Logout
            </button>
          </div>
        </header>
        <main className="flex-1 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
