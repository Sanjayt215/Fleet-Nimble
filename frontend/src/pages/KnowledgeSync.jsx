import { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const TABS = ['Sources', 'Staged Articles', 'Sync History', 'Settings'];

export default function KnowledgeSync() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('Sources');
  const [sources, setSources] = useState([]);
  const [staged, setStaged] = useState({ items: [], total: 0, page: 1, totalPages: 0 });
  const [runs, setRuns] = useState({ items: [], total: 0, page: 1, totalPages: 0 });
  const [loading, setLoading] = useState({});
  const [error, setError] = useState(null);
  const [showAddSource, setShowAddSource] = useState(false);

  const fetchSources = useCallback(async () => {
    setLoading(p => ({ ...p, sources: true }));
    try {
      const { data } = await api.get('/admin/knowledge/sources');
      setSources(data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load sources');
    } finally {
      setLoading(p => ({ ...p, sources: false }));
    }
  }, []);

  const fetchStaged = useCallback(async (page = 1) => {
    setLoading(p => ({ ...p, staged: true }));
    try {
      const { data } = await api.get(`/admin/knowledge/staged?page=${page}&limit=20`);
      setStaged({ items: data.items || [], total: data.total || 0, page: data.page || 1, totalPages: data.totalPages || 0 });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load staged articles');
    } finally {
      setLoading(p => ({ ...p, staged: false }));
    }
  }, []);

  const fetchRuns = useCallback(async (page = 1) => {
    setLoading(p => ({ ...p, runs: true }));
    try {
      const { data } = await api.get(`/admin/knowledge/runs?page=${page}&limit=20`);
      setRuns({ items: data.items || [], total: data.total || 0, page: data.page || 1, totalPages: data.totalPages || 0 });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load sync runs');
    } finally {
      setLoading(p => ({ ...p, runs: false }));
    }
  }, []);

  useEffect(() => { if (activeTab === 'Sources') fetchSources(); }, [activeTab, fetchSources]);
  useEffect(() => { if (activeTab === 'Staged Articles') fetchStaged(); }, [activeTab, fetchStaged]);
  useEffect(() => { if (activeTab === 'Sync History') fetchRuns(); }, [activeTab, fetchRuns]);

  if (user?.role?.name !== 'ADMIN') return <Navigate to="/dashboard" replace />;

  const triggerSync = async (sourceId) => {
    setLoading(p => ({ ...p, [`sync_${sourceId}`]: true }));
    try {
      await api.post(`/admin/knowledge/sources/${sourceId}/sync`);
      fetchSources();
    } catch (err) {
      setError(err.response?.data?.message || 'Sync failed');
    } finally {
      setLoading(p => ({ ...p, [`sync_${sourceId}`]: false }));
    }
  };

  const approveArticle = async (id) => {
    try {
      await api.post(`/admin/knowledge/staged/${id}/approve`);
      fetchStaged(staged.page);
    } catch (err) {
      setError(err.response?.data?.message || 'Approval failed');
    }
  };

  const rejectArticle = async (id) => {
    const reason = prompt('Rejection reason:');
    if (!reason) return;
    try {
      await api.post(`/admin/knowledge/staged/${id}/reject`, { reason });
      fetchStaged(staged.page);
    } catch (err) {
      setError(err.response?.data?.message || 'Rejection failed');
    }
  };

  const archiveArticle = async (id) => {
    const reason = prompt('Archive reason:');
    if (!reason) return;
    try {
      await api.post(`/admin/knowledge/staged/${id}/archive`, { reason });
      fetchStaged(staged.page);
    } catch (err) {
      setError(err.response?.data?.message || 'Archive failed');
    }
  };

  const statusStyle = (status) => {
    const map = {
      RUNNING: 'text-blue-400 bg-blue-900/30',
      COMPLETED: 'text-green-400 bg-green-900/30',
      FAILED: 'text-red-400 bg-red-900/30',
      ACTIVE: 'text-green-400 bg-green-900/30',
      NEEDS_REVIEW: 'text-yellow-400 bg-yellow-900/30',
      APPROVED: 'text-cyan-400 bg-cyan-900/30',
      REJECTED: 'text-red-400 bg-red-900/30',
      ARCHIVED: 'text-slate-400 bg-slate-800/30',
      DISCOVERED: 'text-blue-400 bg-blue-900/30',
    };
    return map[status] || 'text-slate-400 bg-slate-800/30';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Knowledge Sync</h2>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-2 text-sm text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">&times;</button>
        </div>
      )}

      <div className="flex gap-1 rounded-lg bg-slate-900 p-1">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
              activeTab === tab ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Sources' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowAddSource(!showAddSource)} className="btn-primary text-sm">
              {showAddSource ? 'Cancel' : '+ Add Source'}
            </button>
          </div>

          {showAddSource && <SourceForm onCreated={() => { setShowAddSource(false); fetchSources(); }} />}

          <div className="card overflow-hidden p-0">
            {loading.sources ? (
              <div className="p-8 text-center text-slate-400">Loading sources...</div>
            ) : sources.length === 0 ? (
              <div className="p-8 text-center text-slate-400">No sources configured yet.</div>
            ) : (
              <table className="w-full">
                <thead className="border-b border-slate-800 bg-slate-900">
                  <tr>
                    <th className="table-th">Name</th>
                    <th className="table-th">Type</th>
                    <th className="table-th">Status</th>
                    <th className="table-th">Last Sync</th>
                    <th className="table-th">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {sources.map(src => (
                    <tr key={src.id} className="hover:bg-slate-800/80">
                      <td className="table-td font-medium">{src.name}</td>
                      <td className="table-td text-slate-400">{src.sourceType}</td>
                      <td className="table-td">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${src.enabled ? 'text-green-400 bg-green-900/30' : 'text-slate-400 bg-slate-800/30'}`}>
                          {src.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                      <td className="table-td text-xs text-slate-400">
                        {src.lastSyncedAt ? new Date(src.lastSyncedAt).toLocaleString() : 'Never'}
                      </td>
                      <td className="table-td">
                        <div className="flex gap-2">
                          <button
                            onClick={() => triggerSync(src.id)}
                            disabled={loading[`sync_${src.id}`]}
                            className="btn-primary text-xs"
                          >
                            {loading[`sync_${src.id}`] ? 'Syncing...' : 'Sync Now'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'Staged Articles' && (
        <div className="space-y-4">
          <div className="card overflow-hidden p-0">
            {loading.staged ? (
              <div className="p-8 text-center text-slate-400">Loading articles...</div>
            ) : staged.items.length === 0 ? (
              <div className="p-8 text-center text-slate-400">No staged articles found.</div>
            ) : (
              <table className="w-full">
                <thead className="border-b border-slate-800 bg-slate-900">
                  <tr>
                    <th className="table-th">Title</th>
                    <th className="table-th">Category</th>
                    <th className="table-th">Status</th>
                    <th className="table-th">Mode</th>
                    <th className="table-th">Updated</th>
                    <th className="table-th">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {staged.items.map(a => (
                    <tr key={a.id} className="hover:bg-slate-800/80">
                      <td className="table-td font-medium max-w-xs truncate">{a.title}</td>
                      <td className="table-td text-xs text-slate-400">{a.category}</td>
                      <td className="table-td">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle(a.status)}`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="table-td text-xs text-slate-400">{a.mode}</td>
                      <td className="table-td text-xs text-slate-400">{new Date(a.updatedAt).toLocaleDateString()}</td>
                      <td className="table-td">
                        <div className="flex gap-1">
                          <button onClick={() => approveArticle(a.id)} className="btn-primary text-xs" disabled={a.status === 'ACTIVE'}>Approve</button>
                          <button onClick={() => rejectArticle(a.id)} className="btn bg-red-600 hover:bg-red-700 text-white rounded px-2 py-1 text-xs" disabled={a.status === 'REJECTED'}>Reject</button>
                          <button onClick={() => archiveArticle(a.id)} className="btn bg-slate-600 hover:bg-slate-700 text-white rounded px-2 py-1 text-xs" disabled={a.status === 'ARCHIVED'}>Archive</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {staged.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <button disabled={staged.page <= 1} onClick={() => fetchStaged(staged.page - 1)} className="btn-secondary text-sm disabled:opacity-40">Previous</button>
              <span className="text-sm text-slate-400">Page {staged.page} of {staged.totalPages}</span>
              <button disabled={staged.page >= staged.totalPages} onClick={() => fetchStaged(staged.page + 1)} className="btn-secondary text-sm disabled:opacity-40">Next</button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'Sync History' && (
        <div className="space-y-4">
          <div className="card overflow-hidden p-0">
            {loading.runs ? (
              <div className="p-8 text-center text-slate-400">Loading sync runs...</div>
            ) : runs.items.length === 0 ? (
              <div className="p-8 text-center text-slate-400">No sync runs recorded.</div>
            ) : (
              <table className="w-full">
                <thead className="border-b border-slate-800 bg-slate-900">
                  <tr>
                    <th className="table-th">Source</th>
                    <th className="table-th">Status</th>
                    <th className="table-th">Started</th>
                    <th className="table-th">Duration</th>
                    <th className="table-th">New</th>
                    <th className="table-th">Updated</th>
                    <th className="table-th">Conflicts</th>
                    <th className="table-th">Errors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {runs.items.map(run => (
                    <tr key={run.id} className="hover:bg-slate-800/80">
                      <td className="table-td text-sm">{run.source?.name || run.sourceId}</td>
                      <td className="table-td">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle(run.status)}`}>
                          {run.status}
                        </span>
                      </td>
                      <td className="table-td text-xs text-slate-400">{new Date(run.startedAt).toLocaleString()}</td>
                      <td className="table-td text-xs text-slate-400">{run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : '-'}</td>
                      <td className="table-td text-xs">{run.articlesNew || 0}</td>
                      <td className="table-td text-xs">{run.articlesUpdated || 0}</td>
                      <td className="table-td text-xs">{run.articlesConflicted || 0}</td>
                      <td className="table-td text-xs text-red-400">{run.pagesFailed || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {runs.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <button disabled={runs.page <= 1} onClick={() => fetchRuns(runs.page - 1)} className="btn-secondary text-sm disabled:opacity-40">Previous</button>
              <span className="text-sm text-slate-400">Page {runs.page} of {runs.totalPages}</span>
              <button disabled={runs.page >= runs.totalPages} onClick={() => fetchRuns(runs.page + 1)} className="btn-secondary text-sm disabled:opacity-40">Next</button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'Settings' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Configure knowledge sync behavior. Additional settings coming soon.
          </p>
        </div>
      )}
    </div>
  );
}

function SourceForm({ onCreated }) {
  const [form, setForm] = useState({
    name: '',
    sourceType: 'website',
    baseUrl: '',
    localPath: '',
    enabled: true,
    requiresApproval: true,
    crawlDepth: 2,
    maxPages: 50,
    rateLimitMs: 1000,
    schedule: '0 */6 * * *',
    defaultCategory: 'Web',
    defaultMode: 'both',
    priority: 5,
    allowedDomains: '',
    allowedPaths: '',
    blockedPaths: '',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api.post('/admin/knowledge/sources', {
        ...form,
        allowedDomains: form.allowedDomains ? form.allowedDomains.split(',').map(s => s.trim()).filter(Boolean) : [],
        allowedPaths: form.allowedPaths ? form.allowedPaths.split(',').map(s => s.trim()).filter(Boolean) : [],
        blockedPaths: form.blockedPaths ? form.blockedPaths.split(',').map(s => s.trim()).filter(Boolean) : [],
      });
      onCreated();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to create source');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <h3 className="mb-4 text-lg font-semibold">Add Knowledge Source</h3>
      {formError && <div className="mb-4 rounded border border-red-800 bg-red-900/20 px-4 py-2 text-sm text-red-400">{formError}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Name</label>
            <input name="name" value={form.name} onChange={handleChange} required className="input w-full" placeholder="FleetNimble Website" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Type</label>
            <select name="sourceType" value={form.sourceType} onChange={handleChange} className="input w-full">
              <option value="website">Website</option>
              <option value="help-center">Help Center</option>
              <option value="api-docs">API Docs</option>
              <option value="local-markdown">Local Markdown</option>
              <option value="github-wiki">GitHub Wiki</option>
              <option value="rss-feed">RSS Feed</option>
            </select>
          </div>
          {form.sourceType !== 'local-markdown' ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Base URL</label>
              <input name="baseUrl" value={form.baseUrl} onChange={handleChange} className="input w-full" placeholder="https://fleetnimble.com/docs" />
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Local Path</label>
              <input name="localPath" value={form.localPath} onChange={handleChange} className="input w-full" placeholder="./docs" />
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Schedule (cron)</label>
            <input name="schedule" value={form.schedule} onChange={handleChange} className="input w-full" placeholder="0 */6 * * *" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Crawl Depth</label>
            <input name="crawlDepth" type="number" value={form.crawlDepth} onChange={handleChange} min="1" max="10" className="input w-full" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Max Pages</label>
            <input name="maxPages" type="number" value={form.maxPages} onChange={handleChange} min="1" max="500" className="input w-full" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Rate Limit (ms)</label>
            <input name="rateLimitMs" type="number" value={form.rateLimitMs} onChange={handleChange} min="100" step="100" className="input w-full" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Default Category</label>
            <input name="defaultCategory" value={form.defaultCategory} onChange={handleChange} className="input w-full" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Default Mode</label>
            <select name="defaultMode" value={form.defaultMode} onChange={handleChange} className="input w-full">
              <option value="both">Both</option>
              <option value="sales">Sales</option>
              <option value="support">Support</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Priority (1-10)</label>
            <input name="priority" type="number" value={form.priority} onChange={handleChange} min="1" max="10" className="input w-full" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">Allowed Domains (comma separated)</label>
          <input name="allowedDomains" value={form.allowedDomains} onChange={handleChange} className="input w-full" placeholder="fleetnimble.com, docs.fleetnimble.com" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">Allowed Paths (comma separated)</label>
          <input name="allowedPaths" value={form.allowedPaths} onChange={handleChange} className="input w-full" placeholder="/docs, /guides, /faq" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">Blocked Paths (comma separated)</label>
          <input name="blockedPaths" value={form.blockedPaths} onChange={handleChange} className="input w-full" placeholder="/admin, /login, /dashboard" />
        </div>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="enabled" checked={form.enabled} onChange={handleChange} className="rounded border-slate-600" />
            Enabled
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="requiresApproval" checked={form.requiresApproval} onChange={handleChange} className="rounded border-slate-600" />
            Requires Approval
          </label>
        </div>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Creating...' : 'Create Source'}
        </button>
      </form>
    </div>
  );
}
