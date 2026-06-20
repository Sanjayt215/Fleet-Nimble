import { useEffect, useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import api from '../services/api';
import GaugeChart from '../components/GaugeChart';
import { useSocket } from '../hooks/useSocket';
import { mergeTelemetry } from '../utils/telemetryFormat';
import { TelemetryHealthCard } from '../components/VehicleStatusBadge';
import { useMode } from '../context/ModeContext';
import { DEMO_FLEET } from '../data/demoData';

export default function VehicleDetails() {
  const { id } = useParams();
  const location = useLocation();
  const { isDemo } = useMode();
  const [vehicle, setVehicle] = useState(null);
  const [live, setLive] = useState(null);

  const getBasePath = () => location.pathname.startsWith('/demo') ? '/demo' : '/analysis';

  useSocket(
    {
      'live-telemetry-update': (d) => {
        if (isDemo) return;
        if (d?.mode !== 'LIVE') return;
        const vid = d.vehicleId ?? d.vehicle?.id ?? d.vehicle_id;
        if (vid === id) {
          if (d.vehicle) {
            setVehicle((prev) => ({ ...prev, ...d.vehicle }));
          }
          setLive((prev) => mergeTelemetry(prev, d));
        }
      },
      'device:heartbeat': (d) => {
        if (isDemo) return; // Don't use socket in demo mode
        if (d.vehicleId === id) {
          setVehicle((prev) => prev ? {
            ...prev,
            telemetryHealth: {
              ...prev.telemetryHealth,
              mqttStatus: d.mqttStatus,
              lastHeartbeatAt: d.lastHeartbeatAt ?? prev.telemetryHealth?.lastHeartbeatAt,
            },
          } : prev);
        }
      },
    },
    isDemo ? null : id
  );

  useEffect(() => {
    if (isDemo) {
      const demoVehicle = DEMO_FLEET.find(v => v.id === id);
      if (demoVehicle) {
        setVehicle(demoVehicle);
        setLive({
          rpm: Math.floor(Math.random() * (4000 - 800) + 800),
          speed: Math.floor(Math.random() * (80 - 0) + 0),
          fuelLevel: Math.floor(Math.random() * (100 - 20) + 20),
          coolantTemp: Math.floor(Math.random() * (95 - 70) + 70),
          batteryVoltage: (Math.random() * (14.2 - 12.4) + 12.4).toFixed(1),
          engineLoad: Math.floor(Math.random() * (60 - 10) + 10)
        });
      }
    } else {
      api.get(`/vehicles/${id}`).then((r) => {
        setVehicle(r.data.data);
      }).catch(() => setVehicle(null));
      api.get(`/mobile/telemetry/history/${id}`, { params: { limit: 1 } })
        .then((r) => {
          const entries = r.data.data || [];
          if (entries.length > 0) setLive(entries[0]);
        })
        .catch(() => {});
    }
  }, [id, isDemo]);

  if (!vehicle) return <div className="animate-pulse">Loading...</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link to={`${getBasePath()}/vehicles`} className="text-cyan-400 hover:underline">← Vehicles</Link>
        <h2 className="text-2xl font-bold text-white">
          {vehicle.make} {vehicle.model} {vehicle.year}
        </h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TelemetryHealthCard health={vehicle.telemetryHealth} />
        <div className="card bg-slate-900/50 border-slate-700">
          <p className="text-sm text-slate-400">VIN</p>
          <p className="font-mono text-white">{vehicle.vin || '—'}</p>
        </div>
        <div className="card bg-slate-900/50 border-slate-700">
          <p className="text-sm text-slate-400">Plate Number</p>
          <p className="text-white">{vehicle.registrationNumber || vehicle.plateNumber || '—'}</p>
        </div>
        <div className="card bg-slate-900/50 border-slate-700">
          <p className="text-sm text-slate-400">Odometer</p>
          <p className="text-white">{vehicle.odometer?.toLocaleString() || '—'} km</p>
        </div>
        <div className="card bg-slate-900/50 border-slate-700">
          <p className="text-sm text-slate-400">Manufacturer</p>
          <p className="text-white">{vehicle.manufacturer || '—'}</p>
        </div>
        <div className="card bg-slate-900/50 border-slate-700">
          <p className="text-sm text-slate-400">Body Class</p>
          <p className="text-white">{vehicle.bodyClass || '—'}</p>
        </div>
        <div className="card bg-slate-900/50 border-slate-700">
          <p className="text-sm text-slate-400">Engine Model</p>
          <p className="text-white">{vehicle.engineModel || '—'}</p>
        </div>
        <div className="card bg-slate-900/50 border-slate-700">
          <p className="text-sm text-slate-400">Fuel Type</p>
          <p className="text-white">{vehicle.fuelType || '—'}</p>
        </div>
        <div className="card bg-slate-900/50 border-slate-700">
          <p className="text-sm text-slate-400">MIL (Check Engine)</p>
          <p className={vehicle.milOn ? 'font-semibold text-red-400' : 'text-green-400'}>
            {vehicle.milOn == null ? '—' : vehicle.milOn ? 'ON' : 'OFF'}
          </p>
        </div>
        <div className="card bg-slate-900/50 border-slate-700">
          <p className="text-sm text-slate-400">Engine Hours (OBD)</p>
          <p className="text-white">{vehicle.engineHoursObd != null ? vehicle.engineHoursObd.toFixed(1) : '—'}</p>
        </div>
        <div className="card bg-slate-900/50 border-slate-700 flex flex-col gap-2">
          <Link to={`${getBasePath()}/vehicles/${id}/live`} className="btn-primary inline-block text-center">
            Live OBD
          </Link>
          <Link to={`${getBasePath()}/diagnostics?vehicle=${id}`} className="btn-secondary inline-block text-center text-sm">
            Diagnostics
          </Link>
          <Link to={`${getBasePath()}/gps-tracking`} className="btn-secondary inline-block text-center text-sm">
            GPS Tracking
          </Link>
        </div>
      </div>

      <div>
        <h3 className="mb-4 text-lg font-semibold">Live Telemetry</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <GaugeChart label="RPM" value={live?.rpm} unit="rpm" max={8000} color="#3b82f6" />
          <GaugeChart label="Speed" value={live?.speed} unit="km/h" max={200} color="#10b981" />
          <GaugeChart label="Fuel" value={live?.fuelLevel} unit="%" max={100} color="#f59e0b" />
          <GaugeChart label="Coolant" value={live?.coolantTemp} unit="°C" max={120} color="#ef4444" />
          <GaugeChart label="Battery" value={live?.batteryVoltage} unit="V" max={15} color="#8b5cf6" />
          <GaugeChart label="Load" value={live?.engineLoad} unit="%" max={100} />
          <GaugeChart label="Throttle" value={live?.throttle} unit="%" max={100} />
          <GaugeChart label="Intake" value={live?.intakeTemp} unit="°C" max={80} />
          <GaugeChart label="MAF" value={live?.maf} unit="g/s" max={500} />
        </div>
      </div>

      {vehicle.readinessMonitors && (
        <div className="card">
          <h3 className="mb-2 font-semibold">Readiness Monitors</h3>
          <pre className="overflow-auto text-xs">{JSON.stringify(vehicle.readinessMonitors, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
