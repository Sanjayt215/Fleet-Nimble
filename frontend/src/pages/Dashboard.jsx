import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import api from "../services/api";
import StatCard from "../components/StatCard";
import { useSocket } from "../hooks/useSocket";
import { useMode } from "../context/ModeContext";
import { DEMO_FLEET, DEMO_STATS, DEMO_ALERTS } from "../data/demoData";

function safeChartValue(value, min = -Infinity, max = Infinity) {
  const safe = Number(value);
  if (isNaN(safe) || !isFinite(safe)) return 0;
  return Math.max(min, Math.min(max, safe));
}

export default function Dashboard() {
  const { isDemo, isLive } = useMode();
  const [stats, setStats] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [live, setLive] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [chartVehicleId, setChartVehicleId] = useState(null);
  const [chartHistory, setChartHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const chartVehicleIdRef = useRef(chartVehicleId);

  useEffect(() => {
    chartVehicleIdRef.current = chartVehicleId;
  }, [chartVehicleId]);

  const appendChartPoint = useCallback((data) => {
    if (chartVehicleIdRef.current !== (data.vehicleId ?? data.vehicle_id)) return;

    setChartHistory((prev) => {
      const nextPoint = {
        t: prev.length > 0 ? prev[prev.length - 1].t + 1 : 0,
        rpm: safeChartValue(data.rpm, 0, 8000),
        speed: safeChartValue(data.speed, 0, 200),
      };
      return [...prev, nextPoint].slice(-10);
    });
  }, []);

  const socketHandlers = {
    "live-telemetry-update": (data) => {
      if (isDemo) return;
      if (data?.mode && data.mode !== 'LIVE') return;
      const vid = data.vehicleId ?? data.vehicle_id;
      setLive((prev) => {
        const index = prev.findIndex((p) => (p.vehicleId ?? p.vehicle_id) === vid);
        if (index >= 0) {
          const next = [...prev];
          next[index] = { ...prev[index], ...data };
          return next;
        }
        return [data, ...prev].slice(0, 20);
      });
      appendChartPoint(data);
    },
    "vehicle-registered": (data) => {
      if (isDemo) return;
      if (data.vehicle) {
        setVehicles((prev) => {
          const index = prev.findIndex((v) => v.id === data.vehicle.id);
          if (index >= 0) {
            const next = [...prev];
            next[index] = data.vehicle;
            return next;
          }
          return [data.vehicle, ...prev];
        });
      }
    },
  };

  useSocket(socketHandlers);

  // Demo telemetry interval
  useEffect(() => {
    if (isDemo) {
      const interval = setInterval(() => {
        const simData = {
          rpm: Math.floor(Math.random() * (3000 - 1000) + 1000),
          speed: Math.floor(Math.random() * (80 - 0) + 0),
          fuelLevel: Math.floor(Math.random() * (100 - 20) + 20),
          coolantTemp: Math.floor(Math.random() * (95 - 70) + 70),
          batteryVoltage: parseFloat((Math.random() * (14.2 - 12.4) + 12.4).toFixed(1)),
          engineLoad: Math.floor(Math.random() * (60 - 10) + 10),
          vehicleId: chartVehicleId || DEMO_FLEET[0]?.id,
        };
        setLive([simData, ...live.slice(0, 19)]);
        appendChartPoint(simData);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [isDemo, chartVehicleId, live, appendChartPoint]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (isDemo) {
      setStats(DEMO_STATS);
      setVehicles(DEMO_FLEET);
      setAlerts(DEMO_ALERTS);
      setChartVehicleId(DEMO_FLEET[0]?.id);
      setLoading(false);
    } else {
      try {
        const [vehiclesRes] = await Promise.all([api.get("/mobile/vehicles/my")]);
        const vehiclesData = vehiclesRes.data?.data || [];
        setVehicles(vehiclesData);

        setStats({
          vehicleCount: vehiclesData.length,
          onlineVehicles: 0,
          fleetUtilization: 0,
          activeDtc: 0,
          pendingDtc: 0,
          unreadAlerts: 0,
          maintenanceDue: 0,
          fuelLiters30d: 0,
          driverEvents7d: 0,
          recentTrips: 0,
        });
        setAlerts([]);
        setLive([]);
        setChartHistory([]);
        if (vehiclesData.length > 0) {
          setChartVehicleId(vehiclesData[0].id);
        }
      } catch (err) {
        console.error("Error loading dashboard data:", err);
        setError(err.message || "Failed to load dashboard data");
        setStats({
          vehicleCount: 0,
          onlineVehicles: 0,
          fleetUtilization: 0,
          activeDtc: 0,
          pendingDtc: 0,
          unreadAlerts: 0,
          maintenanceDue: 0,
          fuelLiters30d: 0,
          driverEvents7d: 0,
          recentTrips: 0,
        });
        setVehicles([]);
        setAlerts([]);
        setLive([]);
        setChartHistory([]);
      } finally {
        setLoading(false);
      }
    }
  }, [isDemo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const currentTelemetry = chartVehicleId
    ? (isDemo ? live[0] : live.find((d) => (d.vehicleId ?? d.vehicle_id) === chartVehicleId)) || null
    : null;

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="btn-secondary">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Dashboard</h2>
        <p className="text-slate-400">
          {isDemo
            ? "Demo Experience — simulated telemetry from the backend digital twin"
            : "Fleet KPIs and live telemetry (Socket.IO + OBD)"}
        </p>

        {isLive && vehicles.length === 0 && live.length === 0 && (
          <div className="mt-4 rounded-3xl border border-cyan-500/30 bg-cyan-950/20 px-6 py-4 text-cyan-200 shadow-inner">
            <h3 className="font-semibold mb-2">Waiting for live vehicle data from OpenOBD mobile app.</h3>
            <p className="text-sm text-cyan-300">Register your vehicle using the mobile app to see live data here.</p>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
        <StatCard
          title="Vehicles"
          value={isDemo ? (stats?.vehicleCount ?? "—") : (stats?.vehicleCount ?? 0)}
          icon="🚗"
        />
        <StatCard
          title="Online"
          value={isDemo ? (stats?.onlineVehicles ?? "—") : (stats?.onlineVehicles ?? 0)}
          icon="📡"
        />
        <StatCard
          title="Utilization"
          value={
            isDemo
              ? (stats?.fleetUtilization != null ? `${stats.fleetUtilization}%` : "—")
              : (stats?.fleetUtilization != null ? `${stats.fleetUtilization}%` : "0%")
          }
          icon="📈"
        />
        <StatCard
          title="Active DTCs"
          value={isDemo ? (stats?.activeDtc ?? "—") : (stats?.activeDtc ?? 0)}
          icon="⚠️"
        />
        <StatCard
          title="Pending DTCs"
          value={isDemo ? (stats?.pendingDtc ?? "—") : (stats?.pendingDtc ?? 0)}
          icon="🟡"
        />
        <StatCard
          title="Alerts"
          value={isDemo ? (stats?.unreadAlerts ?? "—") : (stats?.unreadAlerts ?? 0)}
          icon="🔔"
        />
        <StatCard
          title="Maintenance Due"
          value={isDemo ? (stats?.maintenanceDue ?? "—") : (stats?.maintenanceDue ?? 0)}
          icon="🔩"
        />
        <StatCard
          title="Fuel (30d)"
          value={
            isDemo
              ? (stats?.fuelLiters30d != null ? `${stats.fuelLiters30d.toFixed(0)} L` : "—")
              : (stats?.fuelLiters30d != null ? `${stats.fuelLiters30d.toFixed(0)} L` : "0 L")
          }
          icon="⛽"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          title="Driver Events (7d)"
          value={isDemo ? (stats?.driverEvents7d ?? "—") : (stats?.driverEvents7d ?? 0)}
          icon="👤"
        />
        <StatCard
          title="Trips (7d)"
          value={isDemo ? (stats?.recentTrips ?? "—") : (stats?.recentTrips ?? 0)}
          icon="🗺️"
        />
      </div>

      {/* Live Telemetry Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="RPM"
          value={currentTelemetry?.rpm != null ? currentTelemetry.rpm : (isDemo ? "—" : "—")}
          icon="🔄"
        />
        <StatCard
          title="Speed"
          value={currentTelemetry?.speed != null ? `${currentTelemetry.speed} km/h` : (isDemo ? "—" : "—")}
          icon="🚀"
        />
        <StatCard
          title="Fuel Level"
          value={currentTelemetry?.fuelLevel != null ? `${currentTelemetry.fuelLevel}%` : (isDemo ? "—" : "—")}
          icon="⛽"
        />
        <StatCard
          title="Coolant"
          value={currentTelemetry?.coolantTemp != null ? `${currentTelemetry.coolantTemp}°C` : (isDemo ? "—" : "—")}
          icon="🌡️"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card bg-slate-900/50 border-slate-800">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-white">Live RPM / Speed</h3>
            {vehicles.length > 1 && (
              <select
                className="input max-w-[200px] py-1 text-sm bg-slate-800 border-slate-700 text-white"
                value={chartVehicleId || ""}
                onChange={(e) => setChartVehicleId(e.target.value)}
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.vehicleName || `${v.make} ${v.model}`}
                  </option>
                ))}
              </select>
            )}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartHistory}>
              <XAxis dataKey="t" hide />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }}
                itemStyle={{ color: "#f1f5f9" }}
                labelStyle={{ color: "#94a3b8" }}
              />
              <Line type="monotone" dataKey="rpm" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="speed" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-2 text-xs text-slate-400">
            {isDemo
              ? "Demo Mode - Simulated data updates every 3 seconds"
              : "Updates via real-time stream — connect the OBD mobile app or MQTT device."}
          </p>
        </div>

        <div className="card bg-slate-900/50 border-slate-800">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-white">Alert Center</h3>
            <Link
              to={`${isDemo ? "/demo" : "/analysis"}/reports`}
              className="text-sm text-cyan-400 hover:underline"
            >
              View all
            </Link>
          </div>
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {alerts.length ? (
              alerts.map((a) => (
                <li key={a.id} className="rounded-lg border border-slate-700 p-3 text-sm bg-slate-800/50">
                  <span className="font-medium text-red-400">{a.severity}</span> — {a.message}
                  {!a.read && <span className="ml-2 text-xs text-cyan-400">unread</span>}
                </li>
              ))
            ) : (
              <p className="text-sm text-slate-400">
                {isDemo ? "No alerts in demo mode" : "No recent alerts"}
              </p>
            )}
          </ul>
        </div>
      </div>

      {isDemo && (
        <div className="card bg-slate-900/50 border-slate-800">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-white">Demo Vehicles</h3>
            <Link to="/" className="text-sm text-cyan-400 hover:underline">
              Return to Landing
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {vehicles.map((v) => (
              <div key={v.id} className="rounded-lg border border-slate-700 p-4 bg-slate-800/30">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500" title="Demo Mode" />
                  <p className="font-medium text-white">{v.vehicleName || `${v.make} ${v.model}`}</p>
                </div>
                <p className="text-sm text-slate-400">{v.registrationNumber || v.plateNumber || "Simulated"}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
