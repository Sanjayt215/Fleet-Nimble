import { memo, useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../services/api';

const METRICS = [ 
  { key: 'rpm', label: 'RPM' },
  { key: 'speed', label: 'Speed (km/h)' },
  { key: 'coolantTemp', label: 'Coolant °C' },
  { key: 'fuelLevel', label: 'Fuel %' },
  { key: 'batteryVoltage', label: 'Battery V' },
  { key: 'throttle', label: 'Throttle %' },
  { key: 'engineLoad', label: 'Engine Load %' },
];

// LIVE OBD — historical metric chart
function OBDHistoryChart({ vehicleId, liveUpdate = null }) {
  const [metric, setMetric] = useState('rpm');
  const [data, setData] = useState([]);

  useEffect(() => {
    if (!vehicleId) return;
    api.get(`/mobile/telemetry/history/${vehicleId}`, { params: { limit: 100 } }).then((r) => {
      setData(r.data.data || []);
    }).catch(() => {
      setData([]);
    });
  }, [vehicleId]);

  useEffect(() => {
    if (!liveUpdate) return;
    setData((prev) => [...prev, liveUpdate].slice(-100));
  }, [liveUpdate]);

  const chartData = useMemo(() => {
    return data
      .slice()
      .reverse()
      .map((row) => {
        const value = Number(row[metric]);
        const timestamp = row.recordedAt || row.timestamp || row.createdAt;
        return {
          time: timestamp ? new Date(timestamp).toLocaleTimeString() : 'Unknown',
          value: Number.isFinite(value) ? value : null,
        };
      })
      .filter((d) => d.value != null);
  }, [data, metric]);

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-white">History</h3>
        <select
          className="input max-w-[200px] bg-slate-800 text-white"
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
        >
          {METRICS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="h-64 bg-slate-800 rounded-lg">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
              <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={true} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400">
            <p>Waiting for telemetry data...</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(OBDHistoryChart);
