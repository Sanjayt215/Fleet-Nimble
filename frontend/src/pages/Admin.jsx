import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import StatCard from '../components/StatCard';
import DataTable from '../components/DataTable';

export default function Admin() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (user?.role?.name !== 'ADMIN') return;
    api.get('/admin/stats').then((r) => setStats(r.data.data)).catch(() => setStats(null));
    api.get('/admin/users').then((r) => setUsers(r.data.data || [])).catch(() => setUsers([]));
  }, [user]);

  if (user?.role?.name !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role', render: (r) => r.role?.name },
    { key: 'vehicles', label: 'Vehicles', render: (r) => r._count?.vehicles ?? 0 },
  ];

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Admin Panel</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Users" value={stats?.users} />
        <StatCard title="Vehicles" value={stats?.vehicles} />
        <StatCard title="Active DTCs" value={stats?.activeDtc} />
        <StatCard title="Open Work Orders" value={stats?.openWorkOrders} />
      </div>
      <DataTable columns={columns} data={users} />
    </div>
  );
}
