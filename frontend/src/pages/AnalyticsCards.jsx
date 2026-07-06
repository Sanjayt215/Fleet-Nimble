import { useState, useEffect } from 'react';
import api from '../services/api';

export default function AnalyticsCards() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const res = await api.get('/ai-receptionist/analytics');
      setAnalytics(res.data.data);
    } catch (err) {
      console.error('Error loading analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-20">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
      </div>
    );
  }

  if (!analytics) return null;

  const formatDuration = (sec) => {
    if (!sec) return '0s';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card">
          <p className="text-xs text-slate-500">Calls Today</p>
          <p className="mt-1 text-2xl font-bold text-cyan-400">{analytics.totalCallsToday}</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-500">Active Calls</p>
          <p className="mt-1 text-2xl font-bold text-green-400">{analytics.activeCalls}</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-500">Avg Duration</p>
          <p className="mt-1 text-2xl font-bold text-blue-400">{formatDuration(analytics.averageDuration)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-500">Missed Calls</p>
          <p className="mt-1 text-2xl font-bold text-slate-400">{analytics.missedCalls}</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-500">Escalated</p>
          <p className="mt-1 text-2xl font-bold text-red-400">{analytics.escalatedCalls}</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-500">Appt Conversion</p>
          <p className="mt-1 text-2xl font-bold text-purple-400">{analytics.appointmentConversionRate}%</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-500">Ticket Rate</p>
          <p className="mt-1 text-2xl font-bold text-amber-400">{analytics.ticketCreationRate}%</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-500">Total Appts</p>
          <p className="mt-1 text-2xl font-bold text-blue-400">{analytics.totalAppointments}</p>
        </div>
      </div>

      {analytics.topCallReasons && Object.keys(analytics.topCallReasons).length > 0 && (
        <div className="card">
          <p className="mb-2 text-sm font-medium text-white">Top Call Reasons</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(analytics.topCallReasons).map(([reason, count]) => (
              <span key={reason} className="rounded-full bg-slate-700 px-3 py-1 text-xs text-slate-300">
                {reason}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {analytics.languageDistribution && Object.keys(analytics.languageDistribution).length > 0 && (
        <div className="card">
          <p className="mb-2 text-sm font-medium text-white">Languages</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(analytics.languageDistribution).map(([lang, count]) => (
              <span key={lang} className="rounded-full bg-slate-700 px-3 py-1 text-xs text-slate-300">
                {lang.toUpperCase()}: {count}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}