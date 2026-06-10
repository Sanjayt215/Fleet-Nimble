import { useEffect, useState } from 'react';
import api from '../services/api';
import DataTable from '../components/DataTable';
import { useSocket } from '../hooks/useSocket';

const severityColor = {
  LOW: 'text-slate-600',
  MEDIUM: 'text-yellow-600',
  HIGH: 'text-orange-600',
  CRITICAL: 'text-red-600',
};

export default function Alerts() {
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState('');
  const [alerts, setAlerts] = useState([]);

  useSocket({ 'alert:new': (a) => setAlerts((prev) => [a, ...prev]) });

  useEffect(() => {
    api.get('/vehicles').then((r) => {
      setVehicles(r.data.data);
      if (r.data.data[0]) setVehicleId(r.data.data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!vehicleId) return;
    api.get(`/alerts/${vehicleId}`).then((r) => setAlerts(r.data.data));
  }, [vehicleId]);

  const markRead = async (id) => {
    await api.put(`/alerts/${id}/read`);
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, read: true } : a)));
  };

  const columns = [
    { key: 'severity', label: 'Severity', render: (r) => <span className={severityColor[r.severity]}>{r.severity}</span> },
    { key: 'alertType', label: 'Type' },
    { key: 'message', label: 'Message' },
    { key: 'createdAt', label: 'Time', render: (r) => new Date(r.createdAt).toLocaleString() },
    { key: 'read', label: 'Read', render: (r) => (r.read ? 'Yes' : 'No') },
    {
      key: 'actions',
      label: '',
      render: (r) => !r.read && (
        <button type="button" onClick={() => markRead(r.id)} className="text-sm text-fleet-600 hover:underline">
          Mark read
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Alerts</h2>
      <select className="input max-w-xs" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
        {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plateNumber || v.make}</option>)}
      </select>
      <DataTable columns={columns} data={alerts} />
    </div>
  );
}
