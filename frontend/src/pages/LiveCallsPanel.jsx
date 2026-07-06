import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import { connectSocket, subscribeSocket, unsubscribeSocket } from '../services/socket';

export default function LiveCallsPanel({ showToast }) {
  const [activeCalls, setActiveCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTranscript, setSelectedTranscript] = useState(null);
  const handlersRef = useRef({});

  const fetchLiveCalls = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/ai-receptionist/live-calls');
      setActiveCalls(res.data.data.activeCalls || []);
    } catch (err) {
      console.error('Error fetching live calls:', err);
      setActiveCalls([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveCalls();
    const interval = setInterval(fetchLiveCalls, 5000);

    const socket = subscribeSocket();
    connectSocket();
    socket.emit('receptionist:join');

    const handlers = {
      'call.started': (data) => {
        setActiveCalls((prev) => {
          if (prev.find((c) => c.callSid === data.callSid)) return prev;
          return [{ ...data, duration: 0 }, ...prev];
        });
      },
      'call.ended': (data) => {
        setActiveCalls((prev) => prev.filter((c) => c.callSid !== data.callSid));
        showToast?.('Call ended', 'info');
      },
      'transcript.partial': (data) => {
        setActiveCalls((prev) => prev.map((c) =>
          c.callSid === data.callSid ? { ...c, liveTranscript: data.text, isSpeaking: data.isSpeaking } : c
        ));
      },
      'transcript.final': (data) => {
        setActiveCalls((prev) => prev.map((c) => {
          if (c.callSid !== data.callSid) return c;
          const history = c.transcriptHistory || [];
          return {
            ...c,
            transcriptHistory: [...history, { role: data.role, text: data.text, timestamp: data.timestamp }],
            liveTranscript: '',
          };
        }));
      },
      'intent.changed': (data) => {
        setActiveCalls((prev) => prev.map((c) =>
          c.callSid === data.callSid ? { ...c, currentIntent: data.intent } : c
        ));
      },
      'tool.called': (data) => {
        setActiveCalls((prev) => prev.map((c) =>
          c.callSid === data.callSid ? { ...c, lastTool: data.tool } : c
        ));
      },
      'call.escalated': (data) => {
        setActiveCalls((prev) => prev.filter((c) => c.callSid !== data.callSid));
        showToast?.('Call escalated to human', 'warning');
      },
    };

    Object.entries(handlers).forEach(([event, fn]) => {
      socket.on(event, fn);
      handlersRef.current[event] = fn;
    });

    return () => {
      clearInterval(interval);
      Object.entries(handlersRef.current).forEach(([event, fn]) => {
        socket.off(event, fn);
      });
      unsubscribeSocket();
    };
  }, [fetchLiveCalls, showToast]);

  const handleEndCall = async (callSid) => {
    try {
      await api.post(`/ai-receptionist/live-calls/${callSid}/end`);
      setActiveCalls((prev) => prev.filter((c) => c.callSid !== callSid));
      showToast?.('Call ended', 'info');
    } catch (err) {
      showToast?.('Failed to end call', 'error');
    }
  };

  const handleEscalate = async (callSid) => {
    try {
      await api.post(`/ai-receptionist/live-calls/${callSid}/escalate`, {
        reason: 'Manual escalation by admin',
        department: 'support',
      });
      setActiveCalls((prev) => prev.filter((c) => c.callSid !== callSid));
      showToast?.('Call escalated to human', 'success');
    } catch (err) {
      showToast?.('Failed to escalate call', 'error');
    }
  };

  const formatDuration = (ms) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">
          Live Calls
          {activeCalls.length > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-green-900/50 px-2 py-0.5 text-xs font-medium text-green-300">
              {activeCalls.length} active
            </span>
          )}
        </h2>
        <button onClick={fetchLiveCalls} className="btn-secondary text-xs">
          Refresh
        </button>
      </div>

      {activeCalls.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-8 text-center">
          <p className="text-slate-500">No active calls</p>
          <p className="mt-1 text-xs text-slate-600">When calls come in via Twilio, they will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeCalls.map((call) => (
            <div key={call.callSid} className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-sm font-medium text-white">
                      {call.detectedName || call.callerNumber || 'Unknown'}
                    </span>
                    {call.detectedName && call.callerNumber && (
                      <span className="text-xs text-slate-500">{call.callerNumber}</span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="rounded bg-slate-700 px-2 py-0.5 text-slate-300">
                      {formatDuration(call.duration)}
                    </span>
                    <span className="rounded bg-slate-700 px-2 py-0.5 text-slate-300">
                      {call.language?.toUpperCase() || 'EN'}
                    </span>
                    <span className="rounded bg-blue-900/30 px-2 py-0.5 text-blue-300">
                      {call.currentIntent || 'Unknown'}
                    </span>
                    {call.aiConfidence != null && (
                      <span className={`rounded px-2 py-0.5 ${
                        call.aiConfidence > 0.7 ? 'bg-green-900/30 text-green-300' :
                        call.aiConfidence > 0.4 ? 'bg-amber-900/30 text-amber-300' :
                        'bg-red-900/30 text-red-300'
                      }`}>
                        {Math.round(call.aiConfidence * 100)}% confidence
                      </span>
                    )}
                    <span className={`rounded px-2 py-0.5 ${
                      call.status === 'IN_PROGRESS' ? 'bg-green-900/30 text-green-300' : 'bg-slate-700 text-slate-300'
                    }`}>
                      {call.status}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEscalate(call.callSid)}
                    className="rounded bg-amber-600/20 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-600/30"
                  >
                    Escalate
                  </button>
                  <button
                    onClick={() => handleEndCall(call.callSid)}
                    className="rounded bg-red-600/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-600/30"
                  >
                    End Call
                  </button>
                </div>
              </div>

              {(call.liveTranscript || call.transcriptHistory?.length > 0) && (
                <div className="mt-3 rounded bg-slate-900/50 p-3">
                  {call.liveTranscript && (
                    <div className="flex items-start gap-2 text-xs">
                      <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-cyan-500 animate-pulse" />
                      <p className="text-slate-300 italic">{call.liveTranscript}</p>
                    </div>
                  )}
                  {call.transcriptHistory?.slice(-3).map((entry, i) => (
                    <div key={i} className={`flex items-start gap-2 text-xs ${
                      entry.role === 'caller' ? 'text-slate-400' : 'text-cyan-400'
                    }`}>
                      <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-600" />
                      <p><span className="font-medium">{entry.role === 'caller' ? 'Caller' : 'AI'}:</span> {entry.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}