import { useState, useRef, useEffect } from 'react';
import api from '../services/api';

export default function SimulateCallModal({ onClose, onComplete, showToast }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [session, setSession] = useState({ callId: null, completed: false });
  const [loading, setLoading] = useState(false);
  const [callerDetails, setCallerDetails] = useState(null);
  const [createdAppointment, setCreatedAppointment] = useState(null);
  const [createdTicket, setCreatedTicket] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setLoading(true);

    try {
      const res = await api.post('/ai-receptionist/simulate-call', {
        message: msg,
        callId: session.callId,
      });

      const data = res.data.data;
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);

      if (data.callId) {
        setSession((s) => ({ ...s, callId: data.callId }));
      }

      if (data.extracted && Object.values(data.extracted).some((v) => v)) {
        setCallerDetails(data.extracted);
      }

      if (data.createdAppointment) {
        setCreatedAppointment(data.createdAppointment);
        setSession((s) => ({ ...s, completed: true }));
        showToast('Appointment created successfully!');
        setTimeout(() => { onComplete(); }, 2000);
      }

      if (data.createdTicket) {
        setCreatedTicket(data.createdTicket);
        setSession((s) => ({ ...s, completed: true }));
        showToast('Support ticket created successfully!');
        setTimeout(() => { onComplete(); }, 2000);
      }

      if (data.escalate) {
        setSession((s) => ({ ...s, completed: true }));
        showToast('Call escalated to team!');
        setTimeout(() => { onComplete(); }, 2000);
      }
    } catch (err) {
      console.error('Simulate call error:', err);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'I apologize, but I encountered an error. Please try again.',
      }]);
      showToast('Failed to process call', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const newCall = () => {
    setSession({ callId: null, completed: false });
    setMessages([]);
    setCallerDetails(null);
    setCreatedAppointment(null);
    setCreatedTicket(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="mx-4 w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Simulate Call</h2>
            <p className="text-xs text-slate-400">Interact with AI Receptionist to test call flow</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">&times;</button>
        </div>

        {/* Messages */}
        <div className="h-80 overflow-y-auto space-y-4 px-6 py-4">
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <p className="text-center text-sm text-slate-500">
                👋 Start the conversation. Say something like:<br />
                "Hi, I want to book a demo for my logistics company next Monday"
              </p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-700 text-slate-100'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-slate-700 px-4 py-3 text-white">
                <div className="flex space-x-2">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400"></div>
                  <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400 delay-100"></div>
                  <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400 delay-200"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Extracted Details */}
        {callerDetails && (
          <div className="mx-6 mb-2 rounded-lg border border-slate-700 bg-slate-800/50 p-3">
            <p className="mb-1 text-xs font-semibold text-slate-400">Extracted Details</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300">
              {callerDetails.callerName && <span>Name: {callerDetails.callerName}</span>}
              {callerDetails.phone && <span>Phone: {callerDetails.phone}</span>}
              {callerDetails.email && <span>Email: {callerDetails.email}</span>}
              {callerDetails.company && <span>Company: {callerDetails.company}</span>}
              {callerDetails.fleetSize && <span>Fleet: {callerDetails.fleetSize} vehicles</span>}
              {callerDetails.preferredDate && <span>Date: {callerDetails.preferredDate}</span>}
              {callerDetails.preferredTime && <span>Time: {callerDetails.preferredTime}</span>}
            </div>
          </div>
        )}

        {/* Created Items */}
        {createdAppointment && (
          <div className="mx-6 mb-2 rounded-lg border border-green-700 bg-green-900/20 p-3">
            <p className="text-sm font-medium text-green-300">✓ Appointment Created</p>
            <p className="text-xs text-green-400">{createdAppointment.meetingTitle} on {new Date(createdAppointment.scheduledDate).toLocaleString()}</p>
          </div>
        )}
        {createdTicket && (
          <div className="mx-6 mb-2 rounded-lg border border-amber-700 bg-amber-900/20 p-3">
            <p className="text-sm font-medium text-amber-300">✓ Support Ticket Created</p>
            <p className="text-xs text-amber-400">{createdTicket.issueTitle} ({createdTicket.urgency})</p>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-slate-700 px-6 py-4">
          {session.completed ? (
            <div className="flex gap-3">
              <button onClick={newCall} className="btn-primary flex-1 bg-cyan-600 hover:bg-cyan-700">
                Start New Call
              </button>
              <button onClick={onClose} className="btn-secondary">
                Close
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Type your message..."
                disabled={loading}
                className="input flex-1"
              />
              <button onClick={sendMessage} disabled={loading || !input.trim()}
                className="btn-primary bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50">
                {loading ? '...' : 'Send'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
