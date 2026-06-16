import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useSocket } from '../hooks/useSocket';
import { useAuth } from '../context/AuthContext';
import { useMode } from '../context/ModeContext';

export default function StartAnalysis() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setMode } = useMode();
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Socket.IO listeners for live updates only
  useSocket({
    'vehicle-registered': (data) => {
      if (data?.vehicle) {
        const vehicle = data.vehicle;
        setVehicles(prev => {
          const existing = prev.find(v => v.id === vehicle.id);
          if (existing) {
            return prev.map(v => v.id === vehicle.id ? { ...v, ...vehicle } : v);
          }
          return [vehicle, ...prev];
        });
        if (!selectedVehicle) {
          setSelectedVehicle(vehicle);
        }
      }
    },
    'live-telemetry-update': (data) => {
      if (data?.mode !== 'LIVE') return;
      setTelemetry(data);
      if (data.vehicle) {
        setSelectedVehicle(prev => prev ? { ...prev, ...data.vehicle } : data.vehicle);
      }
    },
    'vehicle-online': (data) => {
      if (data?.vehicleId && selectedVehicle?.id === data.vehicleId) {
        setSelectedVehicle(prev => prev ? { ...prev, telemetryOnline: true } : null);
      }
    },
  });

  useEffect(() => {
    setMode('live');
  }, [setMode]);

  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        setLoading(true);
        const { data } = await api.get('/mobile/vehicles/my');
        setVehicles(data.data || []);
        
        if (data.data?.length > 0) {
          setSelectedVehicle(data.data[0]);
        }
      } catch (err) {
        console.error('Error fetching vehicles:', err);
        setError(err.response?.data?.error || 'Failed to load vehicles');
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchVehicles();
    }
  }, [user]);

  const handleExitLive = () => {
    setVehicles([]);
    setSelectedVehicle(null);
    setTelemetry(null);
    navigate('/');
  };

  const formatValue = (value, unit = '') => {
    if (value == null || value === '' || isNaN(value) || !isFinite(value)) return '--';
    if (typeof value === 'number' && value % 1 !== 0) {
      return `${value.toFixed(1)}${unit}`;
    }
    return `${Math.round(Number(value))}${unit}`;
  };

  const formatTime = (ts) => {
    if (!ts) return 'Waiting for data';
    return new Date(ts).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white overflow-hidden">
      {/* Animated background gradient */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-cyan-500/10 via-slate-900 to-transparent opacity-40 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl opacity-30" />
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl opacity-30" />
      </div>

      <div className="relative z-10 min-h-screen">
        {/* Header */}
        <div className="border-b border-cyan-500/20 bg-slate-950/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">Live Vehicle Analysis</h1>
              <p className="text-cyan-400/60 mt-1">Real-time OBD data from your connected vehicle</p>
            </div>
            <button
              onClick={handleExitLive}
              className="px-6 py-3 rounded-xl border border-red-500/50 bg-red-950/20 hover:bg-red-950/40 text-red-300 hover:text-red-200 font-medium transition-all duration-300"
            >
              Exit Live
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Status Banner */}
          <div className="mb-8 p-6 rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-slate-900/80 to-slate-900/60 backdrop-blur-xl shadow-xl shadow-cyan-500/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-4 h-4 rounded-full ${vehicles.length > 0 ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
                <div>
                  <p className="text-cyan-300 font-semibold text-lg">Live Analysis Active</p>
                  <p className="text-cyan-400/60 text-sm mt-1">
                    {vehicles.length > 0 
                      ? 'Connected to OpenOBD mobile app' 
                      : 'Waiting for OpenOBD mobile app connection'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleExitLive}
                className="px-6 py-2 rounded-lg border border-red-500/50 bg-red-950/20 hover:bg-red-950/40 text-red-300 hover:text-red-200 font-medium transition-all duration-300"
              >
                Exit Live
              </button>
            </div>
          </div>

          {loading && !vehicles.length && (
            <div className="text-center py-12">
              <p className="text-cyan-400/60">Loading your vehicles...</p>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-950/20 border border-red-500/30 text-red-300">
              {error}
            </div>
          )}

          {!loading && !vehicles.length && (
            <div className="text-center py-16 px-6">
              <div className="mx-auto mb-6 inline-flex rounded-full bg-cyan-500/10 p-4 border border-cyan-500/30">
                <svg className="w-16 h-16 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Waiting for Live Data</h2>
              <p className="text-cyan-300 mb-4 text-lg font-medium">
                No vehicles connected yet
              </p>
              <p className="text-slate-300 max-w-lg mx-auto mb-6">
                Open the OpenOBD mobile app with the same account and register your vehicle to start receiving live telemetry data.
              </p>
              <div className="bg-cyan-950/20 border border-cyan-500/30 rounded-xl p-6 max-w-lg mx-auto text-left">
                <h3 className="text-cyan-300 font-semibold mb-3">Expected Dashboard State:</h3>
                <div className="space-y-2 text-slate-300 text-sm">
                  <div className="flex justify-between"><span>Vehicles:</span><span className="text-slate-400">0</span></div>
                  <div className="flex justify-between"><span>Online:</span><span className="text-slate-400">0</span></div>
                  <div className="flex justify-between"><span>RPM:</span><span className="text-slate-400">--</span></div>
                  <div className="flex justify-between"><span>Speed:</span><span className="text-slate-400">--</span></div>
                  <div className="flex justify-between"><span>Fuel:</span><span className="text-slate-400">--</span></div>
                  <div className="flex justify-between"><span>Coolant:</span><span className="text-slate-400">--</span></div>
                  <div className="flex justify-between"><span>Battery:</span><span className="text-slate-400">--</span></div>
                  <div className="flex justify-between"><span>Location:</span><span className="text-slate-400">Waiting</span></div>
                  <div className="flex justify-between"><span>Last Update:</span><span className="text-slate-400">No live data yet</span></div>
                </div>
              </div>
            </div>
          )}

          {vehicles.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Vehicle Details Card */}
              <div className="lg:col-span-1 p-6 rounded-2xl border border-cyan-500/20 bg-slate-900/40 backdrop-blur-md shadow-lg hover:border-cyan-500/40 transition-all duration-300">
                <h3 className="text-cyan-300 font-semibold mb-4 uppercase text-xs tracking-wider">Vehicle Details</h3>
                
                {selectedVehicle ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-slate-400 text-sm">Name</p>
                      <p className="text-white font-semibold">{selectedVehicle.vehicleName || 'Not set'}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-sm">Registration</p>
                      <p className="text-white font-semibold">{selectedVehicle.registrationNumber || selectedVehicle.plateNumber || '--'}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-sm">Make & Model</p>
                      <p className="text-white font-semibold">
                        {selectedVehicle.make && selectedVehicle.model 
                          ? `${selectedVehicle.make} ${selectedVehicle.model}`
                          : '--'}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-sm">Year</p>
                      <p className="text-white font-semibold">{selectedVehicle.year || '--'}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-sm">Fuel Type</p>
                      <p className="text-white font-semibold">{selectedVehicle.fuelType || '--'}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-sm">VIN</p>
                      <p className="text-white font-mono text-xs">{selectedVehicle.vin || '--'}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-400 text-center py-8">Select a vehicle</p>
                )}
              </div>

              {/* Telemetry Cards */}
              <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* RPM Card */}
                <div className="p-6 rounded-xl border border-cyan-500/20 bg-slate-900/40 backdrop-blur-md hover:border-cyan-500/40 transition-all duration-300">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-cyan-400/60 text-sm font-medium">RPM</p>
                    <div className={`w-2 h-2 rounded-full ${telemetry?.rpm ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`} />
                  </div>
                  <p className="text-4xl font-bold text-white">{formatValue(telemetry?.rpm)}</p>
                  <p className="text-slate-400 text-xs mt-2">Engine speed</p>
                </div>

                {/* Speed Card */}
                <div className="p-6 rounded-xl border border-cyan-500/20 bg-slate-900/40 backdrop-blur-md hover:border-cyan-500/40 transition-all duration-300">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-cyan-400/60 text-sm font-medium">Speed</p>
                    <div className={`w-2 h-2 rounded-full ${telemetry?.speed ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`} />
                  </div>
                  <p className="text-4xl font-bold text-white">{formatValue(telemetry?.speed, ' km/h')}</p>
                  <p className="text-slate-400 text-xs mt-2">Vehicle velocity</p>
                </div>

                {/* Fuel Level Card */}
                <div className="p-6 rounded-xl border border-cyan-500/20 bg-slate-900/40 backdrop-blur-md hover:border-cyan-500/40 transition-all duration-300">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-cyan-400/60 text-sm font-medium">Fuel Level</p>
                    <div className={`w-2 h-2 rounded-full ${telemetry?.fuelLevel ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`} />
                  </div>
                  <p className="text-4xl font-bold text-white">{formatValue(telemetry?.fuelLevel, '%')}</p>
                  <p className="text-slate-400 text-xs mt-2">Tank capacity</p>
                </div>

                {/* Coolant Temp Card */}
                <div className="p-6 rounded-xl border border-cyan-500/20 bg-slate-900/40 backdrop-blur-md hover:border-cyan-500/40 transition-all duration-300">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-cyan-400/60 text-sm font-medium">Coolant Temp</p>
                    <div className={`w-2 h-2 rounded-full ${telemetry?.coolantTemp ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`} />
                  </div>
                  <p className="text-4xl font-bold text-white">{formatValue(telemetry?.coolantTemp, '°C')}</p>
                  <p className="text-slate-400 text-xs mt-2">Engine temperature</p>
                </div>

                {/* Battery Voltage Card */}
                <div className="p-6 rounded-xl border border-cyan-500/20 bg-slate-900/40 backdrop-blur-md hover:border-cyan-500/40 transition-all duration-300">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-cyan-400/60 text-sm font-medium">Battery</p>
                    <div className={`w-2 h-2 rounded-full ${telemetry?.batteryVoltage ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`} />
                  </div>
                  <p className="text-4xl font-bold text-white">{formatValue(telemetry?.batteryVoltage, 'V')}</p>
                  <p className="text-slate-400 text-xs mt-2">Voltage level</p>
                </div>

                {/* Engine Load Card */}
                <div className="p-6 rounded-xl border border-cyan-500/20 bg-slate-900/40 backdrop-blur-md hover:border-cyan-500/40 transition-all duration-300">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-cyan-400/60 text-sm font-medium">Engine Load</p>
                    <div className={`w-2 h-2 rounded-full ${telemetry?.engineLoad ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`} />
                  </div>
                  <p className="text-4xl font-bold text-white">{formatValue(telemetry?.engineLoad, '%')}</p>
                  <p className="text-slate-400 text-xs mt-2">Load percentage</p>
                </div>
              </div>

              {/* Location & Update Info */}
              <div className="lg:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 rounded-xl border border-cyan-500/20 bg-slate-900/40 backdrop-blur-md hover:border-cyan-500/40 transition-all duration-300">
                  <p className="text-cyan-400/60 text-sm font-medium mb-3">Location</p>
                  {telemetry?.latitude && telemetry?.longitude ? (
                    <div>
                      <p className="text-lg font-mono text-white">
                        {formatValue(telemetry.latitude)}, {formatValue(telemetry.longitude)}
                      </p>
                      <a 
                        href={`https://maps.google.com/?q=${telemetry.latitude},${telemetry.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 text-xs mt-2 inline-block"
                      >
                        View on map →
                      </a>
                    </div>
                  ) : (
                    <p className="text-slate-400">Waiting for GPS data</p>
                  )}
                </div>

                <div className="p-6 rounded-xl border border-cyan-500/20 bg-slate-900/40 backdrop-blur-md hover:border-cyan-500/40 transition-all duration-300">
                  <p className="text-cyan-400/60 text-sm font-medium mb-3">Last Update</p>
                  <p className="text-white text-sm">{formatTime(telemetry?.timestamp)}</p>
                  <p className="text-slate-400 text-xs mt-2">Updates arrive every 2–3 seconds</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
