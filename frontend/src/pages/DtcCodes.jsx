import { useEffect, useState } from 'react';
import api from '../services/api';
import DataTable from '../components/DataTable';
import { useSocket } from '../hooks/useSocket';

export default function DtcCodes() {
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState('');
  const [tab, setTab] = useState('active');
  const [codes, setCodes] = useState([]);

  useSocket({
    'dtc:new': (d) => {
      if (!vehicleId || d.vehicleId === vehicleId) {
        if (tab === 'active' && d.active) setCodes((prev) => [d, ...prev]);
        if (tab === 'history') setCodes((prev) => [d, ...prev]);
      }
    },
  });

  useEffect(() => {
    api.get('/vehicles').then((r) => {
      setVehicles(r.data.data);
      if (r.data.data[0]) setVehicleId(r.data.data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!vehicleId) return;
    const url = tab === 'history' ? `/dtc/history/${vehicleId}` : `/dtc/${vehicleId}`;
    api.get(url).then((r) => {
      const data = tab === 'active' ? r.data.data : r.data.data;
      setCodes(tab === 'active' ? data : data);
    });
  }, [vehicleId, tab]);

  const clearCodes = async () => {
    await api.post('/dtc/clear', { vehicleId });
    setCodes([]);
  };

  const columns = [
    { key: 'code', label: 'Code', render: (r) => <span className="font-mono font-bold">{r.code}</span> },
    { key: 'description', label: 'Description' },
    {
      key: 'status',
      label: 'Type',
      render: (r) => (
        <span className={r.status === 'PENDING' ? 'text-yellow-600' : 'text-slate-600'}>
          {r.status || 'CONFIRMED'}
        </span>
      ),
    },
    { key: 'severity', label: 'Severity' },
    {
      key: 'active',
      label: 'Active',
      render: (r) => (r.active ? 'Yes' : 'Cleared'),
    },
    { key: 'detectedAt', label: 'Detected', render: (r) => new Date(r.detectedAt).toLocaleString() },
  ];

  const displayData = tab === 'active' ? codes.filter((c) => c.active) : codes;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">DTC Codes</h2>
          <p className="text-slate-500">Confirmed (Mode 03) and pending (Mode 07) fault codes</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="input" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.plateNumber || v.make}</option>
            ))}
          </select>
          <button type="button" onClick={clearCodes} className="btn-secondary">Clear active DTCs</button>
        </div>
      </div>

      <div className="flex gap-2">
        {['active', 'history'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-medium capitalize ${
              tab === t ? 'bg-fleet-600 text-white' : 'btn-secondary'
            }`}
          >
            {t === 'active' ? 'Active codes' : 'History'}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={displayData}
        emptyMessage={tab === 'active' ? 'No active fault codes' : 'No DTC history'}
      />
    </div>
  );
}
