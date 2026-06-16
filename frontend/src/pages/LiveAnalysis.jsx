import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useSocket } from '../hooks/useSocket';

export default function LiveAnalysis() {
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [selectedObdDevice, setSelectedObdDevice] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [loading, setLoading] = useState(true);

  // Socket.IO event listeners
  useSocket({
    'vehicle-registered': (data) => {
      setVehicles(prev => [data.vehicle, ...prev.filter(v => v.id !== data.vehicle.id)]);
      if (!selectedVehicle) setSelectedVehicle(data.vehicle);
      if (data.obdDevice) setSelectedObdDevice(data.obdDevice);
    },
    'live-telemetry-update': (data) => {
      if (data?.mode && data.mode !== 'LIVE') return;
      if (!selectedVehicle || data.vehicleId === selectedVehicle.id) {
        setTelemetry(data);
        if (data.vehicle) setSelectedVehicle(prev => data.vehicle || prev);
      }
    },
  });

  useEffect(() => {
    // Fetch user's vehicles
    const fetchData = async () => {
      try {
        // Try both endpoints for backwards compatibility
        let vehiclesRes;
        try {
          vehiclesRes = await api.get('/vehicles/my');
        } catch {
          vehiclesRes = await api.get('/mobile/vehicles/my');
        }
        
        let telemetryRes;
        try {
          telemetryRes = await api.get('/mobile/telemetry/latest');
        } catch {
          telemetryRes = { data: { data: null } };
        }
        
        const userVehicles = vehiclesRes.data.data;
        setVehicles(userVehicles);
        if (userVehicles.length > 0) {
          setSelectedVehicle(userVehicles[0]);
          if (userVehicles[0].obdDevices?.length > 0) {
            setSelectedObdDevice(userVehicles[0].obdDevices[0]);
          }
        }
        if (telemetryRes.data.data) {
          setTelemetry(telemetryRes.data.data);
          if (telemetryRes.data.data.vehicle) {
            setSelectedVehicle(telemetryRes.data.data.vehicle);
          }
          if (telemetryRes.data.data.obdDevice) {
            setSelectedObdDevice(telemetryRes.data.data.obdDevice);
          }
        }
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const formatIntValue = (value, unit = '') => {
    if (value == null || value === '' || isNaN(value) || !isFinite(value)) return '—';
    return `${Math.round(Number(value))}${unit}`;
  };

  const formatFloatValue = (value, unit = '', decimals = 1) => {
    if (value == null || value === '' || isNaN(value) || !isFinite(value)) return '—';
    return `${Number(value).toFixed(decimals)}${unit}`;
  };

  const formatTimestamp = (ts) => {
    if (!ts) return 'No live data yet';
    const date = new Date(ts);
    return date.toLocaleString();
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Live Vehicle Analysis</h1>
            <p className="text-slate-400 mt-1">Real-time data from your OpenOBD app</p>
          </div>
          <Link to="/" className="text-cyan-400 hover:text-cyan-300">
            ← Back to Home
          </Link>
        </div>

        {/* Status Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${vehicles.length > 0 ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
              <div>
                <p className="text-sm text-slate-400">Mobile App Connection</p>
                <p className="font-semibold">{vehicles.length > 0 ? 'Connected' : 'Waiting'}</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${selectedObdDevice ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
              <div>
                <p className="text-sm text-slate-400">OBD Device</p>
                <p className="font-semibold">{selectedObdDevice ? 'Connected' : 'Waiting'}</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${telemetry ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
              <div>
                <p className="text-sm text-slate-400">Live Telemetry</p>
                <p className="font-semibold">{telemetry ? 'Receiving' : 'Waiting'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Vehicle Info */}
        {selectedVehicle ? (
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-8">
            <h2 className="text-xl font-semibold mb-4">Vehicle Details</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-slate-400">Vehicle Name</p>
                <p className="font-semibold">{selectedVehicle.vehicleName || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Registration</p>
                <p className="font-semibold">{selectedVehicle.registrationNumber || selectedVehicle.plateNumber || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Make & Model</p>
                <p className="font-semibold">{selectedVehicle.make} {selectedVehicle.model}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Year</p>
                <p className="font-semibold">{selectedVehicle.year || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Fuel Type</p>
                <p className="font-semibold">{selectedVehicle.fuelType || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">VIN</p>
                <p className="font-semibold">{selectedVehicle.vin || '—'}</p>
              </div>
              {selectedObdDevice && (
                <>
                  <div>
                    <p className="text-sm text-slate-400">OBD Device Name</p>
                    <p className="font-semibold">{selectedObdDevice.deviceName || '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Last Connected</p>
                    <p className="font-semibold">{formatTimestamp(selectedObdDevice.lastConnectedAt)}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-8 text-center">
            <p className="text-lg mb-2">No vehicle connected yet</p>
            <p className="text-slate-400">Login to OpenOBD app with the same account and register your car.</p>
          </div>
        )}

        {/* Live Telemetry */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <p className="text-sm text-slate-400 mb-1">RPM</p>
            <p className="text-3xl font-bold text-cyan-400">{formatIntValue(telemetry?.rpm)}</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <p className="text-sm text-slate-400 mb-1">Speed</p>
            <p className="text-3xl font-bold text-cyan-400">{formatIntValue(telemetry?.speed, ' km/h')}</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <p className="text-sm text-slate-400 mb-1">Fuel Level</p>
            <p className="text-3xl font-bold text-cyan-400">{formatIntValue(telemetry?.fuelLevel, '%')}</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <p className="text-sm text-slate-400 mb-1">Coolant Temp</p>
            <p className="text-3xl font-bold text-cyan-400">{formatIntValue(telemetry?.coolantTemp, '°C')}</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <p className="text-sm text-slate-400 mb-1">Battery Voltage</p>
            <p className="text-3xl font-bold text-cyan-400">{formatFloatValue(telemetry?.batteryVoltage, ' V', 1)}</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <p className="text-sm text-slate-400 mb-1">Engine Load</p>
            <p className="text-3xl font-bold text-cyan-400">{formatIntValue(telemetry?.engineLoad, '%')}</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <p className="text-sm text-slate-400 mb-1">Location</p>
            <p className="text-lg font-semibold text-cyan-400">
              {telemetry?.latitude && telemetry?.longitude && isFinite(telemetry.latitude) && isFinite(telemetry.longitude)
                ? `${telemetry.latitude.toFixed(4)}, ${telemetry.longitude.toFixed(4)}`
                : 'Waiting'}
            </p>
          </div>
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <p className="text-sm text-slate-400 mb-1">Last Update</p>
            <p className="text-lg font-semibold text-cyan-400">{formatTimestamp(telemetry?.timestamp || telemetry?.createdAt)}</p>
          </div>
        </div>

        {!telemetry && (
          <div className="mt-8 p-6 bg-cyan-900/20 rounded-xl border border-cyan-700/30 text-center">
            <p className="text-cyan-300">No live vehicle data received yet. Login to OpenOBD mobile app with the same account and connect your vehicle.</p>
          </div>
        )}
      </div>
    </div>
  );
}
