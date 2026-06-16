import { useEffect, useState } from 'react';
import api from '../services/api';
import DataTable from '../components/DataTable';
import { useMode } from '../context/ModeContext';
import { DEMO_DRIVERS } from '../data/demoData';

export default function Drivers() {
  const [data, setData] = useState({ scores: [], vehicles: [] });
  const { isDemo } = useMode();

  useEffect(() => {
    if (isDemo) {
      setData({ scores: DEMO_DRIVERS, vehicles: [] });
    } else {
      api.get('/mobile/drivers/my').then((r) => setData(r.data.data || { scores: [], vehicles: [] })).catch(() => setData({ scores: [], vehicles: [] }));
    }
  }, [isDemo]);

  const columns = [
    { key: 'name', label: 'Driver', render: (r) => r.name || '—' },
    { key: 'score', label: 'Score', render: (r) => <span className="font-bold">{r.score ?? '—'}</span> },
    { key: 'harshBraking', label: 'Harsh Braking' },
    { key: 'harshAcceleration', label: 'Harsh Accel' },
    { key: 'idleTime', label: 'Idle (min)', render: (r) => r.idleTime?.toFixed?.(0) ?? r.idleTime ?? '—' },
  ];

  return (
    <div className="space-y-6 text-white">
      <h2 className="text-2xl font-bold">Driver Scores</h2>
      {data.scores.length === 0 ? (
        <div className="card bg-slate-800/30 border border-slate-700 p-8 text-center">
          <h3 className="text-lg font-semibold text-white">No drivers added yet.</h3>
          <p className="text-slate-400 mt-2">Add drivers manually.</p>
        </div>
      ) : (
        <DataTable columns={columns} data={data.scores} emptyMessage="No driver scores yet" />
      )}
    </div>
  );
}
