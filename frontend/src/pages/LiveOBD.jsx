import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import { useSocket } from '../hooks/useSocket';
import GaugeChart from '../components/GaugeChart';
import StatCard from '../components/StatCard';
import OBDHistoryChart from '../components/OBDHistoryChart';
import VehicleStatusBadge from '../components/VehicleStatusBadge';
import { mergeTelemetry, formatWithUnit, formatValue, isSafeNumber, clamp } from '../utils/telemetryFormat';

// LIVE OBD — real-time vehicle telemetry page
function LeafletMap({ lat, lng }) {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const load = () => {
      if (!window.L || !containerRef.current) return;
      if (!mapRef.current) {
        mapRef.current = window.L.map(containerRef.current).setView([lat, lng], 15);
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap',
        }).addTo(mapRef.current);
        markerRef.current = window.L.marker([lat, lng]).addTo(mapRef.current);
      } else {
        markerRef.current?.setLatLng([lat, lng]);
      }
    };
    if (!window.L) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = load;
      document.body.appendChild(script);
    } else {
      load();
    }
  }, [lat, lng]);

  return <div ref={containerRef} className="h-48 w-full rounded-lg" />;
}

function connectionStatus(lastAt) {
  if (!lastAt) return { label: '● OFFLINE', color: 'text-red-500' };
  const age = Date.now() - new Date(lastAt).getTime();
  if (age < 30000) return { label: '● LIVE', color: 'text-green-500' };
  if (age < 120000) return { label: '● DELAYED', color: 'text-yellow-500' };
  return { label: '● OFFLINE', color: 'text-red-500' };
}

export default function LiveOBD() {
  const { vehicleId } = useParams();
  const [live, setLive] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [telemetryHealth, setTelemetryHealth] = useState(null);

  useSocket(
    {
      'live-telemetry-update': (d) => {
        if (d?.mode !== 'LIVE') return;
        const vid = d.vehicleId ?? d.vehicle?.id ?? d.vehicle_id;
        if (vid === vehicleId) {
          setLive((prev) => mergeTelemetry(prev, d));
          setTelemetryHealth((prev) => ({
            ...(prev || {}),
            streamStatus: 'live',
            lastObdAt: d.recordedAt || d.timestamp || new Date().toISOString(),
          }));
          if (d.vehicle) {
            setVehicle((prev) => ({ ...prev, ...d.vehicle }));
          }
        }
      },
      'vehicle:status': (d) => {
        if (d.vehicleId === vehicleId && d.online === false) {
          setLive((prev) => (prev ? { ...prev, telemetryOnline: false } : prev));
          setTelemetryHealth((prev) => ({
            ...(prev || {}),
            streamStatus: 'offline',
            telemetryOnline: false,
          }));
        }
      },
      'device:heartbeat': (d) => {
        if (d.vehicleId === vehicleId) {
          setTelemetryHealth((prev) => ({
            ...(prev || {}),
            mqttStatus: d.mqttStatus,
            lastHeartbeatAt: d.lastHeartbeatAt ?? prev?.lastHeartbeatAt,
          }));
        }
      },
      'dtc:new': () => {
        api.get(`/dtc/${vehicleId}`).catch(() => {});
      },
    },
    vehicleId
  );

  useEffect(() => {
    api.get(`/vehicles/${vehicleId}`).then((r) => {
      setVehicle(r.data.data);
      setTelemetryHealth(r.data.data?.telemetryHealth ?? null);
    }).catch(() => {
      setVehicle(null);
    });
    api.get(`/mobile/telemetry/history/${vehicleId}`, { params: { limit: 1 } })
      .then((r) => {
        const entries = r.data.data || [];
        if (entries.length > 0) {
          setLive(entries[0]);
          if (entries[0].telemetryHealth) setTelemetryHealth(entries[0].telemetryHealth);
        }
      })
      .catch(() => {
        setLive(null);
      });
  }, [vehicleId]);

  const status = live?.telemetryOnline === false
    ? { label: '● OFFLINE', color: 'text-red-500' }
    : telemetryHealth?.streamStatus === 'live'
      ? { label: '● LIVE', color: 'text-green-500' }
      : telemetryHealth?.streamStatus === 'stale'
        ? { label: '● DELAYED', color: 'text-yellow-500' }
        : telemetryHealth?.streamStatus === 'offline'
          ? { label: '● OFFLINE', color: 'text-red-500' }
          : connectionStatus(live?.recordedAt);
  const lat = live?.latitude ?? live?.gps?.lat;
  const lng = live?.longitude ?? live?.gps?.lng;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link to={`/vehicles/${vehicleId}`} className="text-fleet-600 hover:underline">
          ← {vehicle ? `${vehicle.make} ${vehicle.model}` : 'Vehicle'}
        </Link>
        <h2 className="text-2xl font-bold text-white">Live OBD</h2>
      </div>

      <div className={`flex flex-col gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${status.color}`}>
        <div className="flex flex-col gap-2">
          <span className="font-semibold">{status.label}</span>
          {telemetryHealth && (
            <div className="text-slate-300">
              <VehicleStatusBadge health={telemetryHealth} />
            </div>
          )}
        </div>
        <span className="text-sm text-slate-400">
          Last update: {live?.recordedAt ? new Date(live.recordedAt).toLocaleString() : 'Never'}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <GaugeChart label="RPM" value={live?.rpm} unit="rpm" max={8000} color="#3b82f6" />
        <GaugeChart label="Speed" value={live?.speed} unit="km/h" max={220} color="#10b981" />
        <GaugeChart label="Engine Load" value={live?.engineLoad} unit="%" max={100} color="#8b5cf6" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard title="Coolant" value={live?.coolantTemp != null ? formatWithUnit('coolantTemp', live?.coolantTemp) : '—'} />
        <StatCard title="Fuel" value={live?.fuelLevel != null ? formatWithUnit('fuelLevel', live?.fuelLevel) : '—'} />
        <StatCard title="Battery" value={live?.batteryVoltage != null ? formatWithUnit('batteryVoltage', live?.batteryVoltage) : '—'} />
        <StatCard title="Throttle" value={live?.throttle != null ? formatWithUnit('throttlePosition', live?.throttle) : '—'} />
        <StatCard title="MAF" value={live?.maf != null ? formatWithUnit('maf', live?.maf) : '—'} />
        <StatCard title="Intake" value={live?.intakeTemp != null ? formatWithUnit('intakeTemp', live?.intakeTemp) : '—'} />
      </div>

      {lat != null && lng != null && (
        <div className="card bg-slate-900">
          <h3 className="mb-3 font-semibold text-white">GPS Position</h3>
          <LeafletMap lat={lat} lng={lng} />
          <p className="mt-2 text-xs text-slate-500">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </p>
        </div>
      )}

      <OBDHistoryChart vehicleId={vehicleId} liveUpdate={live} />
    </div>
  );
}
