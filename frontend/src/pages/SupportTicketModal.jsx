import { useState } from 'react';
import api from '../services/api';

export default function SupportTicketModal({ onClose, onCreated, showToast }) {
  const [form, setForm] = useState({
    callerName: '',
    callerPhone: '',
    callerEmail: '',
    companyName: '',
    issueTitle: '',
    issueDescription: '',
    urgency: 'MEDIUM',
    relatedVehicleId: '',
  });
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.callerName || !form.issueTitle) {
      showToast('Caller name and issue title are required', 'error');
      return;
    }

    try {
      setSaving(true);
      await api.post('/ai-receptionist/support-tickets', {
        ...form,
        relatedVehicleId: form.relatedVehicleId || null,
      });
      onCreated();
    } catch (err) {
      console.error('Error creating support ticket:', err);
      showToast('Failed to create support ticket', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="mx-4 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">New Support Ticket</h2>
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
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Issue Title *</label>
            <input name="issueTitle" value={form.issueTitle} onChange={handleChange} className="input" required />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Issue Description</label>
            <textarea name="issueDescription" value={form.issueDescription} onChange={handleChange} className="input" rows={3} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Urgency</label>
            <select name="urgency" value={form.urgency} onChange={handleChange} className="input">
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Related Vehicle ID (optional)</label>
            <input name="relatedVehicleId" value={form.relatedVehicleId} onChange={handleChange} className="input" placeholder="Vehicle UUID" />
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-700 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary bg-amber-600 hover:bg-amber-700">
              {saving ? 'Creating...' : 'Create Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
