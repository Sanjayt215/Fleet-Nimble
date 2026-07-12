import { useState, useEffect } from 'react';
import api from '../services/api';

const INDICATORS = [
  { key: 'phoneOnline', label: 'Phone Agent Online', check: async () => {
    const res = await api.get('/ai-receptionist/health');
    return { online: res.data.status === 'ok', detail: 'Twilio phone connected' };
  }},
  { key: 'realtimeConnected', label: 'Realtime Connected', check: async () => {
    const res = await api.get('/ai-receptionist/health');
    const healthy = res.data.realtimeConfigured && res.data.mediaStreamEnabled;
    return { online: healthy, detail: healthy ? 'OpenAI Realtime ready' : 'Not configured' };
  }},
  { key: 'databaseConnected', label: 'Neon Database Connected', check: async () => {
    const res = await api.get('/health/ready');
    return { online: res.data.database === 'connected', detail: res.data.database };
  }},
  { key: 'businessTools', label: 'Business Tools Enabled', check: async () => {
    const res = await api.get('/ai-receptionist/health');
    return { online: res.data.businessToolsEnabled, detail: res.data.businessToolsEnabled ? 'Appointments & Tickets' : 'Knowledge only' };
  }},
];

export default function RealtimeStatusIndicators() {
  const [statuses, setStatuses] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function checkAll() {
      const results = {};
      await Promise.allSettled(
        INDICATORS.map(async (indicator) => {
          try {
            const result = await indicator.check();
            results[indicator.key] = { ...result, label: indicator.label };
          } catch {
            results[indicator.key] = { online: false, label: indicator.label, detail: 'Check failed' };
          }
        })
      );
      if (mounted) {
        setStatuses(results);
        setLoading(false);
      }
    }
    checkAll();
    const interval = setInterval(checkAll, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (loading) {
    return (
      <div className="flex gap-3 flex-wrap mb-4">
        {INDICATORS.map((ind) => (
          <div key={ind.key} className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2">
            <div className="h-2 w-2 rounded-full bg-slate-600 animate-pulse" />
            <span className="text-xs text-slate-500">{ind.label}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-3 flex-wrap mb-4">
      {Object.values(statuses).map((s) => (
        <div
          key={s.label}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
            s.online
              ? 'border-green-800/40 bg-green-900/20'
              : 'border-red-800/40 bg-red-900/20'
          }`}
          title={s.detail || ''}
        >
          <div className={`h-2 w-2 rounded-full ${s.online ? 'bg-green-400' : 'bg-red-400'}`} />
          <span className={`text-xs font-medium ${s.online ? 'text-green-300' : 'text-red-300'}`}>
            {s.label}
          </span>
          {s.detail && (
            <span className="text-xs text-slate-500 hidden sm:inline ml-1">- {s.detail}</span>
          )}
        </div>
      ))}
    </div>
  );
}
