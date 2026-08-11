import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const VOICE_OPTIONS = [
  { id: 'Puck', label: 'Puck (Female)' },
  { id: 'Charon', label: 'Charon' },
  { id: 'Kore', label: 'Kore (Female)' },
  { id: 'Fenrir', label: 'Fenrir' },
  { id: 'Aoede', label: 'Aoede (Female)' },
  { id: 'alloy', label: 'Alloy' },
  { id: 'nova', label: 'Nova (Female)' },
  { id: 'shimmer', label: 'Shimmer (Female)' },
  { id: 'echo', label: 'Echo' },
  { id: 'onyx', label: 'Onyx' },
  { id: 'fable', label: 'Fable' },
];

const TONE_OPTIONS = ['professional', 'friendly', 'warm', 'casual', 'formal'];

function Section({ title, subtitle, children }) {
  return (
    <div className="card space-y-4">
      <div>
        <h3 className="text-base font-semibold text-white">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-400">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

export default function AgentConfiguration({ showToast }) {
  const [activeSection, setActiveSection] = useState('agent');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agentConfig, setAgentConfig] = useState(null);
  const [profile, setProfile] = useState(null);
  const [documents, setDocuments] = useState({ items: [], total: 0 });
  const [testResult, setTestResult] = useState(null);
  const [testMessage, setTestMessage] = useState('');
  const [testing, setTesting] = useState(false);

  const [form, setForm] = useState({
    agentName: 'FleetNimble AI Receptionist',
    voiceId: 'Puck',
    language: 'en',
    tone: 'professional',
    personality: 'Warm, professional, concise and helpful',
    greetingMessage: '',
    businessContext: '',
    primaryGoal: 'Answer caller questions accurately and book qualified demos',
    secondaryGoals: [],
    qualificationQuestions: [],
    bookingRules: {},
    transferRules: {},
    workingHours: {},
    phoneNumber: '',
    enabled: true,
  });

  const [profileForm, setProfileForm] = useState({
    businessName: '',
    website: '',
    industry: '',
    description: '',
    products: [],
    services: [],
    pricing: {},
    businessHours: {},
    locations: [],
    contact: {},
    policies: {},
    faqs: [],
    bookingRules: {},
  });

  const [docForm, setDocForm] = useState({ title: '', category: 'General', content: '', status: 'DRAFT' });

  const handleChange = (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [e.target.name]: value }));
  };

  const handleProfileChange = (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setProfileForm((f) => ({ ...f, [e.target.name]: value }));
  };

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [agentRes, profileRes, docsRes] = await Promise.allSettled([
        api.get('/ai-receptionist/agent/config'),
        api.get('/ai-receptionist/business/profile'),
        api.get('/ai-receptionist/knowledge/documents?limit=50'),
      ]);

      if (agentRes.status === 'fulfilled') {
        const data = agentRes.value.data.data;
        setAgentConfig(data);
        setForm({
          agentName: data.agentName || 'FleetNimble AI Receptionist',
          voiceId: data.voiceId || 'Puck',
          language: data.language || 'en',
          tone: data.tone || 'professional',
          personality: data.personality || 'Warm, professional, concise and helpful',
          greetingMessage: data.greetingMessage || '',
          businessContext: data.businessContext || '',
          primaryGoal: data.primaryGoal || 'Answer caller questions accurately and book qualified demos',
          secondaryGoals: Array.isArray(data.secondaryGoals) ? data.secondaryGoals : [],
          qualificationQuestions: Array.isArray(data.qualificationQuestions) ? data.qualificationQuestions : [],
          bookingRules: data.bookingRules || {},
          transferRules: data.transferRules || {},
          workingHours: data.workingHours || {},
          phoneNumber: data.phoneNumber || '',
          enabled: data.enabled !== false,
        });
      }

      if (profileRes.status === 'fulfilled' && profileRes.value.data.data) {
        const p = profileRes.value.data.data;
        setProfile(p);
        setProfileForm({
          businessName: p.businessName || '',
          website: p.website || '',
          industry: p.industry || '',
          description: p.description || '',
          products: Array.isArray(p.products) ? p.products.map((x) => (typeof x === 'string' ? x : x?.name || '')).join('\n') : '',
          services: Array.isArray(p.services) ? p.services.map((x) => (typeof x === 'string' ? x : x?.name || '')).join('\n') : '',
          pricing: typeof p.pricing === 'object' ? JSON.stringify(p.pricing || {}, null, 2) : '',
          businessHours: typeof p.businessHours === 'object' ? JSON.stringify(p.businessHours || {}, null, 2) : '',
          locations: Array.isArray(p.locations) ? p.locations.map((x) => (typeof x === 'string' ? x : x?.city || '')).join('\n') : '',
          contact: typeof p.contact === 'object' ? JSON.stringify(p.contact || {}, null, 2) : '',
          policies: typeof p.policies === 'object' ? JSON.stringify(p.policies || {}, null, 2) : '',
          faqs: Array.isArray(p.faqs) ? p.faqs.map((x) => (typeof x === 'string' ? x : x?.question || '')).join('\n') : '',
          bookingRules: typeof p.bookingRules === 'object' ? JSON.stringify(p.bookingRules || {}, null, 2) : '',
        });
      }

      if (docsRes.status === 'fulfilled') {
        setDocuments(docsRes.value.data.data);
      }
    } catch (err) {
      console.error('Failed to load agent config', err);
      if (showToast) showToast('Failed to load configuration', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const saveAgentConfig = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const secondaryGoals = (form.secondaryGoals || []).filter(Boolean);
      const qualificationQuestions = (form.qualificationQuestions || []).filter(Boolean);
      const payload = {
        ...form,
        secondaryGoals,
        qualificationQuestions,
        bookingRules: parseJsonSafe(form.bookingRules),
        transferRules: parseJsonSafe(form.transferRules),
        workingHours: parseJsonSafe(form.workingHours),
      };
      const res = await api.patch('/ai-receptionist/agent/config', payload);
      const data = res.data.data;
      setAgentConfig(data);
      showToast('Agent configuration saved', 'success');
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to save agent configuration';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        businessName: profileForm.businessName,
        website: profileForm.website,
        industry: profileForm.industry,
        description: profileForm.description,
        products: splitLines(profileForm.products),
        services: splitLines(profileForm.services),
        pricing: parseJsonSafe(profileForm.pricing),
        businessHours: parseJsonSafe(profileForm.businessHours),
        locations: splitLines(profileForm.locations),
        contact: parseJsonSafe(profileForm.contact),
        policies: parseJsonSafe(profileForm.policies),
        faqs: splitLines(profileForm.faqs),
        bookingRules: parseJsonSafe(profileForm.bookingRules),
      };
      if (profile) {
        await api.patch('/ai-receptionist/business/profile', payload);
      } else {
        await api.post('/ai-receptionist/business/profile', payload);
      }
      showToast('Business profile saved', 'success');
      loadAll();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save business profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const addDocument = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/ai-receptionist/knowledge/documents', {
        ...docForm,
        status: docForm.status,
      });
      showToast('Knowledge document added', 'success');
      setDocForm({ title: '', category: 'General', content: '', status: 'DRAFT' });
      loadAll();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to add document', 'error');
    } finally {
      setSaving(false);
    }
  };

  const approveDocument = async (id) => {
    try {
      await api.post(`/ai-receptionist/knowledge/documents/${id}/approve`);
      showToast('Document approved — now live for calls', 'success');
      loadAll();
    } catch (err) {
      showToast('Failed to approve document', 'error');
    }
  };

  const deleteDocument = async (id) => {
    try {
      await api.delete(`/ai-receptionist/knowledge/documents/${id}`);
      showToast('Document deleted', 'success');
      loadAll();
    } catch (err) {
      showToast('Failed to delete document', 'error');
    }
  };

  const testAI = async (e) => {
    e.preventDefault();
    if (!testMessage.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post('/ai-receptionist/agent/test', {
        message: testMessage.trim(),
        sessionContext: { lastTopic: null, conversationMode: 'both' },
        useBrain: true,
      });
      const data = res.data.data;
      setTestResult({
        answer: data.answer,
        intent: data.intent,
        source: data.answerSource,
        sources: data.usedSources,
        actions: data.actions,
        handoffRecommended: data.handoffRecommended,
        requiresConfirmation: data.requiresConfirmation,
        latencyMs: data.latencyMs,
      });
    } catch (err) {
      showToast('Test failed', 'error');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
      </div>
    );
  }

  const sections = [
    { id: 'agent', label: 'Agent' },
    { id: 'greeting', label: 'Greeting' },
    { id: 'business', label: 'Business Context' },
    { id: 'goals', label: 'Goals & Qualification' },
    { id: 'rules', label: 'Booking & Transfers' },
    { id: 'profile', label: 'Business Profile' },
    { id: 'knowledge', label: 'Knowledge' },
    { id: 'test', label: 'Test Your AI' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Agent Configuration</h2>
          <p className="text-xs text-slate-400">
            Configure your AI Receptionist — voice, greeting, knowledge and business intelligence.
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${form.enabled ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
          {form.enabled ? 'Agent Enabled' : 'Agent Disabled'}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-700 pb-2">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeSection === s.id
                ? 'bg-cyan-900/30 text-cyan-300'
                : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Agent */}
      {activeSection === 'agent' && (
        <Section title="Agent Identity & Voice" subtitle="How your receptionist presents itself and sounds on calls.">
          <form onSubmit={saveAgentConfig} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Agent Name">
                <input name="agentName" value={form.agentName} onChange={handleChange} className="input" />
              </Field>
              <Field label="Phone Number (Twilio)">
                <input name="phoneNumber" value={form.phoneNumber} onChange={handleChange} className="input" placeholder="+1XXXXXXXXXX" />
              </Field>
              <Field label="Voice">
                <select name="voiceId" value={form.voiceId} onChange={handleChange} className="input">
                  {VOICE_OPTIONS.map((v) => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Language">
                <input name="language" value={form.language} onChange={handleChange} className="input" />
              </Field>
              <Field label="Tone">
                <select name="tone" value={form.tone} onChange={handleChange} className="input">
                  {TONE_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Enabled">
                <label className="flex items-center gap-2 pt-2">
                  <input type="checkbox" name="enabled" checked={form.enabled} onChange={handleChange} className="h-4 w-4 accent-cyan-500" />
                  <span className="text-sm text-slate-300">Receptionist takes live calls</span>
                </label>
              </Field>
            </div>
            <Field label="Personality">
              <textarea name="personality" value={form.personality} onChange={handleChange} className="input" rows={2} />
            </Field>
            <button type="submit" disabled={saving} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Agent'}
            </button>
          </form>
        </Section>
      )}

      {/* Greeting */}
      {activeSection === 'greeting' && (
        <Section title="Greeting" subtitle="Every new call begins with a professional greeting. The greeting is protected — it can never be removed, only replaced.">
          <form onSubmit={saveAgentConfig} className="space-y-4">
            <Field label="Greeting Message" hint="Leave as-is to keep the standard FleetNimble greeting.">
              <textarea name="greetingMessage" value={form.greetingMessage} onChange={handleChange} className="input" rows={4} />
            </Field>
            {agentConfig?.greetingProtected && (
              <p className="rounded-lg border border-amber-700 bg-amber-900/20 px-3 py-2 text-xs text-amber-300">
                Greeting protection is ON — an empty greeting can never be saved.
              </p>
            )}
            <button type="submit" disabled={saving} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Greeting'}
            </button>
          </form>
        </Section>
      )}

      {/* Business Context */}
      {activeSection === 'business' && (
        <Section title="Business Context" subtitle="Extra business knowledge injected into the AI's system prompt.">
          <form onSubmit={saveAgentConfig} className="space-y-4">
            <Field label="Business Context" hint="e.g. FleetNimble is an AI-powered fleet management platform with GPS tracking, live diagnostics, OBD devices, digital twin, maintenance, fuel analytics and an AI assistant.">
              <textarea name="businessContext" value={form.businessContext} onChange={handleChange} className="input" rows={6} />
            </Field>
            <button type="submit" disabled={saving} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Business Context'}
            </button>
          </form>
        </Section>
      )}

      {/* Goals */}
      {activeSection === 'goals' && (
        <Section title="Goals & Qualification" subtitle="What the receptionist tries to achieve and the questions it asks to qualify leads.">
          <form onSubmit={saveAgentConfig} className="space-y-4">
            <Field label="Primary Goal">
              <input name="primaryGoal" value={form.primaryGoal} onChange={handleChange} className="input" />
            </Field>
            <Field label="Secondary Goals" hint="One per line">
              <textarea
                name="secondaryGoals"
                value={Array.isArray(form.secondaryGoals) ? form.secondaryGoals.join('\n') : ''}
                onChange={(e) => setForm((f) => ({ ...f, secondaryGoals: e.target.value.split('\n') }))}
                className="input"
                rows={3}
              />
            </Field>
            <Field label="Qualification Questions" hint="One per line — asked naturally during the conversation">
              <textarea
                name="qualificationQuestions"
                value={Array.isArray(form.qualificationQuestions) ? form.qualificationQuestions.join('\n') : ''}
                onChange={(e) => setForm((f) => ({ ...f, qualificationQuestions: e.target.value.split('\n') }))}
                className="input"
                rows={3}
              />
            </Field>
            <button type="submit" disabled={saving} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Goals'}
            </button>
          </form>
        </Section>
      )}

      {/* Rules */}
      {activeSection === 'rules' && (
        <Section title="Booking, Transfer & Working Hours Rules" subtitle="JSON rule sets controlling demos, human handoffs and availability.">
          <form onSubmit={saveAgentConfig} className="space-y-4">
            <Field label="Booking Rules (JSON)" hint='e.g. {"defaultDurationMinutes": 30, "confirmVia": ["email","sms"]}'>
              <textarea
                name="bookingRules"
                value={typeof form.bookingRules === 'object' ? JSON.stringify(form.bookingRules, null, 2) : form.bookingRules}
                onChange={(e) => setForm((f) => ({ ...f, bookingRules: e.target.value }))}
                className="input font-mono"
                rows={4}
              />
            </Field>
            <Field label="Transfer Rules (JSON)" hint='e.g. {"sales": {"enabled": true}, "support": {"enabled": true}, "emergency": {"enabled": true}}'>
              <textarea
                name="transferRules"
                value={typeof form.transferRules === 'object' ? JSON.stringify(form.transferRules, null, 2) : form.transferRules}
                onChange={(e) => setForm((f) => ({ ...f, transferRules: e.target.value }))}
                className="input font-mono"
                rows={4}
              />
            </Field>
            <Field label="Working Hours (JSON)" hint='e.g. {"monday": "9:00-18:00", "saturday": null}'>
              <textarea
                name="workingHours"
                value={typeof form.workingHours === 'object' ? JSON.stringify(form.workingHours, null, 2) : form.workingHours}
                onChange={(e) => setForm((f) => ({ ...f, workingHours: e.target.value }))}
                className="input font-mono"
                rows={4}
              />
            </Field>
            <button type="submit" disabled={saving} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Rules'}
            </button>
          </form>
        </Section>
      )}

      {/* Business Profile */}
      {activeSection === 'profile' && (
        <Section title="Business Profile" subtitle="Your business onboarding — products, services, pricing and policies the receptionist can answer from.">
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Business Name">
                <input name="businessName" value={profileForm.businessName} onChange={handleProfileChange} className="input" />
              </Field>
              <Field label="Website">
                <input name="website" value={profileForm.website} onChange={handleProfileChange} className="input" />
              </Field>
              <Field label="Industry">
                <input name="industry" value={profileForm.industry} onChange={handleProfileChange} className="input" />
              </Field>
              <Field label="Locations" hint="One per line (city/address)">
                <textarea name="locations" value={profileForm.locations} onChange={handleProfileChange} className="input" rows={2} />
              </Field>
            </div>
            <Field label="Description">
              <textarea name="description" value={profileForm.description} onChange={handleProfileChange} className="input" rows={3} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Products" hint="One per line">
                <textarea name="products" value={profileForm.products} onChange={handleProfileChange} className="input" rows={4} />
              </Field>
              <Field label="Services" hint="One per line">
                <textarea name="services" value={profileForm.services} onChange={handleProfileChange} className="input" rows={4} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Pricing (JSON)" hint='e.g. {"Starter": "$29/mo", "Pro": "$99/mo"}'>
                <textarea name="pricing" value={profileForm.pricing} onChange={handleProfileChange} className="input font-mono" rows={4} />
              </Field>
              <Field label="Business Hours (JSON)" hint='e.g. {"Monday": "9:00-18:00"}'>
                <textarea name="businessHours" value={profileForm.businessHours} onChange={handleProfileChange} className="input font-mono" rows={4} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Contact (JSON)" hint='e.g. {"email": "hello@fleetnimble.com", "phone": "+1..."}'>
                <textarea name="contact" value={profileForm.contact} onChange={handleProfileChange} className="input font-mono" rows={4} />
              </Field>
              <Field label="Policies (JSON)">
                <textarea name="policies" value={profileForm.policies} onChange={handleProfileChange} className="input font-mono" rows={4} />
              </Field>
            </div>
            <Field label="FAQs" hint="One per line">
              <textarea name="faqs" value={profileForm.faqs} onChange={handleProfileChange} className="input" rows={4} />
            </Field>
            <Field label="Booking Rules (JSON)">
              <textarea name="bookingRules" value={profileForm.bookingRules} onChange={handleProfileChange} className="input font-mono" rows={3} />
            </Field>
            <button type="submit" disabled={saving} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Business Profile'}
            </button>
          </form>
        </Section>
      )}

      {/* Knowledge */}
      {activeSection === 'knowledge' && (
        <div className="space-y-4">
          <Section title="Add Knowledge Document" subtitle="Documents must be approved before they answer caller questions. Only APPROVED documents are used during calls.">
            <form onSubmit={addDocument} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Title">
                  <input name="title" value={docForm.title} onChange={(e) => setDocForm((d) => ({ ...d, title: e.target.value }))} className="input" required />
                </Field>
                <Field label="Category">
                  <input name="category" value={docForm.category} onChange={(e) => setDocForm((d) => ({ ...d, category: e.target.value }))} className="input" placeholder="General" />
                </Field>
              </div>
              <Field label="Content">
                <textarea name="content" value={docForm.content} onChange={(e) => setDocForm((d) => ({ ...d, content: e.target.value }))} className="input" rows={5} required />
              </Field>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={docForm.status === 'APPROVED'} onChange={(e) => setDocForm((d) => ({ ...d, status: e.target.checked ? 'APPROVED' : 'DRAFT' }))} className="h-4 w-4 accent-cyan-500" />
                  Approve immediately (live on calls)
                </label>
                <button type="submit" disabled={saving} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50">
                  {saving ? 'Adding...' : '+ Add Document'}
                </button>
              </div>
            </form>
          </Section>

          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Knowledge Documents ({documents.total || 0})</h3>
              <button onClick={loadAll} className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors">
                Refresh
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-700 bg-slate-800">
                  <tr>
                    <th className="table-th">Title</th>
                    <th className="table-th">Category</th>
                    <th className="table-th">Source</th>
                    <th className="table-th">Status</th>
                    <th className="table-th">Updated</th>
                    <th className="table-th">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {documents.items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-slate-500">No knowledge documents yet. Add one above.</td>
                    </tr>
                  ) : (
                    documents.items.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-800/50">
                        <td className="table-td font-medium">{doc.title}</td>
                        <td className="table-td">{doc.category || 'General'}</td>
                        <td className="table-td">{doc.sourceType || 'manual'}</td>
                        <td className="table-td">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                            doc.status === 'APPROVED' ? 'bg-green-900/30 text-green-400' : 'bg-amber-900/30 text-amber-300'
                          }`}>
                            {doc.status}
                          </span>
                        </td>
                        <td className="table-td text-xs">{new Date(doc.updatedAt).toLocaleDateString()}</td>
                        <td className="table-td">
                          <div className="flex gap-2">
                            {doc.status !== 'APPROVED' && (
                              <button onClick={() => approveDocument(doc.id)} className="rounded border border-green-700 px-2 py-1 text-xs text-green-400 hover:bg-green-900/30">
                                Approve
                              </button>
                            )}
                            <button onClick={() => deleteDocument(doc.id)} className="rounded border border-red-700 px-2 py-1 text-xs text-red-400 hover:bg-red-900/30">
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Test Your AI */}
      {activeSection === 'test' && (
        <Section title="Test Your AI" subtitle="Try a caller question and see how the receptionist answers, which sources it uses and what actions it plans.">
          <form onSubmit={testAI} className="space-y-4">
            <Field label="Caller Question">
              <input value={testMessage} onChange={(e) => setTestMessage(e.target.value)} className="input" placeholder="e.g. How does GPS tracking work?" />
            </Field>
            <button type="submit" disabled={testing || !testMessage.trim()} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50">
              {testing ? 'Testing...' : 'Test Question'}
            </button>
          </form>

          {testResult && (
            <div className="mt-4 space-y-3 rounded-lg border border-slate-700 bg-slate-900/60 p-4">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-cyan-900/30 px-2 py-0.5 text-xs text-cyan-300">Intent: {testResult.intent}</span>
                <span className="rounded-full bg-blue-900/30 px-2 py-0.5 text-xs text-blue-300">Source: {testResult.source}</span>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">Latency: {testResult.latencyMs}ms</span>
                {testResult.handoffRecommended && <span className="rounded-full bg-red-900/30 px-2 py-0.5 text-xs text-red-300">Handoff recommended</span>}
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">Answer</p>
                <p className="text-sm text-slate-200">{testResult.answer}</p>
              </div>
              {testResult.sources?.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">Knowledge Sources Used</p>
                  <p className="text-xs text-slate-300">{testResult.sources.join(', ')}</p>
                </div>
              )}
              {testResult.actions?.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">Planned Actions</p>
                  <p className="text-xs text-slate-300">{testResult.actions.join(', ')}</p>
                </div>
              )}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

function splitLines(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseJsonSafe(value) {
  if (typeof value === 'object' && value !== null) return value;
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
