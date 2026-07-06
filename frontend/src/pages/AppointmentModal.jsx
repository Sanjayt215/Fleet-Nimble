import { useState } from 'react';
import api from '../services/api';

export default function AppointmentModal({ onClose, onCreated, showToast }) {
  const [form, setForm] = useState({
    callerName: '',
    callerPhone: '',
    callerEmail: '',
    companyName: '',
    fleetSize: '',
    meetingTitle: 'Scheduled Meeting',
    meetingPurpose: '',
    scheduledDate: '',
    durationMinutes: 30,
    notes: '',
    assignedTo: '',
  });
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.callerName || !form.scheduledDate) {
      showToast('Caller name and scheduled date are required', 'error');
      return;
    }

    try {
      setSaving(true);
      await api.post('/ai-receptionist/appointments', {
        ...form,
        fleetSize: form.fleetSize ? parseInt(form.fleetSize, 10) : null,
        durationMinutes: parseInt(form.durationMinutes, 10),
      });
      onCreated();
    } catch (err) {
      console.error('Error creating appointment:', err);
      showToast('Failed to create appointment', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="mx-4 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">New Appointment</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Caller Name *</label>
              <input name="callerName" value={form.callerName} onChange={handleChange} className="input" required />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Phone</label>
              <input name="callerPhone" value={form.callerPhone} onChange={handleChange} className="input" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Email</label>
              <input name="callerEmail" type="email" value={form.callerEmail} onChange={handleChange} className="input" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Company</label>
              <input name="companyName" value={form.companyName} onChange={handleChange} className="input" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Fleet Size</label>
              <input name="fleetSize" type="number" min="0" value={form.fleetSize} onChange={handleChange} className="input" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Duration (min)</label>
              <input name="durationMinutes" type="number" min="5" max="480" value={form.durationMinutes} onChange={handleChange} className="input" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Meeting Title</label>
            <input name="meetingTitle" value={form.meetingTitle} onChange={handleChange} className="input" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Meeting Purpose</label>
            <textarea name="meetingPurpose" value={form.meetingPurpose} onChange={handleChange} className="input" rows={2} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Scheduled Date & Time *</label>
            <input name="scheduledDate" type="datetime-local" value={form.scheduledDate} onChange={handleChange} className="input" required />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Notes</label>
            <textarea name="notes" value={form.notes} onChange={handleChange} className="input" rows={2} />
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-700 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary bg-cyan-600 hover:bg-cyan-700">
              {saving ? 'Creating...' : 'Create Appointment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
