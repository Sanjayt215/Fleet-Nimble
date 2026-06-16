import { useEffect, useState } from 'react';
import api from '../services/api';
import DataTable from '../components/DataTable';
import { useMode } from '../context/ModeContext';
import { DEMO_FLEET } from '../data/demoData';

export default function WorkOrders() {
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState({ vehicleId: '', description: '' });
  const [vehicles, setVehicles] = useState([]);
  const { isDemo } = useMode();

  const load = () => {
    if (isDemo) {
      setOrders([]); // No demo orders for now
    } else {
      api.get('/mobile/work-orders').then((r) => setOrders(r.data.data || [])).catch(() => setOrders([]));
    }
  };

  useEffect(() => {
    if (isDemo) {
      setVehicles(DEMO_FLEET);
    } else {
      api.get('/mobile/vehicles/my').then((r) => setVehicles(r.data.data || [])).catch(() => setVehicles([]));
    }
    load();
  }, [isDemo]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isDemo) {
      // In demo, just add to local state
      const newOrder = {
        id: Date.now(),
        vehicleId: form.vehicleId,
        description: form.description,
        status: 'open',
        createdAt: new Date().toISOString()
      };
      setOrders([newOrder, ...orders]);
      setForm({ vehicleId: '', description: '' });
    } else {
      await api.post('/mobile/work-orders', form);
      setForm({ vehicleId: '', description: '' });
      load();
    }
  };

  const columns = [
    { key: 'description', label: 'Description' },
    { key: 'status', label: 'Status' },
    { key: 'cost', label: 'Cost', render: (r) => r.cost != null ? `₹${r.cost}` : '—' },
    { key: 'createdAt', label: 'Created', render: (r) => new Date(r.createdAt).toLocaleDateString() },
  ];

  return (
    <div className="space-y-6 text-white">
      <h2 className="text-2xl font-bold">Work Orders</h2>
      {isDemo && (
        <form onSubmit={handleSubmit} className="card bg-slate-800/50 border border-slate-700 flex flex-wrap gap-4">
          <select className="input max-w-xs bg-slate-700 border border-slate-600" value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} required>
            <option value="">Vehicle</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plateNumber || `${v.make} ${v.model}`}</option>)}
          </select>
          <input className="input flex-1 bg-slate-700 border border-slate-600" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
          <button type="submit" className="btn-primary bg-gradient-to-r from-cyan-600 to-blue-600">Create</button>
        </form>
      )}
      {orders.length === 0 ? (
        <div className="card bg-slate-800/30 border border-slate-700 p-8 text-center">
          <h3 className="text-lg font-semibold text-white">No work orders yet.</h3>
          <p className="text-slate-400 mt-2">Work orders will appear after maintenance is scheduled.</p>
        </div>
      ) : (
        <DataTable columns={columns} data={orders} />
      )}
    </div>
  );
}
