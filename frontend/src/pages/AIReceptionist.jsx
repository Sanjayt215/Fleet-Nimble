import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import AIPhoneConsole from './AIPhoneConsole';
import AppointmentModal from './AppointmentModal';
import SupportTicketModal from './SupportTicketModal';
import ReceptionistSettingsModal from './ReceptionistSettingsModal';
import AnalyticsCards from './AnalyticsCards';
import LiveCallsPanel from './LiveCallsPanel';
import CallDetailModal from './CallDetailModal';

const TABS = [
  { id: 'voice', label: 'Voice Agent' },
  { id: 'admin-tools', label: 'Admin Tools' },
];

const ADMIN_SUBTABS = [
  { id: 'calls', label: 'Call Logs' },
  { id: 'appointments', label: 'Appointments' },
  { id: 'support', label: 'Support Tickets' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'live', label: 'Live Calls' },
  { id: 'settings', label: 'Settings' },
];

export default function AIReceptionist() {
  const [activeTab, setActiveTab] = useState('voice');
  const [activeAdminTab, setActiveAdminTab] = useState('calls');
  const [summary, setSummary] = useState(null);
  const [calls, setCalls] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [callPage, setCallPage] = useState(1);
  const [callTotalPages, setCallTotalPages] = useState(1);
  const [apptPage, setApptPage] = useState(1);
  const [apptTotalPages, setApptTotalPages] = useState(1);
  const [ticketPage, setTicketPage] = useState(1);
  const [ticketTotalPages, setTicketTotalPages] = useState(1);

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
      const [summaryRes, callsRes, apptsRes, ticketsRes] = await Promise.allSettled([
        api.get('/ai-receptionist/summary'),
        api.get('/ai-receptionist/calls?page=1&limit=10'),
        api.get('/ai-receptionist/appointments?limit=5'),
        api.get('/ai-receptionist/support-tickets?limit=5'),
      ]);
      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value.data.data);
      if (callsRes.status === 'fulfilled') {
        setCalls(callsRes.value.data.data.calls || []);
        setCallTotalPages(callsRes.value.data.data.totalPages || 1);
      }
      if (apptsRes.status === 'fulfilled') setAppointments(apptsRes.value.data.data.appointments || []);
      if (ticketsRes.status === 'fulfilled') setTickets(ticketsRes.value.data.data.tickets || []);
    } catch (err) {
      console.error('Error fetching receptionist data:', err);
      setError('Failed to load data.');
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

  const loadAppointments = useCallback(async (page) => {
    try {
      const res = await api.get(`/ai-receptionist/appointments?page=${page}&limit=10`);
      setAppointments(res.data.data.appointments || []);
      setApptTotalPages(res.data.data.totalPages || 1);
      setApptPage(page);
    } catch (err) {
      console.error('Error loading appointments:', err);
    }
  }, []);

  const loadTickets = useCallback(async (page) => {
    try {
      const res = await api.get(`/ai-receptionist/support-tickets?page=${page}&limit=10`);
      setTickets(res.data.data.tickets || []);
      setTicketTotalPages(res.data.data.totalPages || 1);
      setTicketPage(page);
    } catch (err) {
      console.error('Error loading tickets:', err);
    }
  }, []);

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
    } catch {
      showToast('Failed to load call details', 'error');
    }
  };

  const StatusBadge = ({ status }) => {
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
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">AI Receptionist</h1>
        <p className="mt-1 text-sm text-slate-400">
          Voice-first receptionist that speaks with customers, answers FleetNimble questions, collects details, and schedules appointments automatically.
        </p>
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

      {/* Voice Agent Tab - Phone Console */}
      {activeTab === 'voice' && (
        <AIPhoneConsole showToast={showToast} />
      )}

      {/* Admin Tools Tab */}
      {activeTab === 'admin-tools' && (
        <div className="space-y-4">
          {/* Admin Subtabs */}
          <div className="flex flex-wrap gap-2 border-b border-slate-700 pb-2">
            {ADMIN_SUBTABS.map((sub) => (
              <button
                key={sub.id}
                onClick={() => setActiveAdminTab(sub.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeAdminTab === sub.id
                    ? 'bg-cyan-900/30 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800'
                }`}
              >
                {sub.label}
              </button>
            ))}
          </div>

          {/* Summary Cards */}
          {activeAdminTab !== 'live' && activeAdminTab !== 'analytics' && activeAdminTab !== 'settings' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="card">
                <p className="text-xs text-slate-400">Total Calls</p>
                <p className="mt-1 text-2xl font-bold text-cyan-400">{summary?.totalCalls || 0}</p>
              </div>
              <div className="card">
                <p className="text-xs text-slate-400">Scheduled Meetings</p>
                <p className="mt-1 text-2xl font-bold text-blue-400">{summary?.scheduledMeetings || 0}</p>
              </div>
              <div className="card">
                <p className="text-xs text-slate-400">Support Tickets</p>
                <p className="mt-1 text-2xl font-bold text-amber-400">{summary?.supportTickets || 0}</p>
              </div>
              <div className="card">
                <p className="text-xs text-slate-400">Escalated Calls</p>
                <p className="mt-1 text-2xl font-bold text-red-400">{summary?.escalatedCalls || 0}</p>
              </div>
            </div>
          )}

          {/* Manual Entry Buttons */}
          {activeAdminTab !== 'live' && activeAdminTab !== 'analytics' && activeAdminTab !== 'settings' && (
            <div className="flex flex-wrap gap-3 border-b border-slate-700 pb-4">
              <span className="text-xs font-medium text-slate-500 self-center uppercase tracking-wider">Manual Entry:</span>
              <button onClick={() => setShowAppointment(true)} className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors">
                + Manual Appointment Entry
              </button>
              <button onClick={() => setShowTicket(true)} className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors">
                + Manual Support Ticket Entry
              </button>
              <button onClick={() => setShowSettings(true)} className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors">
                Settings
              </button>
            </div>
          )}

          {/* Admin Panels */}
          {activeAdminTab === 'calls' && (
            <div className="card">
              <h2 className="mb-4 text-lg font-semibold text-white">Call Logs</h2>
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
                        <td colSpan={7} className="px-4 py-12 text-center text-slate-500">No calls recorded yet.</td>
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
                            }`}>{call.callType}</span>
                          </td>
                          <td className="table-td"><StatusBadge status={call.callStatus} /></td>
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
                  <button disabled={callPage <= 1} onClick={() => loadCalls(callPage - 1)} className="btn-secondary disabled:opacity-40">Previous</button>
                  <span className="text-sm text-slate-400">Page {callPage} of {callTotalPages}</span>
                  <button disabled={callPage >= callTotalPages} onClick={() => loadCalls(callPage + 1)} className="btn-secondary disabled:opacity-40">Next</button>
                </div>
              )}
            </div>
          )}

          {activeAdminTab === 'appointments' && (
            <div className="card">
              <h2 className="mb-4 text-lg font-semibold text-white">Appointments</h2>
              {appointments.length === 0 ? (
                <p className="text-sm text-slate-500">No appointments yet.</p>
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
              {apptTotalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-700 px-4 py-3 mt-4">
                  <button disabled={apptPage <= 1} onClick={() => loadAppointments(apptPage - 1)} className="btn-secondary disabled:opacity-40">Previous</button>
                  <span className="text-sm text-slate-400">Page {apptPage} of {apptTotalPages}</span>
                  <button disabled={apptPage >= apptTotalPages} onClick={() => loadAppointments(apptPage + 1)} className="btn-secondary disabled:opacity-40">Next</button>
                </div>
              )}
            </div>
          )}

          {activeAdminTab === 'support' && (
            <div className="card">
              <h2 className="mb-4 text-lg font-semibold text-white">Support Tickets</h2>
              {tickets.length === 0 ? (
                <p className="text-sm text-slate-500">No support tickets yet.</p>
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
              {ticketTotalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-700 px-4 py-3 mt-4">
                  <button disabled={ticketPage <= 1} onClick={() => loadTickets(ticketPage - 1)} className="btn-secondary disabled:opacity-40">Previous</button>
                  <span className="text-sm text-slate-400">Page {ticketPage} of {ticketTotalPages}</span>
                  <button disabled={ticketPage >= ticketTotalPages} onClick={() => loadTickets(ticketPage + 1)} className="btn-secondary disabled:opacity-40">Next</button>
                </div>
              )}
            </div>
          )}

          {activeAdminTab === 'analytics' && <AnalyticsCards />}
          {activeAdminTab === 'live' && <LiveCallsPanel showToast={showToast} />}
          {activeAdminTab === 'settings' && <ReceptionistSettingsModal onClose={() => {}} showToast={showToast} embedded />}
        </div>
      )}

      {/* Modals */}
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
