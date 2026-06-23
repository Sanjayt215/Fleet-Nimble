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
  const [engineState, setEngineState] = useState(null);
  const [batteryProtection, setBatteryProtection] = useState(null);
  const { isDemo, isLive } = useMode();
  const location = useLocation();

  // Socket.IO subscription for real-time updates
  useSocket(
    {
      'live-telemetry-update': (d) => {
        if (isDemo) return;
        const vid = d.vehicleId ?? d.vehicle_id;
        console.log('🔔 Socket telemetry received:', {
          vehicleId: vid,
          mode: d.mode,
          engineState: d.engineState,
          obdPollingActive: d.obdPollingActive,
          rpm: d.rpm,
          speed: d.speed,
          batteryVoltage: d.batteryVoltage
        });
        
        if (!vehicleId || vid === vehicleId) {
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
            intakeTemp: d.intakeTemp ?? d.intake ?? 0,
            engineState: d.engineState,
            obdPollingActive: d.obdPollingActive,
            batteryProtectionMode: d.batteryProtectionMode
          };
          
          setLive((prev) => mergeTelemetry(prev, normalized));
          setEngineState(d.engineState);
          setBatteryProtection(d.batteryProtectionMode);
          
          // Set status based on engine state
          if (d.mode === 'STANDBY' || d.engineState === 'ENGINE_OFF' || d.engineState === 'STANDBY') {
            setStreamStatus('standby');
          } else {
            setStreamStatus('live');
          }
        }
      },
      'vehicle-standby': (d) => {
        if (isDemo) return;
        const vid = d.vehicleId ?? d.vehicle_id;
        if (!vehicleId || vid === vehicleId) {
          console.log('🟡 Vehicle standby event:', d);
          setStreamStatus('standby');
          setEngineState(d.engineState);
        }
      },
      'vehicle-engine-off': (d) => {
        if (isDemo) return;
        const vid = d.vehicleId ?? d.vehicle_id;
        if (!vehicleId || vid === vehicleId) {
          console.log('🛑 Vehicle engine off event:', d);
          setStreamStatus('standby');
          setEngineState('ENGINE_OFF');
        }
      },
      'vehicle-alert': (d) => {
        if (isDemo) return;
        const vid = d.vehicleId ?? d.vehicle_id;
        if (!vehicleId || vid === vehicleId) {
          console.log('🚨 Vehicle alert:', d);
          if (d.alertType === 'LOW_BATTERY') {
            setStreamStatus('low-battery');
            setBatteryProtection(d.batteryProtectionMode);
          }
        }
      },
      'vehicle-online': (d) => {
        if (isDemo) return;
        const vid = d.vehicleId ?? d.vehicle_id;
        if (!vehicleId || vid === vehicleId) {
          console.log('🟢 Vehicle online event:', d);
          if (d.online && d.engineState === 'ENGINE_ON') {
            setStreamStatus('live');
            setEngineState('ENGINE_ON');
          }
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
            engineState: latest.engineState,
            obdPollingActive: latest.obdPollingActive,
            isStandbyMode: latest.isStandbyMode
          });
          
          setLive(normalized);
          setEngineState(latest.engineState);
          setBatteryProtection(latest.batteryProtectionMode);
          
          const age = Date.now() - new Date(latest.timestamp || latest.recordedAt).getTime();
          
          // Determine status based on engine state and age
          if (latest.batteryProtectionMode) {
            setStreamStatus('low-battery');
          } else if (latest.isStandbyMode || latest.engineState === 'ENGINE_OFF' || latest.engineState === 'STANDBY') {
            setStreamStatus('standby');
          } else if (age < 30000) {
            setStreamStatus('live');
          } else if (age < 120000) {
            setStreamStatus('stale');
          } else {
            setStreamStatus('offline');
          }
        } else {
          console.warn('⚠️ No telemetry data received');
          if (streamStatus !== 'live' && streamStatus !== 'standby') {
            setStreamStatus('offline');
          }
        }
      } catch (err) {
        console.error('❌ Error fetching latest telemetry:', err);
        if (streamStatus !== 'live' && streamStatus !== 'standby') {
          setStreamStatus('offline');
        }
      }
    };

    fetchLatest();
    
    // Poll every 2 seconds (as backup to Socket.IO)
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
    standby: 'bg-yellow-900/50 text-yellow-100',
    'low-battery': 'bg-red-900/50 text-red-100',
    stale: 'bg-orange-900/50 text-orange-100',
    offline: 'bg-slate-800 text-slate-300',
  };
  
  const statusLabel = {
    live: 'LIVE - ENGINE ON',
    standby: 'STANDBY - ENGINE OFF',
    'low-battery': 'LOW BATTERY PROTECTION',
    stale: 'STALE',
    offline: 'OFFLINE'
  };

  const isEngineOff = engineState === 'ENGINE_OFF' || engineState === 'STANDBY' || streamStatus === 'standby';
  const isLowBattery = streamStatus === 'low-battery' || batteryProtection;

  return (
    <div className="space-y-6 text-white">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Live Diagnostics</h2>
          <p className="text-slate-400">
            {isDemo ? 'Demo Telemetry - simulated data' : 'Real OBD data — no mock values'}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${statusBadge[streamStatus]}`}>
          {statusLabel[streamStatus] || streamStatus}
        </span>
      </div>

      {/* Battery Protection Alert */}
      {isLowBattery && (
        <div className="rounded-3xl border border-red-500/30 bg-red-950/20 px-6 py-4 shadow-inner">
          <h3 className="font-semibold mb-2 text-red-200">🔋 Low Battery Protection Active</h3>
          <p className="text-sm text-red-300">
            OBD polling has been paused to protect your vehicle's battery. GPS tracking remains active.
            {batteryProtection && ` Mode: ${batteryProtection.replace(/_/g, ' ')}`}
          </p>
        </div>
      )}

      {/* Engine Off / Standby Message */}
      {isEngineOff && !isLowBattery && (
        <div className="rounded-3xl border border-yellow-500/30 bg-yellow-950/20 px-6 py-4 shadow-inner">
          <h3 className="font-semibold mb-2 text-yellow-200">🛑 Engine Off - Standby Mode</h3>
          <p className="text-sm text-yellow-300">
            OBD polling is paused to protect your vehicle's battery. GPS standby tracking is active.
            Last known OBD values are shown below (faded).
          </p>
        </div>
      )}

      {isLive && vehicles.length === 0 && !isEngineOff && (
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

      {/* OBD Gauges - Show with opacity if engine is off */}
      <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 ${isEngineOff ? 'opacity-50' : ''}`}>
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
      
      {isEngineOff && live && (
        <div className="text-center text-sm text-slate-400 italic">
          ↑ Last known values (engine is off, OBD polling paused)
        </div>
      )}

      <div className="card bg-slate-900 border border-slate-800">
        <h3 className="mb-2 font-semibold">Telemetry stream</h3>
        
        {/* Engine State Info */}
        {engineState && (
          <div className="mb-3">
            <span className="text-sm text-slate-400">Engine State: </span>
            <span className={`ml-2 text-sm font-semibold ${
              engineState === 'ENGINE_ON' ? 'text-green-400' : 
              engineState === 'ENGINE_OFF' ? 'text-yellow-400' : 
              'text-slate-400'
            }`}>
              {engineState.replace(/_/g, ' ')}
            </span>
            {live?.obdPollingActive !== undefined && (
              <>
                <span className="ml-4 text-sm text-slate-400">OBD Polling: </span>
                <span className={`ml-2 text-sm font-semibold ${live.obdPollingActive ? 'text-green-400' : 'text-yellow-400'}`}>
                  {live.obdPollingActive ? 'ACTIVE' : 'PAUSED'}
                </span>
              </>
            )}
          </div>
        )}
        
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
              <span className={`ml-2 font-semibold ${
                (live.batteryVoltage ?? live.voltage ?? 0) < 11.5 ? 'text-red-400' :
                (live.batteryVoltage ?? live.voltage ?? 0) < 12.0 ? 'text-yellow-400' : 
                'text-cyan-400'
              }`}>
                {live.batteryVoltage ?? live.voltage ?? '—'}V
              </span>
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
                  <span className="ml-2 text-green-400 font-semibold">
                    {isEngineOff ? 'Standby Tracking' : 'Active'}
                  </span>
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
