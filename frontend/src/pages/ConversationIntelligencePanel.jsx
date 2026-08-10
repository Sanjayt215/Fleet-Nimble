import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import { connectSocket, subscribeSocket, unsubscribeSocket } from '../services/socket';
import { normalizeDisplayText } from '../utils/normalizeDisplayText';

const STAGE_STYLES = {
  thinking: { bg: 'bg-violet-900/30', text: 'text-violet-300', label: 'Thinking' },
  searching: { bg: 'bg-blue-900/30', text: 'text-blue-300', label: 'Searching' },
  booking_demo: { bg: 'bg-purple-900/30', text: 'text-purple-300', label: 'Booking Demo' },
  saving_crm: { bg: 'bg-cyan-900/30', text: 'text-cyan-300', label: 'Saving to CRM' },
  executing_tool: { bg: 'bg-amber-900/30', text: 'text-amber-300', label: 'Executing Tool' },
  ai_speaking: { bg: 'bg-green-900/30', text: 'text-green-300', label: 'AI Speaking' },
  customer_speaking: { bg: 'bg-slate-700', text: 'text-slate-300', label: 'Customer Speaking' },
  completed: { bg: 'bg-green-900/50', text: 'text-green-300', label: 'Completed' },
  ended: { bg: 'bg-slate-700', text: 'text-slate-300', label: 'Ended' },
  default: { bg: 'bg-slate-800', text: 'text-slate-300', label: 'Unknown' },
};

const EVENT_ICONS = {
  CALL_STARTED: '📞',
  GREETING_SENT: '👋',
  INTENT_DETECTED: '🎯',
  KNOWLEDGE_SEARCHED: '📚',
  LEAD_QUALIFIED: '⭐',
  TOOL_STARTED: '🛠️',
  TOOL_COMPLETED: '✅',
  APPOINTMENT_CONFIRMED: '📅',
  CRM_UPDATED: '💾',
  SUMMARY_CREATED: '📝',
  MEMORY_UPDATED: '🧠',
  FSM_TRANSITION: '🔁',
  AGENT_RUN_STARTED: '🤖',
  AGENT_RUN_COMPLETED: '🏁',
  SUPERVISOR_RETRY: '🔁',
  SUPERVISOR_RECOVERED: '🩹',
  CALL_COMPLETED: '📴',
};

function TimelineFeed({ events }) {
  if (!events || events.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6 text-center">
        <p className="text-slate-500">No timeline events yet</p>
        <p className="mt-1 text-xs text-slate-600">Live call events will stream in here in real time</p>
      </div>
    );
  }

  return (
    <div className="max-h-96 space-y-1.5 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900/60 p-3">
      {events.slice().reverse().map((event, i) => (
        <div key={event.id || `${event.at}-${i}`} className="flex items-start gap-2 text-xs">
          <span className="mt-0.5">{EVENT_ICONS[event.eventType] || '•'}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-200">{normalizeDisplayText(event.label || event.eventType)}</span>
              <span className="text-[10px] text-slate-500">{event.eventType}</span>
            </div>
            {event.data && Object.keys(event.data).length > 0 && (
              <p className="truncate text-slate-500">{JSON.stringify(event.data)}</p>
            )}
          </div>
          <span className="text-[10px] text-slate-600">{new Date(event.at).toLocaleTimeString()}</span>
        </div>
      ))}
    </div>
  );
}

function ScoreCard({ label, value, color = 'text-cyan-400' }) {
  return (
    <div className="card">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value == null ? '-' : value}</p>
    </div>
  );
}

