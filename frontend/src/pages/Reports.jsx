import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../services/api';
import DataTable from '../components/DataTable';
import { useSocket } from '../hooks/useSocket';

const severityColor = {
  LOW: 'text-slate-600',
  MEDIUM: 'text-yellow-600',
  HIGH: 'text-orange-600',
  CRITICAL: 'text-red-600',
};

export default function Reports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState('');
  const [tab, setTab] = useState(searchParams.get('tab') || 'fuel');
  const [report, setReport] = useState(null);
  const [alerts, setAlerts] = useState([]);

  useSocket({
    'alert:new': (a) => {
      if (!vehicleId || a.vehicleId === vehicleId) setAlerts((prev) => [a, ...prev]);
    },
  });

  useEffect(() => {
    api.get('/vehicles').then((r) => {
      setVehicles(r.data.data);
      if (r.data.data[0]) setVehicleId(r.data.data[0].id);
    });
  }, []);

  useEffect(() => {
    setSearchParams(tab === 'fuel' ? {} : { tab }, { replace: true });
  }, [tab, setSearchParams]);

  useEffect(() => {
    if (!vehicleId) return;
    if (tab === 'alerts') {
      api.get(`/alerts/${vehicleId}`).then((r) => setAlerts(r.data.data));
      return;
    }
    const endpoints = {
      fuel: `/reports/fuel/${vehicleId}`,
      trips: `/reports/trips/${vehicleId}`,
      maintenance: `/reports/maintenance/${vehicleId}`,
      diagnostics: `/reports/diagnostics/${vehicleId}`,
      driver: '/drivers/scores',
    };
    if (endpoints[tab]) {
      api.get(endpoints[tab]).then((r) => setReport(r.data.data)).catch(() => setReport(null));
    }
  }, [vehicleId, tab]);

  const markRead = async (id) => {
    await api.put(`/alerts/${id}/read`);
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, read: true } : a)));
  };

  const alertColumns = [
    { key: 'severity', label: 'Severity', render: (r) => <span className={severityColor[r.severity]}>{r.severity}</span> },
    { key: 'alertType', label: 'Type' },
    { key: 'message', label: 'Message' },
    { key: 'createdAt', label: 'Time', render: (r) => new Date(r.createdAt).toLocaleString() },
    {
      key: 'actions',
      label: '',
      render: (r) => !r.read && (
        <button type="button" onClick={() => markRead(r.id)} className="text-sm text-fleet-600 hover:underline">
          Mark read
        </button>
      ),
    },
  ];

  const fuelChart = report?.logs?.slice(0, 10).map((l, i) => ({
    name: `#${i + 1}`,
    liters: l.liters,
    cost: l.cost,
  }));

  const tabs = ['fuel', 'maintenance', 'diagnostics', 'driver', 'trips', 'alerts'];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Reports &amp; Alerts</h2>
        <p className="text-slate-500">Fleet analytics and alert center</p>
      </div>
      <div className="flex flex-wrap gap-4">
        <select className="input max-w-xs" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plateNumber || v.make}</option>)}
        </select>
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-medium capitalize ${
              tab === t ? 'bg-fleet-600 text-white' : 'btn-secondary'
            }`}
          >
            {t === 'alerts' ? 'Alert center' : t}
          </button>
        ))}
      </div>

      {tab === 'alerts' && (
        <DataTable columns={alertColumns} data={alerts} emptyMessage="No alerts for this vehicle" />
      )}

      {tab === 'fuel' && report && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card">
            <h3 className="font-semibold">Fuel summary</h3>
            <p className="mt-2 text-3xl font-bold">{report.summary?.totalLiters?.toFixed(1)} L</p>
            <p className="text-slate-500">Total cost: ${report.summary?.totalCost?.toFixed(2)}</p>
            <p className="text-sm text-slate-500">{report.summary?.entries} log entries</p>
          </div>
          <div className="card h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fuelChart}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="liters" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {tab === 'trips' && report && (
        <div className="card">
          <p>Total distance: <strong>{report.summary?.totalDistance?.toFixed(1)} km</strong></p>
          <p>Trips: {report.summary?.tripCount}</p>
        </div>
      )}

      {tab === 'maintenance' && report && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card">
            <h3 className="font-semibold">Pending ({report.pending?.length ?? 0})</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {report.pending?.map((m) => (
                <li key={m.id}>{m.serviceType} — due {m.dueDate ? new Date(m.dueDate).toLocaleDateString() : '—'}</li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h3 className="font-semibold">Completed (recent)</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {report.completed?.slice(0, 10).map((m) => (
                <li key={m.id}>{m.serviceType}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'driver' && report?.scores && (
        <div className="card">
          <DataTable
            columns={[
              { key: 'vehicleId', label: 'Vehicle' },
              { key: 'score', label: 'Score' },
              { key: 'harshAcceleration', label: 'Harsh accel' },
              { key: 'harshBraking', label: 'Harsh brake' },
              { key: 'idleTime', label: 'Idle (min)', render: (r) => r.idleTime?.toFixed?.(0) ?? r.idleTime },
            ]}
            data={report.scores.filter((s) => !vehicleId || s.vehicleId === vehicleId)}
            emptyMessage="No driver scores yet"
          />
        </div>
      )}

      {tab === 'diagnostics' && report && (
        <pre className="card overflow-auto text-xs">{JSON.stringify(report, null, 2)}</pre>
      )}
    </div>
  );
}
