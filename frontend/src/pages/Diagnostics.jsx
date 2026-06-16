import { useEffect, useState } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import api from '../services/api';
import GaugeChart from '../components/GaugeChart';
import { LIVE_GAUGE_FIELDS } from '../constants/pids';
import { mergeTelemetry } from '../utils/telemetryFormat';
import { useSocket } from '../hooks/useSocket';
import { useMode } from '../context/ModeContext';
import { DEMO_FLEET } from '../data/demoData';

export default function Diagnostics() {
  const [params] = useSearchParams();
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState(params.get('vehicle') || '');
  const [live, setLive] = useState(null);
  const [history, setHistory] = useState([]);
  const [streamStatus, setStreamStatus] = useState('offline');
  const { isDemo, isLive } = useMode();
  const location = useLocation();

  useSocket(
    {
      'live-telemetry-update': (d) => {
        if (isDemo) return; // Don't use socket in demo
        if (d?.mode !== 'LIVE') return; // Strict LIVE-only filtering
        const vid = d.vehicleId ?? d.vehicle_id;
        if (!vehicleId || vid === vehicleId) {
          setLive((prev) => mergeTelemetry(prev, d));
          setStreamStatus('live');
        }
      },
    },
    isDemo ? null : (vehicleId || null)
  );

  useEffect(() => {
    if (isDemo) {
      setVehicles(DEMO_FLEET);
      if (DEMO_FLEET.length > 0 && !vehicleId) {
        setVehicleId(DEMO_FLEET[0].id);
      }
    } else {
      api.get('/mobile/vehicles/my').then((r) => {
        setVehicles(r.data.data || []);
        if (!vehicleId && r.data.data?.[0]) setVehicleId(r.data.data[0].id);
      }).catch(() => setVehicles([]));
    }
  }, [isDemo]);

  useEffect(() => {
    if (isDemo) {
      // Demo mode: show empty state, waiting for user input
      if (!vehicleId) {
        setLive(null);
        setStreamStatus('offline');
      } else {
        // When vehicle selected in demo, show empty values (no random data)
        setLive(null);
        setStreamStatus('offline');
      }
    } else {
      if (!vehicleId) {
        setLive(null);
        setStreamStatus('offline');
        return;
      }
      
      // Live mode: fetch initial telemetry from API
      api.get(`/mobile/telemetry/history/${vehicleId}`, { params: { limit: 50 } }).then((r) => {
        const history = r.data.data || [];
        setHistory(history);
        // Get latest from history
        if (history.length > 0) {
          const latest = history[0];
          setLive(latest);
          const age = Date.now() - new Date(latest.timestamp || latest.recordedAt).getTime();
          setStreamStatus(age < 120000 ? 'live' : age < 600000 ? 'stale' : 'offline');
        } else {
          setStreamStatus('offline');
        }
      }).catch(() => {
        setHistory([]);
        setStreamStatus('offline');
      });
    }
  }, [vehicleId, isDemo]);

  const statusBadge = {
    live: 'bg-green-900/50 text-green-100',
    stale: 'bg-yellow-900/50 text-yellow-100',
    offline: 'bg-slate-800 text-slate-300',
  };

  return (
    <div className="space-y-6 text-white">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Live Diagnostics</h2>
          <p className="text-slate-400">{isDemo ? 'Demo Telemetry - simulated data' : 'Real OBD data — no mock values'}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${statusBadge[streamStatus]}`}>
          {streamStatus}
        </span>
      </div>

      {isLive && vehicles.length === 0 && (
        <div className="rounded-3xl border border-cyan-500/30 bg-cyan-950/20 px-6 py-4 text-cyan-200 shadow-inner">
          <h3 className="font-semibold mb-2">Waiting for live OBD data from mobile app.</h3>
          <p className="text-sm">Connect your OpenOBD app and start sending real OBD data.</p>
        </div>
      )}

      <select className="input max-w-xs bg-slate-800 border border-slate-700" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
        <option value="">Select vehicle</option>
        {vehicles.map((v) => (
          <option key={v.id} value={v.id}>{v.make} {v.model} — {v.registrationNumber || v.plateNumber || '—'}</option>
        ))}
      </select>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {LIVE_GAUGE_FIELDS.map((g) => (
          <GaugeChart
            key={g.field}
            label={g.label}
            value={live?.[g.field]}
            unit={g.unit}
            max={g.max}
          />
        ))}
      </div>

      <div className="card bg-slate-900 border border-slate-800">
        <h3 className="mb-2 font-semibold">Telemetry stream</h3>
        <p className="text-sm text-slate-400">
          Last sample: {live?.recordedAt ? new Date(live.recordedAt).toLocaleString() : isLive ? 'Waiting for OBD app…' : 'Waiting for OBD app or MQTT device…'}
        </p>
        <p className="mt-1 text-sm text-slate-400">History buffer: {history.length} samples</p>
      </div>
    </div>
  );
}
