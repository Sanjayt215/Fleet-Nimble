import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'plans', label: 'Plans' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'insights', label: 'Insights' },
  { id: 'learnings', label: 'Learnings' },
  { id: 'memory', label: 'Memory' },
  { id: 'skills', label: 'Skills' },
];

function Card({ title, value, sub }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{title}</p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="mb-4 text-sm font-semibold text-white">{title}</h3>
      {children}
    </div>
  );
}

function StatusBadge({ status }) {
  const color = status === 'COMPLETED' || status === 'completed'
    ? 'bg-emerald-900/50 text-emerald-300'
    : status === 'FAILED' || status === 'failed'
      ? 'bg-red-900/50 text-red-300'
      : status === 'RUNNING' || status === 'running'
        ? 'bg-amber-900/50 text-amber-300'
        : 'bg-slate-800 text-slate-300';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{status}</span>;
}

export default function FleetBrainDashboard() {
  const { isAuthLoading, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [dashboard, setDashboard] = useState(null);
  const [insights, setInsights] = useState(null);
  const [learnings, setLearnings] = useState([]);
  const [memory, setMemory] = useState([]);
  const [plans, setPlans] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchDashboard = useCallback(async () => {
    if (isAuthLoading) return;
    try {
      setLoading(true);
      setError(null);
      const [dashRes, plansRes, decisionsRes, insightsRes, learningsRes, memoryRes] = await Promise.allSettled([
        api.get('/fleet-brain/dashboard?limit=10'),
        api.get('/fleet-brain/plans?limit=10'),
        api.get('/fleet-brain/decisions?limit=10'),
        api.get('/fleet-brain/insights?days=30'),
        api.get('/fleet-brain/learnings?limit=10'),
        api.get('/fleet-brain/memory?limit=10'),
      ]);
      if (dashRes.status === 'fulfilled') setDashboard(dashRes.value.data.data || null);
      if (plansRes.status === 'fulfilled') setPlans(plansRes.value.data.data || []);
      if (decisionsRes.status === 'fulfilled') setDecisions(decisionsRes.value.data.data || []);
      if (insightsRes.status === 'fulfilled') setInsights(insightsRes.value.data.data || null);
      if (learningsRes.status === 'fulfilled') setLearnings(learningsRes.value.data.data || []);
      if (memoryRes.status === 'fulfilled') setMemory(memoryRes.value.data.data || []);
    } catch (err) {
      setError('Failed to load Fleet Brain data.');
    } finally {
      setLoading(false);
    }
  }, [isAuthLoading]);

  useEffect(() => { if (!isAuthLoading && isAuthenticated) fetchDashboard(); }, [fetchDashboard, isAuthLoading, isAuthenticated]);

  useSocket({
    'fleetbrain.context': useCallback(() => fetchDashboard(), [fetchDashboard]),
    'fleetbrain.decision': useCallback(() => fetchDashboard(), [fetchDashboard]),
    'fleetbrain.tool': useCallback(() => fetchDashboard(), [fetchDashboard]),
    'fleetbrain.workflow': useCallback(() => fetchDashboard(), [fetchDashboard]),
    'fleetbrain.insight': useCallback(() => fetchDashboard(), [fetchDashboard]),
    'fleetbrain.learning': useCallback(() => fetchDashboard(), [fetchDashboard]),
    'fleetbrain.updated': useCallback(() => fetchDashboard(), [fetchDashboard]),
  });

  const generateInsights = async () => {
    try {
      await api.post('/fleet-brain/insights/generate', { days: 30 });
      showToast('Insights generated');
      fetchDashboard();
    } catch (err) {
      showToast('Failed to generate insights', 'error');
    }
  };

  const applyLearning = async (id) => {
    try {
      await api.post(`/fleet-brain/learnings/${id}/apply`);
      showToast('Recommendation applied');
      fetchDashboard();
    } catch (err) {
      showToast('Failed to apply recommendation', 'error');
    }
  };

  if (isAuthLoading) {
    return <div className="text-center text-slate-400 py-20">Loading Fleet Brain...</div>;
  }

  if (dashboard && dashboard.enabled === false) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
        <p className="text-lg font-semibold text-white">Fleet Brain is disabled</p>
        <p className="mt-2 text-sm text-slate-400">Set AI_FLEET_BRAIN_ENABLED=true to activate the intelligence center.</p>
      </div>
    );
  }

  const workflows = dashboard?.workflows || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Fleet Brain</h2>
          <p className="text-sm text-slate-400">
            The intelligence center — context, memory, planning, decisions, workflows and learning.
          </p>
        </div>
        <button type="button" onClick={generateInsights} className="btn-primary bg-cyan-600 hover:bg-cyan-500 text-white">
          Generate Insights
        </button>
      </div>

      {error && <div className="rounded-xl border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">{error}</div>}
      {toast && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${toast.type === 'error' ? 'border-red-800 bg-red-950/50 text-red-300' : 'border-emerald-800 bg-emerald-950/50 text-emerald-300'}`}>
          {toast.message}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              activeTab === tab.id ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-center text-slate-400 py-10">Loading...</div>}

      {!loading && activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card title="Contexts Built" value={dashboard?.stats?.contextsBuilt ?? 0} />
            <Card title="Plans Built" value={dashboard?.stats?.plansBuilt ?? 0} />
            <Card title="Workflows Run" value={dashboard?.stats?.workflowsRun ?? 0} />
            <Card title="Learnings Saved" value={dashboard?.stats?.learningsSaved ?? 0} />
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card title="Skills" value={dashboard?.skills?.length ?? 0} />
            <Card title="Memory Items" value={dashboard?.memory?.inMemory ?? 0} sub={`${dashboard?.memory?.persisted ?? 0} persisted`} />
            <Card title="Totals — Calls" value={dashboard?.totals?.calls ?? 0} sub="last 30 days" />
            <Card title="Totals — Appointments" value={dashboard?.totals?.appointments ?? 0} sub="last 30 days" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Latest Workflows">
              {workflows.length === 0 && <p className="text-sm text-slate-400">No workflow runs yet.</p>}
              <ul className="space-y-2">
                {workflows.map((w) => (
                  <li key={w.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-white">{w.workflowType}</p>
                      <p className="text-xs text-slate-400">{w.trigger} · {new Date(w.createdAt).toLocaleString()}</p>
                    </div>
                    <StatusBadge status={w.status} />
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="Recent Insights">
              {(!insights?.insights || insights.insights.length === 0) && <p className="text-sm text-slate-400">No insights yet — generate some.</p>}
              <ul className="space-y-2">
                {(insights?.insights || []).slice(0, 6).map((i, idx) => (
                  <li key={`${i.type}-${idx}`} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                    <p className="text-sm font-medium text-cyan-300">{i.title}</p>
                    <p className="text-xs text-slate-400">{i.summary}</p>
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        </div>
      )}

      {!loading && activeTab === 'plans' && (
        <Section title="Execution Plans">
          {plans.length === 0 && <p className="text-sm text-slate-400">No plans yet.</p>}
          <ul className="space-y-3">
            {plans.map((p, idx) => (
              <li key={`${p.createdPlanAt}-${idx}`} className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-cyan-900/50 px-2 py-0.5 text-xs font-medium text-cyan-200">{p.intent}</span>
                  {p.skill && <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{p.skill}</span>}
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">Risk {p.risk}</span>
                </div>
                <p className="mt-2 text-sm text-slate-300">{p.currentGoal}</p>
                <p className="mt-1 text-xs text-slate-400">Next: {p.nextAction}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Tools: {(p.requiredTools || []).join(', ') || 'none'}
                  {p.missingInformation?.length > 0 && ` · Missing: ${p.missingInformation.join(', ')}`}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!loading && activeTab === 'decisions' && (
        <Section title="Decision Records">
          {decisions.length === 0 && <p className="text-sm text-slate-400">No decisions yet.</p>}
          <ul className="space-y-3">
            {decisions.map((d) => (
              <li key={d.id} className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-cyan-900/50 px-2 py-0.5 text-xs font-medium text-cyan-200">{d.intent || 'UNKNOWN'}</span>
                  <span className="text-xs text-slate-400">{new Date(d.at).toLocaleString()}</span>
                </div>
                <ul className="mt-2 space-y-1">
                  {(d.decisions || []).map((dd, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-xs text-slate-300">
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 font-medium text-cyan-300">{dd.tool}</span>
                      {dd.label}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!loading && activeTab === 'workflows' && (
        <Section title="Workflow Runs">
          {workflows.length === 0 && <p className="text-sm text-slate-400">No workflow runs yet.</p>}
          <ul className="space-y-3">
            {workflows.map((w) => (
              <li key={w.id} className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-white">{w.workflowType}</p>
                    <p className="text-xs text-slate-400">{w.trigger} · {new Date(w.createdAt).toLocaleString()}</p>
                  </div>
                  <StatusBadge status={w.status} />
                </div>
                {Array.isArray(w.steps) && w.steps.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {w.steps.map((s, idx) => (
                      <span
                        key={`${w.id}-${s.step}-${idx}`}
                        className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                          s.status === 'completed' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'
                        }`}
                      >
                        {s.step}
                      </span>
                    ))}
                  </div>
                )}
                {w.error && <p className="mt-2 text-xs text-red-300">{w.error}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!loading && activeTab === 'insights' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <Card title="Calls (30d)" value={insights?.totals?.calls ?? 0} />
            <Card title="Appointments (30d)" value={insights?.totals?.appointments ?? 0} />
            <Card title="Tickets (30d)" value={insights?.totals?.tickets ?? 0} />
          </div>
          <Section title="Business Insights">
            {(!insights?.insights || insights.insights.length === 0) && <p className="text-sm text-slate-400">No insights yet — generate some.</p>}
            <ul className="space-y-3">
              {(insights?.insights || []).map((i, idx) => (
                <li key={`${i.type}-${idx}`} className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-cyan-900/50 px-2 py-0.5 text-xs font-medium text-cyan-200">{i.type}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-white">{i.title}</p>
                  <p className="mt-1 text-xs text-slate-300">{i.summary}</p>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      {!loading && activeTab === 'learnings' && (
        <Section title="Learnings & Recommendations">
          {learnings.length === 0 && <p className="text-sm text-slate-400">No learnings yet — they are captured after every call.</p>}
          <ul className="space-y-3">
            {learnings.map((l) => (
              <li key={l.id} className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-cyan-900/50 px-2 py-0.5 text-xs font-medium text-cyan-200">{l.learningType}</span>
                  {l.applied && <span className="rounded-full bg-emerald-900/50 px-2 py-0.5 text-xs text-emerald-300">applied</span>}
                  <span className="text-xs text-slate-400">{new Date(l.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-2 text-sm text-slate-300">{l.content}</p>
                {l.recommendation && (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900 px-3 py-2">
                    <p className="text-xs text-amber-300">{l.recommendation}</p>
                    {!l.applied && (
                      <button type="button" onClick={() => applyLearning(l.id)} className="btn-secondary bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-100 border-cyan-400/30">
                        Apply
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!loading && activeTab === 'memory' && (
        <Section title="Memory Items">
          {memory.length === 0 && <p className="text-sm text-slate-400">No memory items yet.</p>}
          <ul className="space-y-2">
            {memory.map((m, idx) => (
              <li key={`${m.key || m.scope}-${idx}`} className="flex items-start justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                <div>
                  <p className="text-xs font-medium text-cyan-300">{m.scope} · {m.key}</p>
                  <p className="mt-0.5 text-xs text-slate-300">{typeof m.value === 'string' ? m.value : JSON.stringify(m.value)}</p>
                </div>
                {m.expiresAt && <span className="shrink-0 text-[11px] text-slate-500">expires {new Date(m.expiresAt).toLocaleString()}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!loading && activeTab === 'skills' && (
        <div className="grid gap-4 md:grid-cols-2">
          {(dashboard?.skills || []).map((s) => (
            <div key={s.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">{s.name}</h3>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{s.id}</span>
              </div>
              <p className="mt-2 text-xs text-slate-400">{s.description}</p>
              <p className="mt-2 text-xs text-slate-500">Intents: {(s.intents || []).join(', ')}</p>
              <p className="mt-1 text-xs text-slate-500">Tools: {(s.tools || []).join(', ')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
