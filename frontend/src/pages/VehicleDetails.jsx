import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import GaugeChart from '../components/GaugeChart';
import { useSocket } from '../hooks/useSocket';
import { mergeTelemetry } from '../utils/telemetryFormat';
import { TelemetryHealthCard } from '../components/VehicleStatusBadge';

export default function VehicleDetails() {
  const { id } = useParams();
  const [vehicle, setVehicle] = useState(null);
  const [live, setLive] = useState(null);

  useSocket(
    {
      'live:update': (d) => {
        if (d.vehicleId === id || d.vehicleId === undefined) {
          setLive((prev) => mergeTelemetry(prev, d));
        }
      },
      'device:heartbeat': (d) => {
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
    id
  );

  useEffect(() => {
    api.get(`/vehicles/${id}`).then((r) => {
      setVehicle(r.data.data);
      if (r.data.data.liveData?.[0]) setLive(r.data.data.liveData[0]);
    });
    api.get(`/obd/latest/${id}`).then((r) => r.data.data && setLive(r.data.data));
  }, [id]);

  if (!vehicle) return <div className="animate-pulse">Loading...</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link to="/vehicles" className="text-fleet-600 hover:underline">← Vehicles</Link>
        <h2 className="text-2xl font-bold">
          {vehicle.make} {vehicle.model} {vehicle.year}
        </h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TelemetryHealthCard health={vehicle.telemetryHealth} />
        <div className="card"><p className="text-sm text-slate-500">VIN</p><p className="font-mono">{vehicle.vin || '—'}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Plate</p><p>{vehicle.plateNumber || '—'}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Odometer</p><p>{vehicle.odometer?.toLocaleString()} km</p></div>
        <div className="card">
          <p className="text-sm text-slate-500">MIL (check engine)</p>
          <p className={vehicle.milOn ? 'font-semibold text-red-600' : 'text-green-600'}>
            {vehicle.milOn == null ? '—' : vehicle.milOn ? 'ON' : 'OFF'}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Engine hours (OBD)</p>
          <p>{vehicle.engineHoursObd != null ? vehicle.engineHoursObd.toFixed(1) : '—'}</p>
        </div>
        <div className="card flex flex-col gap-2">
          <Link to={`/vehicles/${id}/live`} className="btn-primary inline-block text-center">
            Live OBD
          </Link>
          <Link to={`/diagnostics?vehicle=${id}`} className="btn-secondary inline-block text-center text-sm">
            Diagnostics
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
          <h3 className="mb-2 font-semibold">Readiness monitors</h3>
          <pre className="overflow-auto text-xs">{JSON.stringify(vehicle.readinessMonitors, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