export default function ConversationIntelligencePanel({ showToast }) {
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [stages, setStages] = useState([]);
  const [followUps, setFollowUps] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [supervisor, setSupervisor] = useState(null);
  const [loading, setLoading] = useState(true);
  const handlersRef = useRef({});

  const fetchStatic = useCallback(async () => {
    const [analyticsRes, followUpsRes, supervisorRes, liveRes] = await Promise.allSettled([
      api.get('/ai-receptionist/conversations/analytics'),
      api.get('/ai-receptionist/conversations/follow-ups?limit=25'),
      api.get('/ai-receptionist/conversations/supervisor'),
      api.get('/ai-receptionist/conversations/live'),
    ]);
    if (analyticsRes.status === 'fulfilled') setAnalytics(analyticsRes.value.data.data || null);
    if (followUpsRes.status === 'fulfilled') setFollowUps(followUpsRes.value.data.data || []);
    if (supervisorRes.status === 'fulfilled') setSupervisor(supervisorRes.value.data.data || null);
    if (liveRes.status === 'fulfilled') {
      const live = liveRes.value.data.data || {};
      const events = [];
      (live.liveTimelines || []).forEach((tl) => {
        (tl.events || []).forEach((e) => events.push({ ...e, callId: tl.callId }));
      });
      if (events.length > 0) setTimelineEvents((prev) => [...events, ...prev].slice(0, 300));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStatic();
    const interval = setInterval(fetchStatic, 15000);

    const socket = subscribeSocket();
    connectSocket();
    socket.emit('receptionist:join');

    const handlers = {
      'timeline.event': (event) => {
        setTimelineEvents((prev) => [event, ...prev].slice(0, 300));
      },
      'call.stage': (data) => {
        setStages((prev) => [data, ...prev].filter((s) => s.callSid !== data.callSid).slice(0, 20));
      },
      'call.fsm': (data) => {
        setTimelineEvents((prev) => [
          {
            id: `fsm-${Date.now()}`,
            callSid: data.callSid,
            eventType: 'FSM_TRANSITION',
            label: `State: ${data.from} → ${data.to}`,
            data: { from: data.from, to: data.to },
            at: data.timestamp,
          },
          ...prev,
        ].slice(0, 300));
      },
      'call.completed': () => { fetchStatic(); },
      'analytics.refresh': () => { fetchStatic(); },
      'dashboard.refresh': () => { fetchStatic(); },
    };

    Object.entries(handlers).forEach(([event, fn]) => {
      socket.on(event, fn);
      handlersRef.current[event] = fn;
    });

    return () => {
      clearInterval(interval);
      Object.entries(handlersRef.current).forEach(([event, fn]) => socket.off(event, fn));
      unsubscribeSocket();
    };
  }, [fetchStatic]);

  const completeFollowUp = async (id) => {
    try {
      await api.post(`/ai-receptionist/conversations/follow-ups/${id}/complete`);
      setFollowUps((prev) => prev.map((f) => (f.id === id ? { ...f, status: 'DONE' } : f)));
      showToast?.('Follow-up marked complete', 'success');
    } catch {
      showToast?.('Failed to update follow-up', 'error');
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Live Conversation Intelligence</h2>
        <button onClick={fetchStatic} className="btn-secondary text-xs">Refresh</button>
      </div>

      {/* Live call stages */}
      <div>
        <p className="mb-2 text-xs font-semibold text-slate-500">Live Call Stages</p>
        {stages.length === 0 ? (
          <p className="text-xs text-slate-600">No live calls at the moment.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {stages.slice(0, 6).map((stage) => {
              const style = STAGE_STYLES[stage.stage] || STAGE_STYLES.default;
              return (
                <div key={`${stage.callSid}-${stage.timestamp}`} className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/50 p-3">
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white">{stage.callSid}</p>
                    <span className={`mt-0.5 inline-flex rounded px-2 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}>
                      {style.label}
                    </span>
                  </div>
                  <span className="ml-auto text-[10px] text-slate-500">{new Date(stage.timestamp).toLocaleTimeString()}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Timeline */}
      <div>
        <p className="mb-2 text-xs font-semibold text-slate-500">Real-Time Timeline</p>
        <TimelineFeed events={timelineEvents} />
      </div>

      {/* Analytics overview */}
      {analytics && Object.keys(analytics).length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-slate-500">Conversation Quality (30-day overview)</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ScoreCard label="Calls Analyzed" value={analytics.analyzed} />
            <ScoreCard label="Avg Conversation Score" value={analytics.avgConversationScore} color="text-green-400" />
            <ScoreCard label="Avg Sales Score" value={analytics.avgSalesScore} color="text-purple-400" />
            <ScoreCard label="Avg Support Score" value={analytics.avgSupportScore} color="text-amber-400" />
            <ScoreCard label="Avg Response Latency" value={analytics.avgResponseLatencyMs != null ? `${analytics.avgResponseLatencyMs}ms` : '-'} color="text-blue-400" />
            <ScoreCard label="Interruptions (total)" value={analytics.totalInterruptions} color="text-red-400" />
            <ScoreCard label="Knowledge Searches" value={analytics.totalKnowledgeHits} color="text-violet-400" />
            <ScoreCard label="Avg Talk Ratio" value={analytics.avgTalkRatio} color="text-cyan-400" />
          </div>
        </div>
      )}

      {/* Supervisor status */}
      {supervisor && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
          <p className="mb-1 text-xs font-semibold text-slate-500">AI Supervisor</p>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <p className="text-slate-400">Status: <span className="text-slate-200">{supervisor.status || '-'}</span></p>
            <p className="text-slate-400">Healthy agents: <span className="text-slate-200">{supervisor.healthyAgents ?? '-'}</span></p>
            <p className="text-slate-400">Degraded agents: <span className="text-slate-200">{supervisor.degradedAgents ?? '-'}</span></p>
            <p className="text-slate-400">Retries tracked: <span className="text-slate-200">{supervisor.retries ?? '-'}</span></p>
          </div>
        </div>
      )}

      {/* Follow-ups */}
      <div>
        <p className="mb-2 text-xs font-semibold text-slate-500">Follow-Up Queue</p>
        {followUps.length === 0 ? (
          <p className="text-xs text-slate-600">No follow-ups queued.</p>
        ) : (
          <div className="space-y-2">
            {followUps.slice(0, 10).map((fu) => (
              <div key={fu.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-800/50 p-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white">{fu.subject || fu.channel}</p>
                  <p className="text-[10px] text-slate-500">
                    {fu.channel} · {fu.customer?.name || fu.customer?.companyName || '-'} · due {formatDate(fu.dueAt)}
                  </p>
                  {fu.content && <p className="mt-0.5 truncate text-[10px] text-slate-500">{fu.content}</p>}
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    fu.status === 'DONE' ? 'bg-green-900/40 text-green-300' :
                    fu.status === 'SENT' ? 'bg-blue-900/40 text-blue-300' :
                    'bg-amber-900/40 text-amber-300'
                  }`}>{fu.status}</span>
                  {fu.status !== 'DONE' && (
                    <button
                      onClick={() => completeFollowUp(fu.id)}
                      className="rounded bg-green-600/20 px-2 py-1 text-[10px] font-medium text-green-400 hover:bg-green-600/30"
                    >
                      Complete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
