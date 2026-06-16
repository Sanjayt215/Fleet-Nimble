import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMode } from '../context/ModeContext';

export default function DemoMode() {
  const navigate = useNavigate();
  const { setMode } = useMode();
  const [telemetry, setTelemetry] = useState({
    rpm: 1200,
    speed: 0,
    fuelLevel: 75,
    coolantTemp: 92,
    batteryVoltage: 13.5,
    engineLoad: 25,
    latitude: 40.7128,
    longitude: -74.0060,
    odometer: 45000,
    timestamp: new Date(),
  });
  
  const simulatorRef = useRef(null);
  const [isRunning, setIsRunning] = useState(true);

  // Simulator: randomly update values
  useEffect(() => {
    if (!isRunning) return;

    simulatorRef.current = setInterval(() => {
      setTelemetry(prev => {
        const rpm = prev.rpm + (Math.random() - 0.5) * 600;
        const speed = Math.max(0, prev.speed + (Math.random() - 0.5) * 15);
        const fuelLevel = Math.max(0, Math.min(100, prev.fuelLevel + (Math.random() - 0.55) * 2));
        const coolantTemp = Math.max(80, Math.min(110, prev.coolantTemp + (Math.random() - 0.5) * 4));
        const batteryVoltage = 13 + Math.random() * 1.2;
        const engineLoad = Math.max(0, Math.min(100, prev.engineLoad + (Math.random() - 0.5) * 20));
        const latitude = prev.latitude + (Math.random() - 0.5) * 0.01;
        const longitude = prev.longitude + (Math.random() - 0.5) * 0.01;
        const odometer = prev.odometer + speed * 0.0008; // Update odometer based on speed

        return {
          rpm: Math.max(0, Math.min(7000, rpm)),
          speed: Math.max(0, Math.min(180, speed)),
          fuelLevel: Math.max(0, Math.min(100, fuelLevel)),
          coolantTemp: Math.max(80, Math.min(120, coolantTemp)),
          batteryVoltage: Math.max(12, Math.min(14.5, batteryVoltage)),
          engineLoad: Math.max(0, Math.min(100, engineLoad)),
          latitude,
          longitude,
          odometer,
          timestamp: new Date(),
        };
      });
    }, 2500); // Update every 2.5 seconds

    return () => clearInterval(simulatorRef.current);
  }, [isRunning]);

  useEffect(() => {
    setMode('demo');
  }, [setMode]);

  const handleExit = () => {
    setIsRunning(false);
    setMode('live');
    navigate('/');
  };

  const handlePause = () => {
    setIsRunning(!isRunning);
  };

  const formatValue = (value, unit = '') => {
    if (value == null || isNaN(value) || !isFinite(value)) return '--';
    if (typeof value === 'number' && value % 1 !== 0) {
      return `${value.toFixed(1)}${unit}`;
    }
    return `${Math.round(Number(value))}${unit}`;
  };

  const formatTime = (ts) => {
    if (!ts) return '--';
    return new Date(ts).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white overflow-hidden">
      {/* Animated background gradient */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-purple-500/10 via-slate-900 to-transparent opacity-40 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl opacity-30" />
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl opacity-30" />
      </div>

      <div className="relative z-10 min-h-screen">
        {/* Header */}
        <div className="border-b border-purple-500/20 bg-slate-950/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">Demo Mode</h1>
              <p className="text-purple-400/60 mt-1">Explore FleetNimble with simulated vehicle data</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handlePause}
                className="px-6 py-3 rounded-xl border border-purple-500/50 bg-purple-950/20 hover:bg-purple-950/40 text-purple-300 hover:text-purple-200 font-medium transition-all duration-300"
              >
                {isRunning ? 'Pause' : 'Resume'}
              </button>
              <button
                onClick={handleExit}
                className="px-6 py-3 rounded-xl border border-red-500/50 bg-red-950/20 hover:bg-red-950/40 text-red-300 hover:text-red-200 font-medium transition-all duration-300"
              >
                Exit Demo
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Status Banner */}
          <div className="mb-8 p-6 rounded-2xl border border-purple-500/30 bg-gradient-to-r from-slate-900/80 to-slate-900/60 backdrop-blur-xl shadow-xl shadow-purple-500/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-4 h-4 rounded-full bg-purple-500 animate-pulse" />
                  <div className="absolute inset-0 w-4 h-4 rounded-full bg-purple-500 opacity-75 animate-ping" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-purple-300 font-semibold text-lg">Demo Mode Active</p>
                    <span className="px-3 py-1 rounded-full bg-purple-950/40 border border-purple-500/30 text-purple-300 text-xs font-semibold">
                      SIMULATOR
                    </span>
                  </div>
                  <p className="text-purple-400/60 text-sm mt-1">
                    Simulated vehicle data updates every 2–3 seconds
                  </p>
                </div>
              </div>
              <button
                onClick={handleExit}
                className="px-6 py-2 rounded-lg border border-red-500/50 bg-red-950/20 hover:bg-red-950/40 text-red-300 hover:text-red-200 font-medium transition-all duration-300"
              >
                Exit Demo
              </button>
            </div>
          </div>

          {/* Vehicle Info Card */}
          <div className="mb-8 p-6 rounded-2xl border border-purple-500/20 bg-slate-900/40 backdrop-blur-md">
            <h3 className="text-purple-300 font-semibold mb-4 uppercase text-xs tracking-wider">Demo Vehicle Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-slate-400 text-sm">Vehicle</p>
                <p className="text-white font-semibold text-lg">Demo Tesla</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm">Registration</p>
                <p className="text-white font-semibold text-lg">DEMO-001</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm">Make & Model</p>
                <p className="text-white font-semibold text-lg">Tesla Model 3</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm">Status</p>
                <p className="text-green-400 font-semibold text-lg">Online</p>
              </div>
            </div>
          </div>

          {/* Telemetry Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {/* RPM Card */}
            <div className="p-6 rounded-xl border border-purple-500/20 bg-slate-900/40 backdrop-blur-md hover:border-purple-500/40 transition-all duration-300">
              <div className="flex items-center justify-between mb-3">
                <p className="text-purple-400/60 text-sm font-medium">RPM</p>
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              </div>
              <p className="text-4xl font-bold text-white">{formatValue(telemetry.rpm)}</p>
              <div className="mt-3 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
                  style={{ width: `${Math.min((telemetry.rpm / 7000) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Speed Card */}
            <div className="p-6 rounded-xl border border-purple-500/20 bg-slate-900/40 backdrop-blur-md hover:border-purple-500/40 transition-all duration-300">
              <div className="flex items-center justify-between mb-3">
                <p className="text-purple-400/60 text-sm font-medium">Speed</p>
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              </div>
              <p className="text-4xl font-bold text-white">{formatValue(telemetry.speed)} km/h</p>
              <div className="mt-3 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
                  style={{ width: `${Math.min((telemetry.speed / 180) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Fuel Level Card */}
            <div className="p-6 rounded-xl border border-purple-500/20 bg-slate-900/40 backdrop-blur-md hover:border-purple-500/40 transition-all duration-300">
              <div className="flex items-center justify-between mb-3">
                <p className="text-purple-400/60 text-sm font-medium">Fuel Level</p>
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              </div>
              <p className="text-4xl font-bold text-white">{formatValue(telemetry.fuelLevel)}%</p>
              <div className="mt-3 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-yellow-500 to-orange-500 transition-all duration-500"
                  style={{ width: `${telemetry.fuelLevel}%` }}
                />
              </div>
            </div>

            {/* Coolant Temp Card */}
            <div className="p-6 rounded-xl border border-purple-500/20 bg-slate-900/40 backdrop-blur-md hover:border-purple-500/40 transition-all duration-300">
              <div className="flex items-center justify-between mb-3">
                <p className="text-purple-400/60 text-sm font-medium">Coolant Temp</p>
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              </div>
              <p className="text-4xl font-bold text-white">{formatValue(telemetry.coolantTemp)}°C</p>
              <p className="text-slate-400 text-xs mt-2">Engine temperature</p>
            </div>

            {/* Battery Voltage Card */}
            <div className="p-6 rounded-xl border border-purple-500/20 bg-slate-900/40 backdrop-blur-md hover:border-purple-500/40 transition-all duration-300">
              <div className="flex items-center justify-between mb-3">
                <p className="text-purple-400/60 text-sm font-medium">Battery</p>
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              </div>
              <p className="text-4xl font-bold text-white">{formatValue(telemetry.batteryVoltage)}V</p>
              <p className="text-slate-400 text-xs mt-2">Voltage level</p>
            </div>

            {/* Engine Load Card */}
            <div className="p-6 rounded-xl border border-purple-500/20 bg-slate-900/40 backdrop-blur-md hover:border-purple-500/40 transition-all duration-300">
              <div className="flex items-center justify-between mb-3">
                <p className="text-purple-400/60 text-sm font-medium">Engine Load</p>
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              </div>
              <p className="text-4xl font-bold text-white">{formatValue(telemetry.engineLoad)}%</p>
              <p className="text-slate-400 text-xs mt-2">Load percentage</p>
            </div>
          </div>

          {/* Location & Update Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-6 rounded-xl border border-purple-500/20 bg-slate-900/40 backdrop-blur-md">
              <p className="text-purple-400/60 text-sm font-medium mb-3">Location</p>
              <p className="text-lg font-mono text-white">
                {formatValue(telemetry.latitude, '')}, {formatValue(telemetry.longitude, '')}
              </p>
              <a 
                href={`https://maps.google.com/?q=${telemetry.latitude},${telemetry.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:text-purple-300 text-xs mt-2 inline-block"
              >
                View on map →
              </a>
            </div>

            <div className="p-6 rounded-xl border border-purple-500/20 bg-slate-900/40 backdrop-blur-md">
              <p className="text-purple-400/60 text-sm font-medium mb-3">Odometer</p>
              <p className="text-2xl font-bold text-white">{formatValue(telemetry.odometer)} km</p>
              <p className="text-slate-400 text-xs mt-2">Total distance</p>
            </div>

            <div className="p-6 rounded-xl border border-purple-500/20 bg-slate-900/40 backdrop-blur-md">
              <p className="text-purple-400/60 text-sm font-medium mb-3">Last Update</p>
              <p className="text-white text-sm">{formatTime(telemetry.timestamp)}</p>
              <p className="text-slate-400 text-xs mt-2">Updates every 2–3 seconds</p>
            </div>
          </div>

          {/* Info Banner */}
          <div className="mt-8 p-6 rounded-xl border border-purple-500/20 bg-slate-900/40 backdrop-blur-md">
            <h3 className="text-purple-300 font-semibold mb-2">About Demo Mode</h3>
            <p className="text-slate-300 text-sm">
              This is a demonstration mode with simulated vehicle data. To see real live data from your vehicle, 
              use the <span className="font-semibold text-cyan-400">Start Analysis</span> mode and connect your OpenOBD mobile app.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
