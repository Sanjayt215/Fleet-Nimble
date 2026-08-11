import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import AIPhoneConsole from './AIPhoneConsole';
import AppointmentModal from './AppointmentModal';
import SupportTicketModal from './SupportTicketModal';
import ReceptionistSettingsModal from './ReceptionistSettingsModal';
import AnalyticsCards from './AnalyticsCards';
import LiveCallsPanel from './LiveCallsPanel';
import ConversationIntelligencePanel from './ConversationIntelligencePanel';
import CallDetailModal from './CallDetailModal';
import AgentConfiguration from './AgentConfiguration';
import { normalizeDisplayText } from '../utils/normalizeDisplayText';

const TABS = [
  { id: 'customer', label: 'AI Receptionist' },
  { id: 'admin-tools', label: 'Admin Tools' },
];

const ADMIN_SUBTABS = [
  { id: 'calls', label: 'Call Logs' },
  { id: 'conversations', label: 'Conversations' },
  { id: 'appointments', label: 'Appointments' },
  { id: 'support', label: 'Support Tickets' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'live', label: 'Live Calls' },
  { id: 'settings', label: 'Settings' },
  { id: 'agent', label: 'Agent Config' },
];

export default function AIReceptionist() {
  const { isAuthLoading, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState('customer');
  const [activeAdminTab, setActiveAdminTab] = useState('calls');
  const [summary, setSummary] = useState(null);
  const [calls, setCalls] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [twilioPhone, setTwilioPhone] = useState(null);
  const [channelStatus, setChannelStatus] = useState(null);

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
    if (isAuthLoading) return;
    try {
      setLoading(true);
      setError(null);
      const [statusRes, summaryRes, callsRes, apptsRes, ticketsRes, channelRes] = await Promise.allSettled([
        api.get('/ai-receptionist/health'),
        api.get('/ai-receptionist/summary'),
        api.get('/ai-receptionist/calls?page=1&limit=10'),
        api.get('/ai-receptionist/appointments?limit=5'),
        api.get('/ai-receptionist/support-tickets?limit=5'),
        api.get('/ai-receptionist/status'),
      ]);
      if (statusRes.status === 'fulfilled') {
        const d = statusRes.value.data;
        setTwilioPhone(channelRes.status === 'fulfilled' ? (channelRes.value.data?.data?.phoneNumber || null) : null);
        setChannelStatus({
          phoneConfigured: d.phoneConfigured,
          mediaStreamEnabled: d.mediaStreamEnabled,
          businessToolsEnabled: d.businessToolsEnabled,
          realtimeConfigured: d.realtimeConfigured,
          voiceAgentMode: d.voiceAgentMode,
        });
      }
      if (summaryRes.status === 'fulfilled') {
        setSummary(summaryRes.value.data.data || null);
      }
      if (callsRes.status === 'fulfilled') {
        const cd = callsRes.value.data.data || {};
        setCalls(cd.calls || []);
        setCallTotalPages(cd.totalPages || 1);
      }
      if (apptsRes.status === 'fulfilled') {
        const ad = apptsRes.value.data.data || {};
        setAppointments(ad.appointments || []);
      }
      if (ticketsRes.status === 'fulfilled') {
        const td = ticketsRes.value.data.data || {};
        setTickets(td.tickets || []);
      }
    } catch (err) {
      console.error('Error fetching receptionist data:', err);
      setError('Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, [isAuthLoading]);

  useEffect(() => { if (!isAuthLoading && isAuthenticated) fetchData(); }, [fetchData, isAuthLoading, isAuthenticated]);

  useSocket({
    'appointment.created': useCallback(() => {
      fetchData();
      showToast('New appointment created by AI Receptionist');
    }, [fetchData, showToast]),
    'support.ticket.created': useCallback(() => {
      fetchData();
      showToast('New support ticket created by AI Receptionist');
    }, [fetchData, showToast]),
    'call.created': useCallback(() => {
      fetchData();
    }, [fetchData]),
    'call.completed': useCallback(() => {
      fetchData();
    }, [fetchData]),
    'crm.customer.created': useCallback(() => {
      fetchData();
      showToast('New customer added to CRM');
    }, [fetchData, showToast]),
    'crm.customer.updated': useCallback(() => {
      fetchData();
    }, [fetchData]),
    'crm.updated': useCallback(() => {
      fetchData();
    }, [fetchData]),
    'dashboard.refresh': useCallback(() => {
      fetchData();
    }, [fetchData]),
    'analytics.refresh': useCallback(() => {
      fetchData();
    }, [fetchData]),
    'contact.updated': useCallback(() => {
      fetchData();
    }, [fetchData]),
  });

  const loadCalls = useCallback(async (page) => {
    try {
      const res = await api.get(`/ai-receptionist/calls?page=${page}&limit=10`);
      const d = res.data.data || {};
      setCalls(d.calls || []);
      setCallTotalPages(d.totalPages || 1);
      setCallPage(page);
    } catch (err) {
      console.error('Error loading calls:', err);
    }
  }, []);

  const loadAppointments = useCallback(async (page) => {
    try {
      const res = await api.get(`/ai-receptionist/appointments?page=${page}&limit=10`);
      const d = res.data.data || {};
      setAppointments(d.appointments || []);
      setApptTotalPages(d.totalPages || 1);
      setApptPage(page);
    } catch (err) {
      console.error('Error loading appointments:', err);
    }
  }, []);

  const loadTickets = useCallback(async (page) => {
    try {
      const res = await api.get(`/ai-receptionist/support-tickets?page=${page}&limit=10`);
      const d = res.data.data || {};
      setTickets(d.tickets || []);
      setTicketTotalPages(d.totalPages || 1);
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

  const copyNumber = () => {
    if (twilioPhone) {
      navigator.clipboard.writeText(twilioPhone);
      showToast('Phone number copied!');
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 rounded-lg px-4 py-3 text-sm shadow-lg ${
          toast.type === 'error' ? 'bg-red-700 text-white' : 'bg-green-700 text-white'
        }`}>
          {normalizeDisplayText(toast.message)}
        </div>
      )}

      {/* Tabs */}
      {isAuthenticated && (
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
      )}

      {/* ─── CUSTOMER TAB: Phone-First Experience ─── */}
      {activeTab === 'customer' && (
        <div className="space-y-8">
          {/* Hero Section */}
          <div className="text-center py-8">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-green-500/20 to-emerald-600/20">
              <svg className="h-10 w-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white mb-3">FleetNimble AI Receptionist</h1>
            <p className="text-lg text-slate-400 max-w-xl mx-auto mb-8">
              Speak directly with our AI customer-service agent. Call our dedicated phone number to book demos, get support, or ask questions about FleetNimble.
            </p>

            {/* Twilio Phone Number Display */}
            {twilioPhone ? (
              <div className="inline-flex flex-col items-center gap-4">
                <a
                  href={`tel:${twilioPhone}`}
                  className="inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-600 px-8 py-4 text-xl font-bold text-white shadow-xl shadow-green-500/30 hover:from-green-500 hover:to-emerald-500 transition-all hover:scale-105"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                  {twilioPhone}
                </a>
                <div className="flex items-center gap-3">
                  <button
                    onClick={copyNumber}
                    className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
                  >
                    Copy Phone Number
                  </button>
                  <span className="text-xs text-slate-600">Call opens in your phone app</span>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-6 max-w-md mx-auto">
                <p className="text-sm text-slate-400">Phone number not configured</p>
                <p className="text-xs text-slate-500 mt-1">Contact your administrator to set up the Twilio phone number.</p>
              </div>
            )}
          </div>

          {/* Browser Voice Test — secondary, labeled clearly */}
          <div className="max-w-3xl mx-auto w-full">
            <details className="rounded-lg border border-slate-700 bg-slate-900/50">
              <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm text-slate-400 hover:text-slate-300">
                <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                </svg>
                Browser Voice Test — for testing and desktop fallback
              </summary>
              <div className="border-t border-slate-700 p-4">
                <AIPhoneConsole showToast={showToast} />
              </div>
            </details>
          </div>
        </div>
      )}

      {/* ─── ADMIN TOOLS TAB ─── */}
      {activeTab === 'admin-tools' && isAuthenticated && (
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

          {error && (
            <div className="rounded-lg border border-red-700 bg-red-900/30 p-4 text-sm text-red-300">
              {error}
              <button onClick={fetchData} className="ml-3 underline hover:text-red-200">Retry</button>
            </div>
          )}

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

          {/* Call Logs */}
          {activeAdminTab === 'calls' && (
            <div className="card">
              <h2 className="mb-4 text-lg font-semibold text-white">Call Logs</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-slate-700 bg-slate-800">
                    <tr>
                      <th className="table-th">Name</th>
                      <th className="table-th">Company</th>
                      <th className="table-th">Industry</th>
                      <th className="table-th">Phone</th>
                      <th className="table-th">Email</th>
                      <th className="table-th">Duration</th>
                      <th className="table-th">Summary</th>
                      <th className="table-th">Lead Score</th>
                      <th className="table-th">Sentiment</th>
                      <th className="table-th">Appointment</th>
                      <th className="table-th">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {calls.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-12 text-center text-slate-500">No calls recorded yet.</td>
                      </tr>
                    ) : (
                      calls.map((call) => (
                        <tr key={call.id} className="hover:bg-slate-800/50">
                          <td className="table-td font-medium">{call.callerName || '-'}</td>
                          <td className="table-td">{call.companyName || '-'}</td>
                          <td className="table-td">{call.extractedData?.industry || call.customer?.industry || '-'}</td>
                          <td className="table-td">{call.callerPhone || '-'}</td>
                          <td className="table-td">{call.callerEmail || '-'}</td>
                          <td className="table-td text-xs">
                            {call.durationSeconds
                              ? `${Math.floor(call.durationSeconds / 60)}m ${call.durationSeconds % 60}s`
                              : (call.callStatus === 'IN_PROGRESS' ? 'Live' : '-')}
                          </td>
                          <td className="table-td max-w-xs truncate">{call.summary || '-'}</td>
                          <td className="table-td">
                            {call.customer?.leadScore != null
                              ? <span className="text-amber-400 font-medium">{call.customer.leadScore}</span>
                              : '-'}
                          </td>
                          <td className="table-td">
                            <span className={`text-xs capitalize ${
                              call.sentiment === 'positive' ? 'text-green-400' :
                              call.sentiment === 'negative' ? 'text-red-400' :
                              'text-slate-500'
                            }`}>{call.sentiment || 'neutral'}</span>
                          </td>
                          <td className="table-td">
                            {call.appointment
                              ? <span className="inline-flex rounded-full bg-blue-900/30 px-2 py-0.5 text-xs text-blue-300">{call.appointment.status}</span>
                              : '-'}
                          </td>
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

          {/* Appointments */}
          {activeAdminTab === 'appointments' && (
            <div className="card">
              <h2 className="mb-4 text-lg font-semibold text-white">Appointments</h2>
              {appointments.length === 0 ? (
                <p className="text-sm text-slate-500">No appointments yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-slate-700 bg-slate-800">
                      <tr>
                        <th className="table-th">Customer</th>
                        <th className="table-th">Company</th>
                        <th className="table-th">Industry</th>
                        <th className="table-th">Email</th>
                        <th className="table-th">Phone</th>
                        <th className="table-th">Meeting Time</th>
                        <th className="table-th">Status</th>
                        <th className="table-th">Salesperson</th>
                        <th className="table-th">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {appointments.map((apt) => (
                        <tr key={apt.id} className="hover:bg-slate-800/50">
                          <td className="table-td font-medium">{apt.callerName || '-'}</td>
                          <td className="table-td">{apt.companyName || '-'}</td>
                          <td className="table-td">{apt.industry || '-'}</td>
                          <td className="table-td">{apt.callerEmail || '-'}</td>
                          <td className="table-td">{apt.callerPhone || '-'}</td>
                          <td className="table-td text-xs">{apt.scheduledDate ? new Date(apt.scheduledDate).toLocaleString() : '-'}</td>
                          <td className="table-td"><StatusBadge status={apt.status} /></td>
                          <td className="table-td">{apt.assignedTo || 'Unassigned'}</td>
                          <td className="table-td">
                            <span className="inline-flex rounded-full bg-cyan-900/30 px-2 py-0.5 text-xs font-medium text-cyan-300">
                              AI Receptionist
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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

          {/* Support Tickets */}
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
          {activeAdminTab === 'conversations' && <ConversationIntelligencePanel showToast={showToast} />}
          {activeAdminTab === 'live' && <LiveCallsPanel showToast={showToast} />}
          {activeAdminTab === 'settings' && <ReceptionistSettingsModal onClose={() => {}} showToast={showToast} embedded />}
          {activeAdminTab === 'agent' && <AgentConfiguration showToast={showToast} />}
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
    </div>
  );
}
