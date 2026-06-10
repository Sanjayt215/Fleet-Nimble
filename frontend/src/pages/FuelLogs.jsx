import { useEffect, useState } from 'react';
import api from '../services/api';
import DataTable from '../components/DataTable';

export default function FuelLogs() {
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState('');
  const [logs, setLogs] = useState([]);
  const [form, setForm] = useState({ liters: '', cost: '', mileage: '' });

  const load = () => vehicleId && api.get(`/fuel/${vehicleId}`).then((r) => setLogs(r.data.data));

  useEffect(() => {
    api.get('/vehicles').then((r) => {
      setVehicles(r.data.data);
      if (r.data.data[0]) setVehicleId(r.data.data[0].id);
    });
  }, []);

  useEffect(() => { load(); }, [vehicleId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await api.post('/fuel', { vehicleId, ...form, liters: parseFloat(form.liters), cost: parseFloat(form.cost) });
    setForm({ liters: '', cost: '', mileage: '' });
    load();
  };

  const columns = [
    { key: 'createdAt', label: 'Date', render: (r) => new Date(r.createdAt).toLocaleDateString() },
    { key: 'liters', label: 'Liters', render: (r) => `${r.liters} L` },
    { key: 'cost', label: 'Cost', render: (r) => r.cost != null ? `$${r.cost}` : '—' },
    { key: 'mileage', label: 'Odometer' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Fuel Management</h2>
      <select className="input max-w-xs" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
        {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plateNumber || v.make}</option>)}
      </select>
      <form onSubmit={handleSubmit} className="card flex flex-wrap gap-4">
        <input className="input max-w-[120px]" placeholder="Liters" value={form.liters} onChange={(e) => setForm({ ...form, liters: e.target.value })} required />
        <input className="input max-w-[120px]" placeholder="Cost" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
        <input className="input max-w-[120px]" placeholder="Mileage" value={form.mileage} onChange={(e) => setForm({ ...form, mileage: e.target.value })} />
        <button type="submit" className="btn-primary">Add Log</button>
      </form>
      <DataTable columns={columns} data={logs} />
    </div>
  );
}
