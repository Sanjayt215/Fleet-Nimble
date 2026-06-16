import { useAuth } from '../context/AuthContext';

export default function Settings() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h2 className="text-2xl font-bold">Settings</h2>
      <div className="card space-y-4">
        <h3 className="font-semibold">Profile</h3>
        <p><span className="text-slate-500">Name:</span> {user?.name}</p>
        <p><span className="text-slate-500">Email:</span> {user?.email}</p>
        <p><span className="text-slate-500">Role:</span> {user?.role?.name}</p>
      </div>
      <div className="card space-y-2">
        <h3 className="font-semibold">Appearance</h3>
        <p className="text-sm text-slate-400">Dark mode is forced across the entire application.</p>
      </div>
      <div className="card">
        <h3 className="font-semibold">API Connection</h3>
        <p className="mt-2 text-sm text-slate-500">Backend: {import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}</p>
        <p className="text-sm text-slate-500">Socket: {import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000'}</p>
      </div>
    </div>
  );
}
