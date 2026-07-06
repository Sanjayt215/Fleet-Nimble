import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import SimulateCallModal from './SimulateCallModal';
import CallDetailModal from './CallDetailModal';
import AppointmentModal from './AppointmentModal';
import SupportTicketModal from './SupportTicketModal';
import ReceptionistSettingsModal from './ReceptionistSettingsModal';
import LiveCallsPanel from './LiveCallsPanel';
import AnalyticsCards from './AnalyticsCards';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'live', label: 'Live Calls' },
  { id: 'analytics', label: 'Analytics' },
];

export default function AIReceptionist() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [summary, setSummary] = useState(null);
  const [calls, setCalls] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [callPage, setCallPage] = useState(1);
  const [callTotalPages, setCallTotalPages] = useState(1);

  const [showSimulate, setShowSimulate] = useState(false);
  const [showAppointment, setShowAppointment] = useState(false);
  const [showTicket, setShowTicket] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedCall, setSelectedCall] = useState(null);
  const [showCallDetail, setShowCallDetail] = useState(false);

  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [summaryRes, callsRes, apptsRes, ticketsRes] = await Promise.all([
        api.get('/ai-receptionist/summary'),
        api.get('/ai-receptionist/calls?page=1&limit=10'),
        api.get('/ai-receptionist/appointments?limit=5'),
        api.get('/ai-receptionist/support-tickets?limit=5'),
      ]);
      setSummary(summaryRes.data.data);
      setCalls(callsRes.data.data.calls || []);
      setCallTotalPages(callsRes.data.data.totalPages || 1);
      setAppointments(apptsRes.data.data.appointments || []);
      setTickets(ticketsRes.data.data.tickets || []);
    } catch (err) {
      console.error('Error fetching receptionist data:', err);
      setError('Failed to load AI Receptionist data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const loadCalls = useCallback(async (page) => {
    try {
      const res = await api.get(`/ai-receptionist/calls?page=${page}&limit=10`);
      setCalls(res.data.data.calls || []);
      setCallTotalPages(res.data.data.totalPages || 1);
      setCallPage(page);
    } catch (err) {
      console.error('Error loading calls:', err);
    }
  }, []);

  const handleCallCreated = () => {
    fetchData();
    showToast('Call session created successfully');
  };

  const handleAppointmentCreated = () => {
    setShowAppointment(false);
    fetchData();
    showToast('Appointment created successfully');
  };

  const handleTicketCreated = () => {
    setShowTicket(false);
    fetchData();
    showToast('Support ticket created successfully');
  };

  const handleViewCall = async (callId) => {
    try {
      const res = await api.get(`/ai-receptionist/calls/${callId}`);
      setSelectedCall(res.data.data);
      setShowCallDetail(true);
    } catch (err) {
      showToast('Failed to load call details', 'error');
    }
  };

  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">AI Receptionist</h1>
          <p className="mt-1 text-sm text-slate-400">Automated call handling, appointment scheduling, and support intake.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-cyan-500 text-cyan-400'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-700 bg-red-900/30 p-4 text-sm text-red-300">
          {error}
          <button onClick={fetchData} className="ml-3 underline hover:text-red-200">Retry</button>
        </div>
      )}

      {/* Live Calls Tab */}
      {activeTab === 'live' && (
        <LiveCallsPanel showToast={showToast} />
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <AnalyticsCards />
      )}

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card">
            <p className="text-sm text-slate-400">Total Calls</p>
            <p className="mt-1 text-3xl font-bold text-cyan-400">{summary?.totalCalls || 0}</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-400">Scheduled Meetings</p>
            <p className="mt-1 text-3xl font-bold text-blue-400">{summary?.scheduledMeetings || 0}</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-400">Support Tickets</p>
            <p className="mt-1 text-3xl font-bold text-amber-400">{summary?.supportTickets || 0}</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-400">Escalated Calls</p>
            <p className="mt-1 text-3xl font-bold text-red-400">{summary?.escalatedCalls || 0}</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-3">
          <button onClick={() => setShowSimulate(true)} className="btn-primary bg-cyan-600 hover:bg-cyan-700 flex items-center gap-2">
            <span>📞</span> Simulate Call
          </button>
          <button onClick={() => setShowAppointment(true)} className="btn-secondary flex items-center gap-2">
            <span>📅</span> New Appointment
          </button>
          <button onClick={() => setShowTicket(true)} className="btn-secondary flex items-center gap-2">
            <span>🎫</span> New Support Ticket
          </button>
          <button onClick={() => setShowSettings(true)} className="btn-secondary flex items-center gap-2">
            <span>⚙️</span> Settings
          </button>
        </div>

        {/* Recent Calls Table */}
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Recent Calls</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-700 bg-slate-800">
                <tr>
                  <th className="table-th">Caller</th>
                  <th className="table-th">Phone</th>
                  <th className="table-th">Type</th>
                  <th className="table-th">Status</th>
                  <th className="table-th">Summary</th>
                  <th className="table-th">Time</th>
                  <th className="table-th">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {calls.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                      No calls yet. Click "Simulate Call" to start.
                    </td>
                  </tr>
                ) : (
                  calls.map((call) => (
                    <tr key={call.id} className="hover:bg-slate-800/50">
                      <td className="table-td font-medium">{call.callerName}</td>
                      <td className="table-td">{call.callerPhone || '-'}</td>
                      <td className="table-td">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          call.callType === 'EMERGENCY' ? 'bg-red-900/50 text-red-300' :
                          call.callType === 'SUPPORT' ? 'bg-amber-900/50 text-amber-300' :
                          call.callType === 'DEMO' ? 'bg-blue-900/50 text-blue-300' :
                          'bg-slate-700 text-slate-300'
                        }`}>
                          {call.callType}
                        </span>
                      </td>
                      <td className="table-td">
                        <StatusBadge status={call.callStatus} />
                      </td>
                      <td className="table-td max-w-xs truncate">{call.summary || '-'}</td>
                      <td className="table-td text-xs">{new Date(call.callStartedAt).toLocaleString()}</td>
                      <td className="table-td">
                        <button onClick={() => handleViewCall(call.id)} className="text-sm text-cyan-400 hover:text-cyan-300">View</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {callTotalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-700 px-4 py-3">
              <button disabled={callPage <= 1} onClick={() => loadCalls(callPage - 1)} className="btn-secondary disabled:opacity-40">
                Previous
              </button>
              <span className="text-sm text-slate-400">Page {callPage} of {callTotalPages}</span>
              <button disabled={callPage >= callTotalPages} onClick={() => loadCalls(callPage + 1)} className="btn-secondary disabled:opacity-40">
                Next
              </button>
            </div>
          )}
        </div>

        {/* Appointments & Tickets panels */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="card">
            <h2 className="mb-4 text-lg font-semibold text-white">Upcoming Appointments</h2>
            {appointments.length === 0 ? (
              <p className="text-sm text-slate-500">No upcoming appointments.</p>
            ) : (
              <div className="space-y-3">
                {appointments.map((apt) => (
                  <div key={apt.id} className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 p-3">
                    <div>
                      <p className="text-sm font-medium text-white">{apt.callerName}</p>
                      <p className="text-xs text-slate-400">{apt.meetingPurpose || apt.meetingTitle}</p>
                      <p className="text-xs text-slate-500">{new Date(apt.scheduledDate).toLocaleString()}</p>
                    </div>
                    <StatusBadge status={apt.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card">
            <h2 className="mb-4 text-lg font-semibold text-white">Open Support Tickets</h2>
            {tickets.length === 0 ? (
              <p className="text-sm text-slate-500">No open support tickets.</p>
            ) : (
              <div className="space-y-3">
                {tickets.map((ticket) => (
                  <div key={ticket.id} className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 p-3">
                    <div>
                      <p className="text-sm font-medium text-white">{ticket.issueTitle}</p>
                      <p className="text-xs text-slate-400">{ticket.callerName} {ticket.companyName ? `- ${ticket.companyName}` : ''}</p>
                      <p className="text-xs text-slate-500">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          ticket.urgency === 'CRITICAL' ? 'bg-red-900/50 text-red-300' :
                          ticket.urgency === 'HIGH' ? 'bg-orange-900/50 text-orange-300' :
                          ticket.urgency === 'MEDIUM' ? 'bg-amber-900/50 text-amber-300' :
                          'bg-slate-700 text-slate-300'
                        }`}>{ticket.urgency}</span>
                      </p>
                    </div>
                    <StatusBadge status={ticket.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        </div>
      )}

      {/* Modals */}
      {showSimulate && (
        <SimulateCallModal
          onClose={() => setShowSimulate(false)}
          onComplete={handleCallCreated}
          showToast={showToast}
        />
      )}
      {showAppointment && (
        <AppointmentModal
          onClose={() => setShowAppointment(false)}
          onCreated={handleAppointmentCreated}
          showToast={showToast}
        />
      )}
      {showTicket && (
        <SupportTicketModal
          onClose={() => setShowTicket(false)}
          onCreated={handleTicketCreated}
          showToast={showToast}
        />
      )}
      {showSettings && (
        <ReceptionistSettingsModal
          onClose={() => setShowSettings(false)}
          showToast={showToast}
        />
      )}
      {showCallDetail && selectedCall && (
        <CallDetailModal
          call={selectedCall}
          onClose={() => { setShowCallDetail(false); setSelectedCall(null); }}
          onRefresh={fetchData}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 rounded-lg px-4 py-3 text-sm shadow-lg ${
          toast.type === 'error' ? 'bg-red-700 text-white' : 'bg-green-700 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = {
    NEW: 'bg-blue-900/50 text-blue-300',
    IN_PROGRESS: 'bg-amber-900/50 text-amber-300',
    COMPLETED: 'bg-green-900/50 text-green-300',
    ESCALATED: 'bg-red-900/50 text-red-300',
    FAILED: 'bg-slate-700 text-slate-400',
    SCHEDULED: 'bg-blue-900/50 text-blue-300',
    CONFIRMED: 'bg-green-900/50 text-green-300',
    CANCELLED: 'bg-slate-700 text-slate-400',
    NO_SHOW: 'bg-red-900/50 text-red-300',
    OPEN: 'bg-blue-900/50 text-blue-300',
    RESOLVED: 'bg-green-900/50 text-green-300',
    CLOSED: 'bg-slate-700 text-slate-400',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || 'bg-slate-700 text-slate-300'}`}>
      {status}
    </span>
  );
}
