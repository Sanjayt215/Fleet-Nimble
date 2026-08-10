import { useState, useEffect } from 'react';
import api from '../services/api';

const EVENT_ICONS = {
  CALL_STARTED: '📞', GREETING_SENT: '👋', INTENT_DETECTED: '🎯', KNOWLEDGE_SEARCHED: '📚',
  LEAD_QUALIFIED: '⭐', TOOL_STARTED: '🛠️', TOOL_COMPLETED: '✅', APPOINTMENT_CONFIRMED: '📅',
  CRM_UPDATED: '💾', SUMMARY_CREATED: '📝', MEMORY_UPDATED: '🧠', FSM_TRANSITION: '🔁',
  AGENT_RUN_STARTED: '🤖', AGENT_RUN_COMPLETED: '🏁', SUPERVISOR_RETRY: '🔁',
  SUPERVISOR_RECOVERED: '🩹', CALL_COMPLETED: '📴',
};

export default function CallDetailModal({ call, onClose, onRefresh }) {
  const [intelligence, setIntelligence] = useState(null);
  const [intelLoading, setIntelLoading] = useState(false);

  useEffect(() => {
    if (!call?.id) return;
    let cancelled = false;
    setIntelLoading(true);
    Promise.allSettled([
      api.get(`/ai-receptionist/conversations/replay/${call.id}`),
      api.get(`/ai-receptionist/conversations/summaries/${call.id}`),
      api.get(`/ai-receptionist/conversations/analytics/${call.id}`),
    ]).then(([replayRes, summaryRes, analyticsRes]) => {
      if (cancelled) return;
      setIntelligence({
        replay: replayRes.status === 'fulfilled' ? replayRes.value.data.data : null,
        summary: summaryRes.status === 'fulfilled' ? summaryRes.value.data.data : null,
        analytics: analyticsRes.status === 'fulfilled' ? analyticsRes.value.data.data : null,
      });
      setIntelLoading(false);
    });
    return () => { cancelled = true; };
  }, [call?.id]);

  let transcript = [];
  try {
    if (call.transcript) {
      transcript = typeof call.transcript === 'string' ? JSON.parse(call.transcript) : call.transcript;
    }
  } catch { transcript = []; }

  const extractedData = call.extractedData || {};
  const sentimentColor = call.sentiment === 'positive' ? 'text-green-400' :
    call.sentiment === 'negative' ? 'text-red-400' :
    'text-slate-400';

  const formatDuration = (seconds) => {
    if (!seconds) return '-';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${seconds}s`;
  };

  const formatLatency = (ms) => {
    if (!ms) return '-';
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
  };

  const timeline = intelligence?.replay?.timeline || [];
  const analytics = intelligence?.analytics;
  const summary = intelligence?.summary;
  const agentRuns = intelligence?.replay?.agentRuns || [];
  const latencyMarkers = intelligence?.replay?.latency?.markers || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="mx-4 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Call Details</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">&times;</button>
        </div>

        <div className="space-y-6 px-6 py-4">
          {/* Caller Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500">Name</p>
              <p className="text-sm text-white">{call.callerName || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Company</p>
              <p className="text-sm text-white">{call.companyName || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Phone</p>
              <p className="text-sm text-white">{call.callerPhone || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Email</p>
              <p className="text-sm text-white">{call.callerEmail || '-'}</p>
            </div>
            {call.fleetSize != null && (
              <div>
                <p className="text-xs text-slate-500">Fleet Size</p>
                <p className="text-sm text-white">{call.fleetSize} vehicles</p>
              </div>
            )}
            <div>
              <p className="text-xs text-slate-500">Duration</p>
              <p className="text-sm text-white">{formatDuration(call.durationSeconds)}</p>
            </div>
            {call.customer?.leadScore != null && (
              <div>
                <p className="text-xs text-slate-500">Lead Score</p>
                <p className="text-sm font-semibold text-amber-400">{call.customer.leadScore}/100</p>
              </div>
            )}
            <div>
              <p className="text-xs text-slate-500">Sentiment</p>
              <p className={`text-sm capitalize ${sentimentColor}`}>{call.sentiment || 'neutral'}</p>
            </div>
          </div>

          {/* Status & Type */}
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
              call.callStatus === 'COMPLETED' ? 'bg-green-900/50 text-green-300' :
              call.callStatus === 'ESCALATED' ? 'bg-red-900/50 text-red-300' :
              call.callStatus === 'IN_PROGRESS' ? 'bg-amber-900/50 text-amber-300' :
              'bg-blue-900/50 text-blue-300'
            }`}>{call.callStatus}</span>
            <span className="inline-flex rounded-full bg-slate-700 px-3 py-1 text-xs font-medium text-slate-300">{call.callType}</span>
            {call.appointment && (
              <span className="inline-flex rounded-full bg-blue-900/50 px-3 py-1 text-xs font-medium text-blue-300">
                Appointment: {call.appointment.status}
              </span>
            )}
          </div>

          {/* Summary */}
          {call.summary && (
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-500">AI Summary</p>
              <p className="rounded-lg bg-slate-800 p-3 text-sm text-slate-200">{call.summary}</p>
            </div>
          )}

          {/* Recording */}
          {call.recordingUrl && (
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
              <p className="mb-2 text-xs font-semibold text-slate-500">Call Recording</p>
              <audio controls className="w-full" src={call.recordingUrl}>
                Your browser does not support the audio element.
              </audio>
              {call.recordingDuration && (
                <p className="mt-1 text-xs text-slate-500">Duration: {formatDuration(call.recordingDuration)}</p>
              )}
            </div>
          )}

          {/* Extracted Data */}
          {Object.keys(extractedData).length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-500">Extracted Details</p>
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-800 p-3 text-xs text-slate-300">
                {Object.entries(extractedData).filter(([, v]) => v).map(([key, val]) => (
                  <span key={key}><span className="text-slate-500">{key.replace(/([A-Z])/g, ' $1')}:</span> {String(val)}</span>
                ))}
              </div>
            </div>
          )}

          {/* Transcript */}
          {transcript.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-500">Transcript</p>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg bg-slate-800 p-3">
                {transcript.map((msg, i) => (
                  <div key={i} className={`text-sm ${msg.role === 'caller' || msg.role === 'user' ? 'text-cyan-300' : 'text-slate-300'}`}>
                    <span className="text-xs text-slate-500">{msg.role === 'caller' || msg.role === 'user' ? 'Caller' : 'AI'}:</span> {msg.content}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Conversation Intelligence */}
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-500">Conversation Intelligence</p>
            {intelLoading ? (
              <div className="flex items-center justify-center h-16">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
              </div>
            ) : (
              <div className="space-y-4">
                {analytics && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-lg bg-slate-800 p-2 text-center">
                      <p className="text-[10px] text-slate-500">Conversation</p>
                      <p className="text-sm font-bold text-green-400">{analytics.conversationScore}</p>
                    </div>
                    <div className="rounded-lg bg-slate-800 p-2 text-center">
                      <p className="text-[10px] text-slate-500">Sales</p>
                      <p className="text-sm font-bold text-purple-400">{analytics.salesScore}</p>
                    </div>
                    <div className="rounded-lg bg-slate-800 p-2 text-center">
                      <p className="text-[10px] text-slate-500">Support</p>
                      <p className="text-sm font-bold text-amber-400">{analytics.supportScore}</p>
                    </div>
                    <div className="rounded-lg bg-slate-800 p-2 text-center">
                      <p className="text-[10px] text-slate-500">Avg Latency</p>
                      <p className="text-sm font-bold text-blue-400">{formatLatency(analytics.avgResponseLatencyMs)}</p>
                    </div>
                  </div>
                )}

                {analytics?.breakdown && (
                  <div className="flex flex-wrap gap-2 text-[10px] text-slate-400">
                    <span className="rounded bg-slate-800 px-2 py-0.5">Talk ratio: {analytics.breakdown.talkRatio}</span>
                    <span className="rounded bg-slate-800 px-2 py-0.5">Interruptions: {analytics.breakdown.interruptions}</span>
                    <span className="rounded bg-slate-800 px-2 py-0.5">Silence: {formatLatency(analytics.breakdown.silenceDurationMs)}</span>
                    <span className="rounded bg-slate-800 px-2 py-0.5">Knowledge hits: {analytics.breakdown.knowledgeHits}</span>
                    <span className="rounded bg-slate-800 px-2 py-0.5">Tool uses: {analytics.breakdown.toolUses}</span>
                  </div>
                )}

                {summary && (
                  <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-800/50 p-3">
                    {summary.executiveSummary && (
                      <p className="text-xs text-slate-300"><span className="text-slate-500 font-medium">Executive: </span>{summary.executiveSummary}</p>
                    )}
                    {summary.salesSummary && (
                      <p className="text-xs text-slate-300"><span className="text-slate-500 font-medium">Sales: </span>{summary.salesSummary}</p>
                    )}
                    {summary.supportSummary && (
                      <p className="text-xs text-slate-300"><span className="text-slate-500 font-medium">Support: </span>{summary.supportSummary}</p>
                    )}
                    {(summary.customerIntent || summary.nextBestAction) && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {summary.customerIntent && (
                          <span className="rounded bg-blue-900/30 px-2 py-0.5 text-[10px] text-blue-300">Intent: {summary.customerIntent}</span>
                        )}
                        {summary.nextBestAction && (
                          <span className="rounded bg-green-900/30 px-2 py-0.5 text-[10px] text-green-300">Next best action: {summary.nextBestAction}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {timeline.length > 0 && (
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-slate-800/60 p-2">
                    {timeline.map((event, i) => (
                      <div key={event.id || `${event.at}-${i}`} className="flex items-start gap-2 text-[11px]">
                        <span>{EVENT_ICONS[event.eventType] || '•'}</span>
                        <span className="text-slate-300">{event.label || event.eventType}</span>
                        <span className="ml-auto text-[10px] text-slate-600">{new Date(event.at).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                {latencyMarkers.length > 0 && (
                  <div>
                    <p className="mb-1 text-[10px] text-slate-500">Turn latencies</p>
                    <div className="flex flex-wrap gap-1">
                      {latencyMarkers.slice(-12).map((m, i) => (
                        <span key={i} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{formatLatency(m.gapMs)}</span>
                      ))}
                    </div>
                  </div>
                )}

                {agentRuns.length > 0 && (
                  <div className="rounded-lg bg-slate-800/60 p-2">
                    <p className="mb-1 text-[10px] font-semibold text-slate-500">Agent runs ({agentRuns.length})</p>
                    <div className="space-y-1">
                      {agentRuns.map((run) => (
                        <div key={run.id} className="flex items-center gap-2 text-[11px]">
                          <span className={`rounded px-1.5 py-0.5 font-medium ${
                            run.status === 'SUCCESS' ? 'bg-green-900/40 text-green-300' :
                            run.status === 'FAILED' ? 'bg-red-900/40 text-red-300' :
                            'bg-amber-900/40 text-amber-300'
                          }`}>{run.status}</span>
                          <span className="text-slate-300">{run.mode}</span>
                          <span className="text-slate-500">intent: {run.intent || '-'}</span>
                          <span className="ml-auto text-[10px] text-slate-600">
                            {run.tasks?.length || 0} tasks · {new Date(run.startedAt).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!analytics && !summary && timeline.length === 0 && agentRuns.length === 0 && (
                  <p className="text-xs text-slate-600">No conversation intelligence available for this call.</p>
                )}
              </div>
            )}
          </div>

          {/* Related Appointment */}
          {call.appointment && (
            <div className="rounded-lg border border-blue-700 bg-blue-900/20 p-3">
              <p className="text-sm font-medium text-blue-300">Related Appointment</p>
              <div className="mt-1 space-y-1 text-xs text-blue-400">
                <p>Title: {call.appointment.meetingTitle}</p>
                <p>Time: {new Date(call.appointment.scheduledDate).toLocaleString()}</p>
                <p>Status: {call.appointment.status}</p>
                {call.appointment.meetingLink && (
                  <a href={call.appointment.meetingLink} target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline">Join Meeting</a>
                )}
              </div>
            </div>
          )}

          {/* Related Support Ticket */}
          {call.supportTicket && (
            <div className="rounded-lg border border-amber-700 bg-amber-900/20 p-3">
              <p className="text-sm font-medium text-amber-300">Related Support Ticket</p>
              <p className="text-xs text-amber-400">{call.supportTicket.issueTitle} ({call.supportTicket.status})</p>
            </div>
          )}

          {/* Timestamps */}
          <div className="text-xs text-slate-500">
            <p>Started: {new Date(call.callStartedAt).toLocaleString()}</p>
            {call.callEndedAt && <p>Ended: {new Date(call.callEndedAt).toLocaleString()}</p>}
          </div>
        </div>

        <div className="border-t border-slate-700 px-6 py-4">
          <button onClick={onClose} className="btn-secondary w-full">Close</button>
        </div>
      </div>
    </div>
  );
}
