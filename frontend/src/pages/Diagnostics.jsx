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

  // STEP 2: Socket.IO subscription for real-time updates
  useSocket(
    {
      'live-telemetry-update': (d) => {
        if (isDemo) return; // Don't use socket in demo
        if (d?.mode !== 'LIVE') return; // Strict LIVE-only filtering
        const vid = d.vehicleId ?? d.vehicle_id;
        console.log('🔔 Socket telemetry received:', {
          vehicleId: vid,
          rpm: d.rpm,
          speed: d.speed,
          fuelLevel: d.fuelLevel ?? d.fuel,
          coolantTemp: d.coolantTemp ?? d.coolant,
          engineLoad: d.engineLoad ?? d.load,
          batteryVoltage: d.batteryVoltage ?? d.voltage,
          maf: d.maf,
          throttle: d.throttle ?? d.throttlePosition,
          intakeTemp: d.intakeTemp ?? d.intake,
          timestamp: d.timestamp
        });
        
        if (!vehicleId || vid === vehicleId) {
          // Normalize field names for frontend
          const normalized = {
            ...d,
            rpm: d.rpm ?? 0,
            speed: d.speed ?? 0,
            fuelLevel: d.fuelLevel ?? d.fuel ?? 0,
            coolantTemp: d.coolantTemp ?? d.coolant ?? 0,
            engineLoad: d.engineLoad ?? d.load ?? 0,
            batteryVoltage: d.batteryVoltage ?? d.voltage ?? 0,
            maf: d.maf ?? 0,
            throttle: d.throttle ?? d.throttlePosition ?? 0,
            intakeTemp: d.intakeTemp ?? d.intake ?? 0
          };
          
          setLive((prev) => mergeTelemetry(prev, normalized));
          setStreamStatus('live');
        }
      },
      'vehicle-online': (d) => {
        if (isDemo) return;
        const vid = d.vehicleId ?? d.vehicle_id;
        if (!vehicleId || vid === vehicleId) {
          console.log('🟢 Vehicle online event:', d);
          setStreamStatus(d.online ? 'live' : 'offline');
        }
      }
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

  // STEP 2: Fetch latest telemetry every 2 seconds
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
      return;
    }

    if (!vehicleId) {
      setLive(null);
      setStreamStatus('offline');
      return;
    }
    
    // Initial load
    const fetchLatest = async () => {
      try {
        console.log('🔍 Fetching latest telemetry for vehicle:', vehicleId);
        const res = await api.get('/mobile/telemetry/latest', { params: { vehicleId } });
        console.log('📥 Latest telemetry received:', res.data.data);
        
        if (res.data.success && res.data.data) {
          const latest = res.data.data;
          
          // Normalize field names
          const normalized = {
            ...latest,
            rpm: latest.rpm ?? 0,
            speed: latest.speed ?? 0,
            fuelLevel: latest.fuelLevel ?? latest.fuel ?? 0,
            coolantTemp: latest.coolantTemp ?? latest.coolant ?? 0,
            engineLoad: latest.engineLoad ?? latest.load ?? 0,
            batteryVoltage: latest.batteryVoltage ?? latest.voltage ?? 0,
            maf: latest.maf ?? 0,
            throttle: latest.throttle ?? latest.throttlePosition ?? 0,
            intakeTemp: latest.intakeTemp ?? latest.intake ?? 0
          };
          
          console.log('✅ Normalized telemetry:', {
            rpm: normalized.rpm,
            speed: normalized.speed,
            fuelLevel: normalized.fuelLevel,
            coolantTemp: normalized.coolantTemp,
            engineLoad: normalized.engineLoad,
            batteryVoltage: normalized.batteryVoltage,
            maf: normalized.maf,
            throttle: normalized.throttle,
            intakeTemp: normalized.intakeTemp
          });
          
          setLive(normalized);
          
          const age = Date.now() - new Date(latest.timestamp || latest.recordedAt).getTime();
          // If GPS is updating but OBD is missing, still show as live if recent
          if (age < 30000) {
            setStreamStatus('live');
          } else if (age < 120000) {
            setStreamStatus('stale');
          } else {
            setStreamStatus('offline');
          }
        } else {
          console.warn('⚠️ No telemetry data received');
          // Don't set offline if we just don't have data yet
          if (streamStatus !== 'live') {
            setStreamStatus('offline');
          }
        }
      } catch (err) {
        console.error('❌ Error fetching latest telemetry:', err);
        // Don't override live status on API error
        if (streamStatus !== 'live') {
          setStreamStatus('offline');
        }
      }
    };

    fetchLatest();
    
    // STEP 2: Poll every 2 seconds (as backup to Socket.IO)
    const pollInterval = setInterval(fetchLatest, 2000);

    // Fetch history once
    api.get(`/mobile/telemetry/history/${vehicleId}`, { params: { limit: 50 } })
      .then((r) => {
        setHistory(r.data.data || []);
      })
      .catch(() => {
        setHistory([]);
      });

    return () => clearInterval(pollInterval);
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
          Last sample: {live?.timestamp ? new Date(live.timestamp).toLocaleString() : isLive ? 'Waiting for OBD app…' : 'Waiting for OBD app or MQTT device…'}
        </p>
        <p className="mt-1 text-sm text-slate-400">History buffer: {history.length} samples</p>
        {live && (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-slate-500">RPM:</span>
              <span className="ml-2 text-cyan-400 font-semibold">{live.rpm ?? '—'}</span>
            </div>
            <div>
              <span className="text-slate-500">Speed:</span>
              <span className="ml-2 text-cyan-400 font-semibold">{live.speed ?? '—'} km/h</span>
            </div>
            <div>
              <span className="text-slate-500">Fuel:</span>
              <span className="ml-2 text-cyan-400 font-semibold">{live.fuelLevel ?? live.fuel ?? '—'}%</span>
            </div>
            <div>
              <span className="text-slate-500">Coolant:</span>
              <span className="ml-2 text-cyan-400 font-semibold">{live.coolantTemp ?? live.coolant ?? '—'}°C</span>
            </div>
            <div>
              <span className="text-slate-500">Battery:</span>
              <span className="ml-2 text-cyan-400 font-semibold">{live.batteryVoltage ?? live.voltage ?? '—'}V</span>
            </div>
            <div>
              <span className="text-slate-500">Engine Load:</span>
              <span className="ml-2 text-cyan-400 font-semibold">{live.engineLoad ?? live.load ?? '—'}%</span>
            </div>
            <div>
              <span className="text-slate-500">MAF:</span>
              <span className="ml-2 text-cyan-400 font-semibold">{live.maf ?? '—'} g/s</span>
            </div>
            <div>
              <span className="text-slate-500">Throttle:</span>
              <span className="ml-2 text-cyan-400 font-semibold">{live.throttle ?? live.throttlePosition ?? '—'}%</span>
            </div>
            <div>
              <span className="text-slate-500">Intake Temp:</span>
              <span className="ml-2 text-cyan-400 font-semibold">{live.intakeTemp ?? live.intake ?? '—'}°C</span>
            </div>
            {live.latitude && live.longitude && (
              <>
                <div>
                  <span className="text-slate-500">GPS:</span>
                  <span className="ml-2 text-green-400 font-semibold">Active</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500">Location:</span>
                  <span className="ml-2 text-cyan-400">{live.latitude.toFixed(4)}, {live.longitude.toFixed(4)}</span>
                </div>
              </>
            )}
          </div>
        )}
        {!live && isLive && (
          <div className="mt-3 text-center py-4">
            <p className="text-slate-500 text-sm">No telemetry data yet. Start the mobile app and send OBD data.</p>
          </div>
        )}
      </div>
    </div>
  );
}
