import { useEffect, useState } from 'react';
import api from '../services/api';
import DataTable from '../components/DataTable';

export default function Trips() {
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState('');
  const [trips, setTrips] = useState([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.get('/vehicles').then((r) => {
      setVehicles(r.data.data);
      if (r.data.data[0]) setVehicleId(r.data.data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!vehicleId) return;
    api.get(`/trips/${vehicleId}`, { params: { page } }).then((r) => setTrips(r.data.data));
  }, [vehicleId, page]);

  const columns = [
    { key: 'startTime', label: 'Start', render: (r) => new Date(r.startTime).toLocaleString() },
    { key: 'endTime', label: 'End', render: (r) => r.endTime ? new Date(r.endTime).toLocaleString() : 'Active' },
    { key: 'distance', label: 'Distance', render: (r) => `${r.distance?.toFixed(1)} km` },
    { key: 'avgSpeed', label: 'Avg Speed', render: (r) => r.avgSpeed ? `${r.avgSpeed} km/h` : '—' },
    { key: 'startLocation', label: 'From' },
    { key: 'endLocation', label: 'To' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Trips</h2>
      <select className="input max-w-xs" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
        {vehicles.map((v) => (
          <option key={v.id} value={v.id}>{v.make} {v.model}</option>
        ))}
      </select>
      <DataTable columns={columns} data={trips} page={page} totalPages={5} onPageChange={setPage} />
    </div>
  );
}
