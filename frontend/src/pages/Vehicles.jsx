import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import DataTable from '../components/DataTable';
import VehicleStatusBadge from '../components/VehicleStatusBadge';

export default function Vehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, limit: 20 });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ make: '', model: '', year: '', plateNumber: '', vin: '' });

  const load = () => {
    api.get('/vehicles', { params: { search, page, limit: 20 } }).then((r) => {
      setVehicles(r.data.data);
      setMeta(r.data.meta);
    });
  };

  useEffect(() => {
    load();
  }, [search, page]);

  const handleCreate = async (e) => {
    e.preventDefault();
    await api.post('/vehicles', form);
    setShowForm(false);
    setForm({ make: '', model: '', year: '', plateNumber: '', vin: '' });
    load();
  };

  const columns = [
    {
      key: 'status',
      label: 'Status',
      render: (r) => <VehicleStatusBadge health={r.telemetryHealth} compact />,
    },
    { key: 'plateNumber', label: 'Plate', render: (r) => r.plateNumber || '—' },
    { key: 'make', label: 'Make' },
    { key: 'model', label: 'Model' },
    { key: 'year', label: 'Year' },
    { key: 'odometer', label: 'Odometer', render: (r) => `${r.odometer?.toLocaleString()} km` },
    {
      key: 'actions',
      label: '',
      render: (r) => (
        <Link to={`/vehicles/${r.id}`} className="text-fleet-600 hover:underline">
          View
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Vehicles</h2>
        <button type="button" onClick={() => setShowForm(!showForm)} className="btn-primary">
          Add Vehicle
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card grid gap-4 sm:grid-cols-2">
          {['make', 'model', 'year', 'plateNumber', 'vin'].map((f) => (
            <input key={f} className="input" placeholder={f} value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} />
          ))}
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary">Save</button>
          </div>
        </form>
      )}

      <DataTable
        columns={columns}
        data={vehicles}
        search={search}
        onSearchChange={setSearch}
        page={page}
        totalPages={Math.ceil((meta.total || 0) / meta.limit) || 1}
        onPageChange={setPage}
      />
    </div>
  );
}
