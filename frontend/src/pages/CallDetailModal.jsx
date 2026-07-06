import api from '../services/api';

export default function CallDetailModal({ call, onClose, onRefresh }) {
  let transcript = [];
  try {
    if (call.transcript) {
      transcript = typeof call.transcript === 'string' ? JSON.parse(call.transcript) : call.transcript;
    }
  } catch { transcript = []; }

  const extractedData = call.extractedData || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="mx-4 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Call Details</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">&times;</button>
        </div>

        <div className="space-y-6 px-6 py-4">
          {/* Caller Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500">Caller Name</p>
              <p className="text-sm text-white">{call.callerName}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Phone</p>
              <p className="text-sm text-white">{call.callerPhone || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Email</p>
              <p className="text-sm text-white">{call.callerEmail || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Company</p>
              <p className="text-sm text-white">{call.companyName || '-'}</p>
            </div>
            {call.fleetSize != null && (
              <div>
                <p className="text-xs text-slate-500">Fleet Size</p>
                <p className="text-sm text-white">{call.fleetSize} vehicles</p>
              </div>
            )}
            <div>
              <p className="text-xs text-slate-500">Duration</p>
              <p className="text-sm text-white">{call.durationSeconds ? `${call.durationSeconds}s` : '-'}</p>
            </div>
          </div>

          {/* Status & Type */}
          <div className="flex gap-3">
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
              call.callStatus === 'COMPLETED' ? 'bg-green-900/50 text-green-300' :
              call.callStatus === 'ESCALATED' ? 'bg-red-900/50 text-red-300' :
              call.callStatus === 'IN_PROGRESS' ? 'bg-amber-900/50 text-amber-300' :
              'bg-blue-900/50 text-blue-300'
            }`}>{call.callStatus}</span>
            <span className="inline-flex rounded-full bg-slate-700 px-3 py-1 text-xs font-medium text-slate-300">{call.callType}</span>
          </div>

          {/* Summary */}
          {call.summary && (
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-500">AI Summary</p>
              <p className="rounded-lg bg-slate-800 p-3 text-sm text-slate-200">{call.summary}</p>
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
                  <div key={i} className={`text-sm ${msg.role === 'user' ? 'text-cyan-300' : 'text-slate-300'}`}>
                    <span className="text-xs text-slate-500">{msg.role === 'user' ? 'Caller' : 'AI'}:</span> {msg.content}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Related Appointment */}
          {call.appointment && (
            <div className="rounded-lg border border-blue-700 bg-blue-900/20 p-3">
              <p className="text-sm font-medium text-blue-300">Related Appointment</p>
              <p className="text-xs text-blue-400">{call.appointment.meetingTitle} - {new Date(call.appointment.scheduledDate).toLocaleString()} ({call.appointment.status})</p>
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
