import { useEffect, useState } from 'react';

import { useSearchParams } from 'react-router-dom';

import api from '../services/api';

import GaugeChart from '../components/GaugeChart';

import { LIVE_GAUGE_FIELDS } from '../constants/pids';

import { mergeTelemetry } from '../utils/telemetryFormat';

import { useSocket } from '../hooks/useSocket';



export default function Diagnostics() {

  const [params] = useSearchParams();

  const [vehicles, setVehicles] = useState([]);

  const [vehicleId, setVehicleId] = useState(params.get('vehicle') || '');

  const [live, setLive] = useState(null);

  const [history, setHistory] = useState([]);

  const [streamStatus, setStreamStatus] = useState('offline');



  useSocket(

    {

      'live:update': (d) => {

        const vid = d.vehicleId ?? d.vehicle_id;

        if (!vehicleId || vid === vehicleId) {

          setLive((prev) => mergeTelemetry(prev, d));

          setStreamStatus('live');

        }

      },

    },

    vehicleId || null

  );



  useEffect(() => {

    api.get('/vehicles').then((r) => {

      setVehicles(r.data.data);

      if (!vehicleId && r.data.data[0]) setVehicleId(r.data.data[0].id);

    });

  }, []);



  useEffect(() => {

    if (!vehicleId) return;

    api.get(`/obd/latest/${vehicleId}`).then((r) => {

      const data = r.data.data;

      if (data) {

        setLive(data);

        const age = Date.now() - new Date(data.recordedAt).getTime();

        setStreamStatus(age < 120000 ? 'live' : age < 600000 ? 'stale' : 'offline');

      }

    });

    api.get(`/obd/history/${vehicleId}`, { params: { limit: 50 } }).then((r) => setHistory(r.data.data));

  }, [vehicleId]);



  const statusBadge = {

    live: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',

    stale: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',

    offline: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',

  };



  return (

    <div className="space-y-6">

      <div className="flex flex-wrap items-center justify-between gap-4">

        <div>

          <h2 className="text-2xl font-bold">Live Diagnostics</h2>

          <p className="text-slate-500">Real OBD data — no mock values</p>

        </div>

        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${statusBadge[streamStatus]}`}>

          {streamStatus}

        </span>

      </div>



      <select className="input max-w-xs" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>

        <option value="">Select vehicle</option>

        {vehicles.map((v) => (

          <option key={v.id} value={v.id}>{v.make} {v.model} — {v.plateNumber}</option>

        ))}

      </select>



      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">

        {LIVE_GAUGE_FIELDS.map((g) => (

          <GaugeChart

            key={g.field}

            label={g.label}

            value={live?.[g.field]}

            unit={g.unit}

            max={g.max}

          />

        ))}

      </div>



      <div className="card">

        <h3 className="mb-2 font-semibold">Telemetry stream</h3>

        <p className="text-sm text-slate-500">

          Last sample: {live?.recordedAt ? new Date(live.recordedAt).toLocaleString() : 'Waiting for OBD app or MQTT device…'}

        </p>

        <p className="mt-1 text-sm text-slate-500">History buffer: {history.length} samples</p>

      </div>

    </div>

  );

}

