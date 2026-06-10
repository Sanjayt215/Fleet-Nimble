import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Link } from 'react-router-dom';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

import api from '../services/api';

import StatCard from '../components/StatCard';

import { useSocket } from '../hooks/useSocket';

import { clamp, mergeTelemetry, toSafeNumber } from '../utils/telemetryFormat';

// Safe number converter for chart data
function safeChartValue(value, min = -Infinity, max = Infinity) {
  const safe = toSafeNumber(value, 0);
  return clamp(safe, min, max);
}



export default function Dashboard() {

  const [stats, setStats] = useState(null);

  const [vehicles, setVehicles] = useState([]);

  const [live, setLive] = useState([]);

  const [alerts, setAlerts] = useState([]);

  const [obdStatus, setObdStatus] = useState({});

  const [chartVehicleId, setChartVehicleId] = useState(null);

  const [chartHistory, setChartHistory] = useState([]);

  const chartVehicleIdRef = useRef(chartVehicleId);

  useEffect(() => {
    chartVehicleIdRef.current = chartVehicleId;
  }, [chartVehicleId]);

  const updateObdStatus = useCallback((vehicleId, status) => {
    setObdStatus((prev) => {
      if (prev[vehicleId] === status) return prev;
      return { ...prev, [vehicleId]: status };
    });
  }, []);

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

  useSocket({

    'live:update': (data) => {
      const vid = data.vehicleId ?? data.vehicle_id;
      updateObdStatus(vid, 'live');
      setLive((prev) => {
        const index = prev.findIndex((p) => (p.vehicleId ?? p.vehicle_id) === vid);
        const existing = index >= 0 ? prev[index] : {};
        const merged = mergeTelemetry(existing, data);
        if (index >= 0 && merged === existing) return prev;

        if (index === -1) {
          return [merged, ...prev].slice(0, 20);
        }

        const next = prev.slice();
        next.splice(index, 1);
        return [merged, ...next].slice(0, 20);
      });
      appendChartPoint(data);
    },

    'vehicle:status': (data) => {
      if (data.online === false) {
        updateObdStatus(data.vehicleId, 'offline');
      }
    },

    'alert:new': (a) => setAlerts((prev) => [a, ...prev].slice(0, 8)),

  });



  useEffect(() => {

    api.get('/dashboard/stats').then((r) => {

      setStats(r.data.data);

      if (r.data.data?.recentAlerts?.length) {

        setAlerts(r.data.data.recentAlerts);

      }

    });

    api.get('/vehicles?limit=8').then((r) => {

      const list = r.data.data;

      setVehicles(list);

      if (list[0]?.id) setChartVehicleId(list[0].id);

    });

  }, []);



  useEffect(() => {

    vehicles.forEach((v) => {

      if (v.telemetryHealth) {

        updateObdStatus(
          v.id,
          v.telemetryHealth.streamStatus === 'live'
            ? 'live'
            : v.telemetryHealth.streamStatus === 'stale'
              ? 'stale'
              : 'offline',
        );

        return;

      }

      api.get(`/obd/latest/${v.id}`).then((r) => {

        const at = r.data.data?.recordedAt;

        const age = at ? Date.now() - new Date(at).getTime() : Infinity;

        updateObdStatus(
          v.id,
          age < 120000 ? 'live' : age < 600000 ? 'stale' : 'offline',
        );

      }).catch(() => {

        updateObdStatus(v.id, 'offline');

      });

    });

  }, [vehicles, updateObdStatus]);

  useEffect(() => {
    if (!chartVehicleId) {
      setChartHistory([]);
      return;
    }

    setChartHistory(
      live
        .filter((d) => (d.vehicleId ?? d.vehicle_id) === chartVehicleId)
        .slice(0, 10)
        .reverse()
        .map((d, i) => ({
          t: i,
          rpm: safeChartValue(d.rpm, 0, 8000),
          speed: safeChartValue(d.speed, 0, 200),
        })),
    );
  }, [chartVehicleId]);


  const chartData = chartHistory;



  return (

    <div className="space-y-8">

      <div>

        <h2 className="text-2xl font-bold">Dashboard</h2>

        <p className="text-slate-500">Fleet KPIs and live telemetry (Socket.IO + OBD)</p>

      </div>



      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">

        <StatCard title="Vehicles" value={stats?.vehicleCount ?? '—'} icon="🚗" />

        <StatCard title="Online" value={stats?.onlineVehicles ?? '—'} icon="📡" />

        <StatCard title="Utilization" value={stats != null ? `${stats.fleetUtilization}%` : '—'} icon="📈" />

        <StatCard title="Active DTCs" value={stats?.activeDtc ?? '—'} icon="⚠️" />

        <StatCard title="Pending DTCs" value={stats?.pendingDtc ?? '—'} icon="🟡" />

        <StatCard title="Alerts" value={stats?.unreadAlerts ?? '—'} icon="🔔" />

        <StatCard title="Maintenance Due" value={stats?.maintenanceDue ?? '—'} icon="🔩" />

        <StatCard

          title="Fuel (30d)"

          value={stats != null ? `${(stats.fuelLiters30d ?? 0).toFixed(0)} L` : '—'}

          icon="⛽"

        />

      </div>



      <div className="grid gap-4 sm:grid-cols-2">

        <StatCard title="Driver Events (7d)" value={stats?.driverEvents7d ?? '—'} icon="👤" />

        <StatCard title="Trips (7d)" value={stats?.recentTrips ?? '—'} icon="🗺️" />

      </div>



      <div className="grid gap-6 lg:grid-cols-2">

        <div className="card">

          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">

            <h3 className="font-semibold">Live RPM / Speed</h3>

            {vehicles.length > 1 && (

              <select
                className="input max-w-[200px] py-1 text-sm"
                value={chartVehicleId || ''}
                onChange={(e) => setChartVehicleId(e.target.value)}

              >

                {vehicles.map((v) => (

                  <option key={v.id} value={v.id}>

                    {v.make} {v.model}

                  </option>

                ))}

              </select>

            )}

          </div>

          <ResponsiveContainer width="100%" height={220}>

            <LineChart data={chartData}>

              <XAxis dataKey="t" hide />

              <YAxis />

              <Tooltip />

              <Line type="monotone" dataKey="rpm" stroke="#3b82f6" strokeWidth={2} dot={false} />

              <Line type="monotone" dataKey="speed" stroke="#10b981" strokeWidth={2} dot={false} />

            </LineChart>

          </ResponsiveContainer>

          <p className="mt-2 text-xs text-slate-500">

            Updates via real-time stream — connect the OBD mobile app or MQTT device.

          </p>

        </div>



        <div className="card">

          <div className="mb-4 flex items-center justify-between">

            <h3 className="font-semibold">Alert Center</h3>

            <Link to="/reports?tab=alerts" className="text-sm text-fleet-600 hover:underline">

              View all

            </Link>

          </div>

          <ul className="max-h-64 space-y-2 overflow-y-auto">

            {alerts.length ? alerts.map((a) => (

              <li key={a.id} className="rounded-lg border border-slate-100 p-3 text-sm dark:border-slate-800">

                <span className="font-medium text-red-600">{a.severity}</span>

                {' '}

                — {a.message}

                {!a.read && <span className="ml-2 text-xs text-fleet-600">unread</span>}

              </li>

            )) : (

              <p className="text-sm text-slate-500">No recent alerts</p>

            )}

          </ul>

        </div>

      </div>



      <div className="card">

        <div className="mb-4 flex items-center justify-between">

          <h3 className="font-semibold">Fleet Vehicles</h3>

          <Link to="/vehicles" className="text-sm text-fleet-600 hover:underline">View all</Link>

        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

          {vehicles.map((v) => (

            <Link key={v.id} to={`/vehicles/${v.id}`} className="rounded-lg border p-4 hover:border-fleet-500 dark:border-slate-700">

              <div className="flex items-center gap-2">

                <span

                  className={`h-2.5 w-2.5 rounded-full ${

                    obdStatus[v.id] === 'live'

                      ? 'bg-green-500'

                      : obdStatus[v.id] === 'stale'

                        ? 'bg-yellow-500'

                        : 'bg-slate-400'

                  }`}

                  title="OBD stream status"

                />

                <p className="font-medium">{v.make} {v.model}</p>

              </div>

              <p className="text-sm text-slate-500">{v.plateNumber || v.vin || 'No plate'}</p>

            </Link>

          ))}

        </div>

      </div>

    </div>

  );

}

