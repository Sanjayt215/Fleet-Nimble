import { useEffect, useState } from 'react';
import api from '../services/api';
import DataTable from '../components/DataTable';

export default function WorkOrders() {
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState({ vehicleId: '', description: '' });
  const [vehicles, setVehicles] = useState([]);

  const load = () => api.get('/work-orders').then((r) => setOrders(r.data.data));

  useEffect(() => {
    load();
    api.get('/vehicles').then((r) => setVehicles(r.data.data));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await api.post('/work-orders', form);
    setForm({ vehicleId: '', description: '' });
    load();
  };

  const columns = [
    { key: 'description', label: 'Description' },
    { key: 'status', label: 'Status' },
    { key: 'cost', label: 'Cost', render: (r) => r.cost != null ? `$${r.cost}` : '—' },
    { key: 'createdAt', label: 'Created', render: (r) => new Date(r.createdAt).toLocaleDateString() },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Work Orders</h2>
      <form onSubmit={handleSubmit} className="card flex flex-wrap gap-4">
        <select className="input" value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} required>
          <option value="">Vehicle</option>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plateNumber || v.make}</option>)}
        </select>
        <input className="input flex-1" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
        <button type="submit" className="btn-primary">Create</button>
      </form>
      <DataTable columns={columns} data={orders} />
    </div>
  );
}
