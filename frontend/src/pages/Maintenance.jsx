import { useEffect, useState } from 'react';
import api from '../services/api';
import DataTable from '../components/DataTable';
import { useMode } from '../context/ModeContext';
import { DEMO_FLEET, DEMO_MAINTENANCE_LOGS } from '../data/demoData';

export default function Maintenance() {
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState('');
  const [logs, setLogs] = useState([]);
  const [form, setForm] = useState({ serviceType: '', dueKm: '', dueDate: '' });
  const { isDemo } = useMode();

  const load = () => {
    if (isDemo) {
      if (vehicleId) {
        setLogs(DEMO_MAINTENANCE_LOGS.filter(l => l.vehicleId === vehicleId));
      } else {
        setLogs(DEMO_MAINTENANCE_LOGS);
      }
    } else {
      if (vehicleId) {
        api.get(`/mobile/maintenance/${vehicleId}`).then((r) => setLogs(r.data.data || [])).catch(() => setLogs([]));
      }
    }
  };

  useEffect(() => {
    if (isDemo) {
      setVehicles(DEMO_FLEET);
      if (DEMO_FLEET.length > 0) setVehicleId(DEMO_FLEET[0].id);
    } else {
      api.get('/mobile/vehicles/my').then((r) => {
        setVehicles(r.data.data || []);
        if (r.data.data?.[0]) setVehicleId(r.data.data[0].id);
      }).catch(() => setVehicles([]));
    }
  }, [isDemo]);

  useEffect(() => { load(); }, [vehicleId, isDemo]);

  const markComplete = async (id) => {
    if (isDemo) {
      setLogs(logs.map(l => l.id === id ? { ...l, completed: true } : l));
    } else {
      await api.put(`/mobile/maintenance/${id}`, { completed: true });
      load();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isDemo) {
      const newLog = {
        id: 'demo-maintenance-' + Date.now(),
        vehicleId,
        ...form,
        dueKm: form.dueKm ? parseInt(form.dueKm) : undefined,
        completed: false
      };
      setLogs([newLog, ...logs]);
      setForm({ serviceType: '', dueKm: '', dueDate: '' });
    } else {
      await api.post('/mobile/maintenance', { vehicleId, ...form, dueKm: form.dueKm ? parseInt(form.dueKm) : undefined });
      setForm({ serviceType: '', dueKm: '', dueDate: '' });
      load();
    }
  };

  const columns = [
    { key: 'serviceType', label: 'Service' },
    { key: 'dueKm', label: 'Due KM', render: (r) => r.dueKm != null ? `${r.dueKm} km` : '—' },
    { key: 'dueDate', label: 'Due Date', render: (r) => r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '—' },
    { key: 'completed', label: 'Status', render: (r) => r.completed ? '✅ Done' : '⏳ Pending' },
    {
      key: 'actions',
      label: '',
      render: (r) => !r.completed && (
        <button type="button" onClick={() => markComplete(r.id)} className="text-cyan-400 hover:underline text-sm">
          Complete
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6 text-white">
      <h2 className="text-2xl font-bold">Maintenance</h2>
      {vehicles.length > 0 && (
        <select className="input max-w-xs bg-slate-800 border border-slate-700 text-white" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plateNumber || `${v.make} ${v.model}`}</option>)}
        </select>
      )}
      {isDemo && (
        <form onSubmit={handleSubmit} className="card bg-slate-800/50 border border-slate-700 flex flex-wrap gap-4">
          <input className="input flex-1 min-w-[200px] bg-slate-700 border border-slate-600" placeholder="Service Type" value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })} required />
          <input className="input max-w-[150px] bg-slate-700 border border-slate-600" placeholder="Due KM" type="number" value={form.dueKm} onChange={(e) => setForm({ ...form, dueKm: e.target.value })} />
          <input className="input max-w-[180px] bg-slate-700 border border-slate-600" placeholder="Due Date" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          <button type="submit" className="btn-primary bg-gradient-to-r from-cyan-600 to-blue-600">Schedule</button>
        </form>
      )}
      {logs.length === 0 ? (
        <div className="card bg-slate-800/30 border border-slate-700 p-8 text-center">
          <h3 className="text-lg font-semibold text-white">No maintenance records yet.</h3>
          <p className="text-slate-400 mt-2">Add maintenance manually.</p>
        </div>
      ) : (
        <DataTable columns={columns} data={logs} />
      )}
    </div>
  );
}
