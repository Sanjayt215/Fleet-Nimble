import { useEffect, useState } from 'react';
import api from '../services/api';
import DataTable from '../components/DataTable';

export default function Drivers() {
  const [data, setData] = useState({ scores: [], vehicles: [] });

  useEffect(() => {
    api.get('/drivers/scores').then((r) => setData(r.data.data));
  }, []);

  const columns = [
    { key: 'vehicleId', label: 'Vehicle', render: (r) => {
      const v = data.vehicles?.find((x) => x.id === r.vehicleId);
      return v ? `${v.make} ${v.model}` : r.vehicleId;
    }},
    { key: 'score', label: 'Score', render: (r) => <span className="font-bold">{r.score}</span> },
    { key: 'harshBraking', label: 'Harsh Braking' },
    { key: 'harshAcceleration', label: 'Harsh Accel' },
    { key: 'overspeedEvents', label: 'Overspeed' },
    { key: 'idleTime', label: 'Idle (min)', render: (r) => r.idleTime?.toFixed(0) },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Driver Scores</h2>
      <DataTable columns={columns} data={data.scores} emptyMessage="No driver scores yet" />
    </div>
  );
}
