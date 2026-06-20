import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import api from '../services/api';
import { useSocket } from '../hooks/useSocket';
import GaugeChart from '../components/GaugeChart';
import StatCard from '../components/StatCard';
import OBDHistoryChart from '../components/OBDHistoryChart';
import VehicleStatusBadge from '../components/VehicleStatusBadge';
import { mergeTelemetry, formatWithUnit } from '../utils/telemetryFormat';
import { useMode } from '../context/ModeContext';
import { DEMO_FLEET } from '../data/demoData';

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

function generateDemoData(baseLat, baseLng, lastData) {
  const rpm = lastData ? 
    Math.max(700, Math.min(3500, lastData.rpm + (Math.random() * 200 - 100))) :
    Math.floor(Math.random() * (3500 - 700) + 700);
  const speed = lastData ? 
    Math.max(0, Math.min(120, lastData.speed + (Math.random() * 10 - 5))) :
    Math.floor(Math.random() * 120);
  const engineLoad = lastData ? 
    Math.max(10, Math.min(90, lastData.engineLoad + (Math.random() * 10 - 5))) :
    Math.floor(Math.random() * (90 - 10) + 10);
  const coolantTemp = lastData ? 
    Math.max(75, Math.min(105, lastData.coolantTemp + (Math.random() * 2 - 1))) :
    Math.floor(Math.random() * (105 - 75) + 75);
  const fuelLevel = lastData ? 
    Math.max(10, Math.min(100, lastData.fuelLevel - Math.random() * 0.1)) :
    Math.floor(Math.random() * (100 - 10) + 10);
  const batteryVoltage = lastData ? 
    Math.max(12.0, Math.min(14.8, lastData.batteryVoltage + (Math.random() * 0.2 - 0.1))) :
    parseFloat((Math.random() * (14.8 - 12.0) + 12.0).toFixed(1));
  const throttle = lastData ? 
    Math.max(0, Math.min(80, lastData.throttle + (Math.random() * 5 - 2.5))) :
    Math.floor(Math.random() * 80);
  const maf = lastData ? 
    Math.max(2, Math.min(80, lastData.maf + (Math.random() * 4 - 2))) :
    parseFloat((Math.random() * (80 - 2) + 2).toFixed(1));
  const intakeTemp = lastData ? 
    Math.max(25, Math.min(70, lastData.intakeTemp + (Math.random() * 2 - 1))) :
    Math.floor(Math.random() * (70 - 25) + 25);
  
  const latitude = lastData ? 
    baseLat + (Math.random() * 0.001 - 0.0005) :
    baseLat;
  const longitude = lastData ? 
    baseLng + (Math.random() * 0.001 - 0.0005) :
    baseLng;

  return {
    rpm,
    speed,
    engineLoad,
    coolantTemp,
    fuelLevel,
    batteryVoltage,
    throttle,
    maf,
    intakeTemp,
    latitude,
    longitude,
    recordedAt: new Date().toISOString(),
    telemetryOnline: true,
  };
}

export default function LiveOBD() {
  const { vehicleId } = useParams();
  const location = useLocation();
  const { isDemo } = useMode();
  const [live, setLive] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [telemetryHealth, setTelemetryHealth] = useState(null);
  const [demoHistory, setDemoHistory] = useState([]);
  const lastDataRef = useRef(null);

  const getBasePath = () => location.pathname.startsWith('/demo') ? '/demo' : '/analysis';

  useSocket(
    {
      'live-telemetry-update': (d) => {
        if (isDemo) return;
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
        if (isDemo) return;
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
        if (isDemo) return;
        if (d.vehicleId === vehicleId) {
          setTelemetryHealth((prev) => ({
            ...(prev || {}),
            mqttStatus: d.mqttStatus,
            lastHeartbeatAt: d.lastHeartbeatAt ?? prev?.lastHeartbeatAt,
          }));
        }
      },
      'dtc:new': () => {
        if (isDemo) return;
        api.get(`/dtc/${vehicleId}`).catch(() => {});
      },
    },
    isDemo ? null : vehicleId
  );

  useEffect(() => {
    if (isDemo) {
      const demoVehicle = DEMO_FLEET.find(v => v.id === vehicleId);
      if (demoVehicle) {
        setVehicle(demoVehicle);
        const initialData = generateDemoData(demoVehicle.gpsLastLatitude, demoVehicle.gpsLastLongitude, null);
        setLive(initialData);
        lastDataRef.current = initialData;
        setDemoHistory([initialData]);
        setTelemetryHealth({
          streamStatus: 'live',
          telemetryOnline: true,
        });
      }
    } else {
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
    }
  }, [vehicleId, isDemo]);

  useEffect(() => {
    if (!isDemo) return;
    if (!vehicle) return;

    const interval = setInterval(() => {
      const newData = generateDemoData(
        vehicle.gpsLastLatitude,
        vehicle.gpsLastLongitude,
        lastDataRef.current
      );
      setLive(newData);
      lastDataRef.current = newData;
      setDemoHistory(prev => [...prev, newData].slice(-100));
    }, 2500);

    return () => clearInterval(interval);
  }, [isDemo, vehicle]);

  const status = isDemo ? 
    { label: '● DEMO MODE', color: 'text-cyan-400' } :
    live?.telemetryOnline === false
    ? { label: '● OFFLINE', color: 'text-red-500' }
    : telemetryHealth?.streamStatus === 'live'
      ? { label: '● LIVE', color: 'text-green-500' }
      : telemetryHealth?.streamStatus === 'stale'
        ? { label: '● DELAYED', color: 'text-yellow-500' }
        : telemetryHealth?.streamStatus === 'offline'
          ? { label: '● OFFLINE', color: 'text-red-500' }
          : { label: '● OFFLINE', color: 'text-red-500' };

  const lat = live?.latitude ?? live?.gps?.lat;
  const lng = live?.longitude ?? live?.gps?.lng;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link to={`${getBasePath()}/vehicles/${vehicleId}`} className="text-cyan-400 hover:underline">
          ← {vehicle ? `${vehicle.make} ${vehicle.model}` : 'Vehicle'}
        </Link>
        <h2 className="text-2xl font-bold text-white">Live OBD</h2>
      </div>

      <div className={`flex flex-col gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${status.color}`}>
        <div className="flex flex-col gap-2">
          <span className="font-semibold">{status.label}</span>
          {telemetryHealth && !isDemo && (
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

      <OBDHistoryChart vehicleId={vehicleId} liveUpdate={live} isDemo={isDemo} demoHistory={demoHistory} />
    </div>
  );
}