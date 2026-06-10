import { useEffect, useState } from 'react';
import api from '../services/api';
import DataTable from '../components/DataTable';

export default function Maintenance() {
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState('');
  const [logs, setLogs] = useState([]);
  const [form, setForm] = useState({ serviceType: '', dueKm: '', dueDate: '' });

  const load = () => vehicleId && api.get(`/maintenance/${vehicleId}`).then((r) => setLogs(r.data.data));

  useEffect(() => {
    api.get('/vehicles').then((r) => {
      setVehicles(r.data.data);
      if (r.data.data[0]) setVehicleId(r.data.data[0].id);
    });
  }, []);

  useEffect(() => { load(); }, [vehicleId]);

  const markComplete = async (id) => {
    await api.put(`/maintenance/${id}`, { completed: true });
    load();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await api.post('/maintenance', { vehicleId, ...form });
    setForm({ serviceType: '', dueKm: '', dueDate: '' });
    load();
  };

  const columns = [
    { key: 'serviceType', label: 'Service' },
    { key: 'dueKm', label: 'Due KM' },
    { key: 'dueDate', label: 'Due Date', render: (r) => r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '—' },
    { key: 'completed', label: 'Status', render: (r) => r.completed ? '✅ Done' : '⏳ Pending' },
    {
      key: 'actions',
      label: '',
      render: (r) => !r.completed && (
        <button type="button" onClick={() => markComplete(r.id)} className="text-fleet-600 text-sm hover:underline">
          Complete
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Maintenance</h2>
      <select className="input max-w-xs" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
        {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plateNumber || v.make}</option>)}
      </select>
      <form onSubmit={handleSubmit} className="card flex flex-wrap gap-4">
        <input className="input" placeholder="Service type" value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })} required />
        <input className="input max-w-[120px]" placeholder="Due KM" value={form.dueKm} onChange={(e) => setForm({ ...form, dueKm: e.target.value })} />
        <input type="date" className="input max-w-[160px]" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        <button type="submit" className="btn-primary">Schedule</button>
      </form>
      <DataTable columns={columns} data={logs} />
    </div>
  );
}
