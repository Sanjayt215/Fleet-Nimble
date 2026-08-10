import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useMode } from '../context/ModeContext';
import { DEMO_FLEET } from '../data/demoData';
import api from '../services/api';
import { useSocket } from '../hooks/useSocket';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Demo GPS data for demo mode
const DEMO_GPS_POINTS = [
  { lat: 28.6139, lng: 77.2090, speed: 45 },
  { lat: 28.6239, lng: 77.2190, speed: 50 },
  { lat: 28.6339, lng: 77.2290, speed: 55 },
  { lat: 28.6439, lng: 77.2390, speed: 48 },
  { lat: 28.6539, lng: 77.2490, speed: 52 },
  { lat: 28.6639, lng: 77.2590, speed: 47 },
  { lat: 28.6739, lng: 77.2690, speed: 53 },
  { lat: 28.6839, lng: 77.2790, speed: 49 },
];

// Component to handle map center updates
function MapCenterUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
  return null;
}

export default function GpsTracking() {
  const { user } = useAuth();
  const { isDemo, isLive } = useMode();
  const location = useLocation();
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [liveVehicles, setLiveVehicles] = useState([]);
  const [gpsHistory, setGpsHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const mapRef = useRef(null);

  // Demo state
  const [demoPointIndex, setDemoPointIndex] = useState(0);

  // STEP 4: Socket.IO subscription for real-time GPS updates
  useSocket(
    {
      'live-gps-update': (data) => {
        if (isDemo) return;
        console.log('📍 GPS update received:', data);
        
        // Update vehicle position
        setLiveVehicles((prev) => {
          const index = prev.findIndex((v) => v.id === data.vehicleId);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = {
              ...updated[index],
              gpsLastLatitude: data.latitude,
              gpsLastLongitude: data.longitude,
              speed: data.speed,
              gpsLastAt: data.timestamp || new Date().toISOString(),
              gpsAccuracy: data.gpsAccuracy,
              gpsHeading: data.gpsHeading,
            };
            return updated;
          }
          return prev;
        });

        // Update selected vehicle if it's the one being updated
        if (selectedVehicle?.id === data.vehicleId) {
          setSelectedVehicle((prev) => ({
            ...prev,
            gpsLastLatitude: data.latitude,
            gpsLastLongitude: data.longitude,
            speed: data.speed,
            gpsLastAt: data.timestamp || new Date().toISOString(),
            gpsAccuracy: data.gpsAccuracy,
            gpsHeading: data.gpsHeading,
          }));
        }
      },
      'live-telemetry-update': (data) => {
        if (isDemo) return;
        if (data?.mode !== 'LIVE') return;
        const vid = data.vehicleId ?? data.vehicle_id;
        
        // Update vehicle online status
        setLiveVehicles((prev) => {
          const index = prev.findIndex((v) => v.id === vid);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = {
              ...updated[index],
              telemetryOnline: true,
              status: data.vehicle?.status || updated[index].status,
              lastTelemetryAt: new Date().toISOString(),
            };
            return updated;
          }
          return prev;
        });
      },
      'vehicle-online': (data) => {
        if (isDemo) return;
        console.log('🟢 Vehicle online event:', data);
        
        setLiveVehicles((prev) => {
          const index = prev.findIndex((v) => v.id === data.vehicleId);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = {
              ...updated[index],
              telemetryOnline: data.online !== false,
              status: data.status || updated[index].status,
            };
            return updated;
          }
          return prev;
        });
      }
    }
  );

  // Load live data
  useEffect(() => {
    if (isLive) {
      loadLiveGps();
      // STEP 4: Refresh GPS data every 2 seconds (as backup to Socket.IO)
      const interval = setInterval(loadLiveGps, 2000);
      return () => clearInterval(interval);
    } else {
      setLiveVehicles(DEMO_FLEET.map(v => ({
        ...v,
        gpsLastLatitude: DEMO_GPS_POINTS[0].lat,
        gpsLastLongitude: DEMO_GPS_POINTS[0].lng,
        speed: DEMO_GPS_POINTS[0].speed,
        gpsLastAt: new Date().toISOString(),
      })));
    }
  }, [isLive]);

  // Demo animation
  useEffect(() => {
    if (!isDemo) return;

    const interval = setInterval(() => {
      setDemoPointIndex(prev => (prev + 1) % DEMO_GPS_POINTS.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [isDemo]);

  useEffect(() => {
    if (isDemo) {
      const point = DEMO_GPS_POINTS[demoPointIndex];
      setLiveVehicles(DEMO_FLEET.map((v, i) => ({
        ...v,
        gpsLastLatitude: point.lat + (i * 0.01),
        gpsLastLongitude: point.lng + (i * 0.01),
        speed: point.speed,
        gpsLastAt: new Date().toISOString(),
      })));
      setGpsHistory(DEMO_GPS_POINTS.map(p => ({
        latitude: p.lat,
        longitude: p.lng,
        speed: p.speed,
        timestamp: new Date().toISOString(),
      })));
    }
  }, [demoPointIndex, isDemo]);

  const loadLiveGps = async () => {
    try {
      setLoading(true);
      const res = await api.get('/mobile/vehicles/my');
      if (res.data.success) {
        const vehicles = res.data.data || [];
        setLiveVehicles(vehicles.filter(v => v.gpsLastLatitude && v.gpsLastLongitude));
      }
    } catch (err) {
      console.error('Error loading live GPS:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadGpsHistory = async (vehicleId) => {
    if (isDemo) {
      setGpsHistory(DEMO_GPS_POINTS.map(p => ({
        latitude: p.lat,
        longitude: p.lng,
        speed: p.speed,
        timestamp: new Date().toISOString(),
      })));
      return;
    }

    try {
      const res = await api.get(`/mobile/telemetry/history/${vehicleId}`, { params: { limit: 100 } });
      if (res.data.success) {
        const telemetry = res.data.data || [];
        const gpsPoints = telemetry
          .filter(t => t.latitude && t.longitude)
          .map(t => ({
            latitude: t.latitude,
            longitude: t.longitude,
            speed: t.speed,
            timestamp: t.timestamp,
          }));
        setGpsHistory(gpsPoints);
      }
    } catch (err) {
      console.error('Error loading GPS history:', err);
    }
  };

  const handleVehicleSelect = (vehicle) => {
    setSelectedVehicle(vehicle);
    loadGpsHistory(vehicle.id);
  };

  const mapCenter = selectedVehicle 
    ? [selectedVehicle.gpsLastLatitude || 28.6139, selectedVehicle.gpsLastLongitude || 77.2090]
    : [28.6139, 77.2090];

  const historyPolyline = gpsHistory.map(p => [p.latitude, p.longitude]);

  // Calculate time since last update
  const getTimeSinceUpdate = (lastUpdate) => {
    if (!lastUpdate) return 'Never';
    const seconds = Math.floor((Date.now() - new Date(lastUpdate).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">GPS Tracking</h2>
          <p className="text-slate-400">Track your fleet in real-time</p>
        </div>
        <button 
          className="btn-primary" onClick={loadLiveGps} disabled={loading || isDemo}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {isLive && liveVehicles.length === 0 && (
        <div className="rounded-3xl border border-cyan-500/30 bg-cyan-950/20 px-6 py-4 text-cyan-200 shadow-inner">
          <h3 className="font-semibold mb-2">Waiting for GPS data from mobile app.</h3>
          <p className="text-sm">Start the mobile app with GPS enabled to see vehicle locations.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <h3 className="text-lg font-semibold text-white">Vehicles ({liveVehicles.length})</h3>
          <div className="space-y-2">
            {liveVehicles.map(vehicle => (
              <div
                key={vehicle.id}
                onClick={() => handleVehicleSelect(vehicle)}
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                  selectedVehicle?.id === vehicle.id
                    ? 'bg-cyan-900/30 border-cyan-500'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-white">{vehicle.vehicleName}</h4>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    vehicle.telemetryOnline ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400'
                  }`}>
                    {vehicle.telemetryOnline ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>
                <p className="text-sm text-slate-400">{vehicle.registrationNumber}</p>
                {vehicle.speed != null && (
                  <p className="text-sm text-cyan-400 mt-1">{vehicle.speed} km/h</p>
                )}
                <p className="text-xs text-slate-500 mt-1">
                  {getTimeSinceUpdate(vehicle.gpsLastAt || vehicle.lastTelemetryAt)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 h-[500px]">
            {selectedVehicle ? (
              <div className="space-y-4 h-full">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{selectedVehicle.vehicleName}</h3>
                    <p className="text-sm text-slate-400">{selectedVehicle.registrationNumber}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-cyan-400">{selectedVehicle.speed ?? 0} km/h</p>
                    <p className="text-sm text-slate-500">
                      {selectedVehicle.gpsLastAt ? getTimeSinceUpdate(selectedVehicle.gpsLastAt) : 'No GPS data'}
                    </p>
                    {selectedVehicle.gpsAccuracy && (
                      <p className="text-xs text-slate-600">Accuracy: {selectedVehicle.gpsAccuracy.toFixed(1)}m</p>
                    )}
                  </div>
                </div>

                {/* STEP 4: GPS Data Display */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-slate-800/50 p-3 rounded-lg">
                  <div>
                    <span className="text-slate-500">Latitude:</span>
                    <span className="ml-2 text-cyan-400">{selectedVehicle.gpsLastLatitude?.toFixed(6) ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Longitude:</span>
                    <span className="ml-2 text-cyan-400">{selectedVehicle.gpsLastLongitude?.toFixed(6) ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Speed:</span>
                    <span className="ml-2 text-cyan-400">{selectedVehicle.speed ?? 0} km/h</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Heading:</span>
                    <span className="ml-2 text-cyan-400">{selectedVehicle.gpsHeading?.toFixed(0) ?? '—'}°</span>
                  </div>
                </div>

                <div className="flex-1 h-[350px] rounded-lg overflow-hidden border border-slate-700">
                  <MapContainer 
                    ref={mapRef}
                    center={mapCenter} 
                    zoom={13} 
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <MapCenterUpdater center={mapCenter} />
                    {selectedVehicle.gpsLastLatitude && selectedVehicle.gpsLastLongitude && (
                      <Marker position={[selectedVehicle.gpsLastLatitude, selectedVehicle.gpsLastLongitude]}>
                        <Popup>
                          <strong>{selectedVehicle.vehicleName}</strong><br />
                          {selectedVehicle.registrationNumber}<br />
                          Speed: {selectedVehicle.speed ?? 0} km/h<br />
                          {selectedVehicle.gpsLastAt && `Updated: ${getTimeSinceUpdate(selectedVehicle.gpsLastAt)}`}
                        </Popup>
                      </Marker>
                    )}
                    {historyPolyline.length > 1 && (
                      <Polyline positions={historyPolyline} color="rgb(6, 182, 212)" weight={3} />
                    )}
                  </MapContainer>
                </div>

                {gpsHistory.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-slate-400 mb-2">Route History ({gpsHistory.length} points)</h4>
                    <div className="bg-slate-950 rounded-lg p-3 max-h-24 overflow-y-auto">
                      {gpsHistory.slice(-10).reverse().map((point, i) => (
                        <div key={i} className="text-xs text-slate-500 py-1 flex justify-between">
                          <span>{point.latitude.toFixed(4)}, {point.longitude.toFixed(4)}</span>
                          <span className="text-cyan-500">{point.speed ?? 0} km/h</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-xl text-slate-400">Select a vehicle to view GPS data</p>
                  {isLive && liveVehicles.length === 0 && (
                    <p className="text-slate-500 mt-2">Waiting for mobile GPS data...</p>
                  )}
                  {isLive && liveVehicles.length > 0 && liveVehicles.every(v => !v.gpsLastLatitude) && (
                    <p className="text-slate-500 mt-2">No GPS coordinates available yet</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
