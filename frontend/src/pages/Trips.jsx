import { useEffect, useState } from 'react';
import api from '../services/api';
import DataTable from '../components/DataTable';
import { useMode } from '../context/ModeContext';
import { DEMO_FLEET, DEMO_TRIPS } from '../data/demoData';

export default function Trips() {
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState('');
  const [trips, setTrips] = useState([]);
  const [page, setPage] = useState(1);
  const { isDemo } = useMode();

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

  useEffect(() => {
    if (isDemo) {
      if (vehicleId) {
        setTrips(DEMO_TRIPS.filter(t => t.vehicleId === vehicleId));
      } else {
        setTrips(DEMO_TRIPS);
      }
    } else {
      if (!vehicleId) return;
      api.get(`/mobile/trips/${vehicleId}`, { params: { page } }).then((r) => setTrips(r.data.data || [])).catch(() => setTrips([]));
    }
  }, [vehicleId, page, isDemo]);

  const columns = [
    { key: 'startTime', label: 'Start', render: (r) => new Date(r.startTime).toLocaleString() },
    { key: 'endTime', label: 'End', render: (r) => r.endTime ? new Date(r.endTime).toLocaleString() : 'Active' },
    { key: 'distance', label: 'Distance', render: (r) => r.distance != null ? `${r.distance.toFixed(1)} km` : '—' },
    { key: 'avgSpeed', label: 'Avg Speed', render: (r) => r.avgSpeed ? `${r.avgSpeed} km/h` : '—' },
    { key: 'startLocation', label: 'From' },
    { key: 'endLocation', label: 'To' },
  ];

  return (
    <div className="space-y-6 text-white">
      <h2 className="text-2xl font-bold">Trips</h2>
      {vehicles.length > 0 && (
        <select className="input max-w-xs bg-slate-800 border border-slate-700 text-white" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>{v.make} {v.model} — {v.plateNumber}</option>
          ))}
        </select>
      )}
      {trips.length === 0 ? (
        <div className="card bg-slate-800/30 border border-slate-700 p-8 text-center">
          <h3 className="text-lg font-semibold text-white">No trips yet.</h3>
          <p className="text-slate-400 mt-2">Trips will generate after live data is received.</p>
        </div>
      ) : (
        <DataTable columns={columns} data={trips} page={page} totalPages={5} onPageChange={setPage} />
      )}
    </div>
  );
}
