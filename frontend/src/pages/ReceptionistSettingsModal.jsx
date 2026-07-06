import { useState, useEffect } from 'react';
import api from '../services/api';

export default function ReceptionistSettingsModal({ onClose, showToast }) {
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({
    businessName: '',
    greetingMessage: '',
    timezone: 'UTC',
    escalationPhone: '',
    escalationEmail: '',
    salesHandoffNumber: '',
    supportHandoffNumber: '',
    emergencyHandoffNumber: '',
    afterHoursBehavior: 'voicemail',
    appointmentDuration: 30,
    enabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const res = await api.get('/ai-receptionist/config');
      const data = res.data.data;
      setConfig(data);
      setForm({
        businessName: data.businessName || '',
        greetingMessage: data.greetingMessage || '',
        timezone: data.timezone || 'UTC',
        escalationPhone: data.escalationPhone || '',
        escalationEmail: data.escalationEmail || '',
        salesHandoffNumber: data.salesHandoffNumber || '',
        supportHandoffNumber: data.supportHandoffNumber || '',
        emergencyHandoffNumber: data.emergencyHandoffNumber || '',
        afterHoursBehavior: data.afterHoursBehavior || 'voicemail',
        appointmentDuration: data.appointmentDuration || 30,
        enabled: data.enabled !== false,
      });
    } catch (err) {
      console.error('Error loading config:', err);
      showToast('Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [e.target.name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      await api.patch('/ai-receptionist/config', {
        ...form,
        appointmentDuration: parseInt(form.appointmentDuration, 10),
      });
      showToast('Settings saved successfully');
      loadConfig();
    } catch (err) {
      console.error('Error saving config:', err);
      showToast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="mx-4 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Receptionist Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">&times;</button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 px-6 py-4">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Business Name</label>
              <input name="businessName" value={form.businessName} onChange={handleChange} className="input" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Greeting Message</label>
              <textarea name="greetingMessage" value={form.greetingMessage} onChange={handleChange} className="input" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Timezone</label>
                <input name="timezone" value={form.timezone} onChange={handleChange} className="input" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Appt Duration (min)</label>
                <input name="appointmentDuration" type="number" min="5" max="480" value={form.appointmentDuration} onChange={handleChange} className="input" />
              </div>
            </div>
            <div className="border-t border-slate-700 pt-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">Human Handoff Numbers</p>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Sales Handoff Number</label>
                  <input name="salesHandoffNumber" value={form.salesHandoffNumber} onChange={handleChange} className="input" placeholder="+1234567890" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Support Handoff Number</label>
                  <input name="supportHandoffNumber" value={form.supportHandoffNumber} onChange={handleChange} className="input" placeholder="+1234567890" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Emergency Handoff Number</label>
                  <input name="emergencyHandoffNumber" value={form.emergencyHandoffNumber} onChange={handleChange} className="input" placeholder="+1234567890" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Escalation Phone (fallback)</label>
                  <input name="escalationPhone" value={form.escalationPhone} onChange={handleChange} className="input" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Escalation Email</label>
                  <input name="escalationEmail" type="email" value={form.escalationEmail} onChange={handleChange} className="input" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input name="enabled" type="checkbox" checked={form.enabled} onChange={handleChange} className="h-4 w-4 rounded border-slate-600" />
              <label className="text-sm text-slate-300">Receptionist Enabled</label>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-700 pt-4">
              <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary bg-cyan-600 hover:bg-cyan-700">
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
