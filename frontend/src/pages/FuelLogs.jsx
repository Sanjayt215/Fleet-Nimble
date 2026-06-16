import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../services/api';
import DataTable from '../components/DataTable';
import { useMode } from '../context/ModeContext';
import { DEMO_FLEET, DEMO_FUEL_LOGS } from '../data/demoData';

export default function FuelLogs() {
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState('');
  const [logs, setLogs] = useState([]);
  const [form, setForm] = useState({ liters: '', cost: '', mileage: '' });
  const { isDemo } = useMode();

  const load = () => {
    if (isDemo) {
      if (vehicleId) {
        setLogs(DEMO_FUEL_LOGS.filter(l => l.vehicleId === vehicleId));
      } else {
        setLogs(DEMO_FUEL_LOGS);
      }
    } else {
      if (vehicleId) {
        api.get(`/mobile/fuel/${vehicleId}`).then((r) => setLogs(r.data.data || [])).catch(() => setLogs([]));
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isDemo) {
      // In demo, just add to local state
      const newLog = {
        id: 'demo-fuel-' + Date.now(),
        vehicleId,
        liters: parseFloat(form.liters),
        cost: parseFloat(form.cost),
        odometer: parseInt(form.mileage),
        createdAt: new Date().toISOString()
      };
      setLogs([newLog, ...logs]);
      setForm({ liters: '', cost: '', mileage: '' });
    } else {
      await api.post('/mobile/fuel', { vehicleId, ...form, liters: parseFloat(form.liters), cost: parseFloat(form.cost) });
      setForm({ liters: '', cost: '', mileage: '' });
      load();
    }
  };

  const columns = [
    { key: 'createdAt', label: 'Date', render: (r) => new Date(r.createdAt).toLocaleDateString() },
    { key: 'liters', label: 'Liters', render: (r) => r.liters != null ? `${r.liters} L` : '—' },
    { key: 'cost', label: 'Cost', render: (r) => r.cost != null ? `₹${r.cost}` : '—' },
    { key: 'odometer', label: 'Odometer', render: (r) => r.odometer != null ? `${r.odometer} km` : '—' },
  ];

  return (
    <div className="space-y-6 text-white">
      <h2 className="text-2xl font-bold">Fuel Management</h2>
      {vehicles.length > 0 && (
        <select className="input max-w-xs bg-slate-800 border border-slate-700 text-white" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plateNumber || `${v.make} ${v.model}`}</option>)}
        </select>
      )}
      {isDemo && (
        <form onSubmit={handleSubmit} className="card bg-slate-800/50 border border-slate-700 flex flex-wrap gap-4">
          <input className="input max-w-[120px] bg-slate-700 border border-slate-600" placeholder="Liters" value={form.liters} onChange={(e) => setForm({ ...form, liters: e.target.value })} required />
          <input className="input max-w-[120px] bg-slate-700 border border-slate-600" placeholder="Cost" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
          <input className="input max-w-[120px] bg-slate-700 border border-slate-600" placeholder="Mileage" value={form.mileage} onChange={(e) => setForm({ ...form, mileage: e.target.value })} />
          <button type="submit" className="btn-primary bg-gradient-to-r from-cyan-600 to-blue-600">Add Log</button>
        </form>
      )}
      {logs.length === 0 ? (
        <div className="card bg-slate-800/30 border border-slate-700 p-8 text-center">
          <h3 className="text-lg font-semibold text-white">No fuel records yet.</h3>
          <p className="text-slate-400 mt-2">Fuel records will appear after live data or manual entry.</p>
        </div>
      ) : (
        <DataTable columns={columns} data={logs} />
      )}
    </div>
  );
}
