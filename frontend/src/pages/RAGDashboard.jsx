import { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const TABS = ['Status', 'Indexing', 'Search Diagnostics', 'Evaluations', 'Failed Embeddings', 'Monitor'];

export default function RAGDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('Status');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState({});
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (activeTab === 'Status') fetchStatus();
    else if (activeTab === 'Evaluations') fetchEvaluations();
    else if (activeTab === 'Failed Embeddings') fetchFailed();
    else if (activeTab === 'Monitor') fetchMonitor();
  }, [activeTab]);

  const fetchStatus = useCallback(async () => {
    setLoading(p => ({ ...p, status: true }));
    try {
      const { data } = await api.get('/admin/rag/status');
      setStatus(data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load RAG status');
    } finally {
      setLoading(p => ({ ...p, status: false }));
    }
  }, []);

  const fetchEvaluations = useCallback(async (hours = 24) => {
    setLoading(p => ({ ...p, evals: true }));
    try {
      const { data } = await api.get(`/admin/rag/search/metrics?hours=${hours}`);
      setStatus(p => ({ ...p, evaluations: data.data }));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load evaluations');
    } finally {
      setLoading(p => ({ ...p, evals: false }));
    }
  }, []);

  const fetchFailed = useCallback(async () => {
    setLoading(p => ({ ...p, failed: true }));
    try {
      const { data } = await api.get('/admin/rag/failed-embeddings');
      setStatus(p => ({ ...p, failedEmbeddings: data.data }));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load failed embeddings');
    } finally {
      setLoading(p => ({ ...p, failed: false }));
    }
  }, []);

  const fetchMonitor = useCallback(async () => {
    setLoading(p => ({ ...p, monitor: true }));
    try {
      const { data } = await api.get('/admin/rag/monitor');
      setStatus(p => ({ ...p, monitor: data.data }));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load monitor');
    } finally {
      setLoading(p => ({ ...p, monitor: false }));
    }
  }, []);

  const doAction = async (url, successMsg) => {
    try {
      setMessage(null); setError(null);
      const { data } = await api.post(url);
      setMessage(successMsg || data.message || 'Action completed');
      fetchStatus();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed');
    }
  };

  const [diagQuery, setDiagQuery] = useState('');
  const [diagResult, setDiagResult] = useState(null);

  const runDiagnostic = async () => {
    if (!diagQuery.trim()) return;
    setLoading(p => ({ ...p, diag: true }));
    try {
      const { data } = await api.post('/admin/rag/search/diagnose', { query: diagQuery });
      setDiagResult(data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Diagnostic failed');
    } finally {
      setLoading(p => ({ ...p, diag: false }));
    }
  };

  if (user?.role?.name !== 'ADMIN') return <Navigate to="/dashboard" replace />;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">RAG Management</h2>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-2 text-sm text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">&times;</button>
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-green-800 bg-green-900/20 px-4 py-2 text-sm text-green-400">
          {message}
          <button onClick={() => setMessage(null)} className="ml-2 underline">&times;</button>
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

      {activeTab === 'Status' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Vector Count" value={status?.stats?.totalEmbeddings ?? '-'} />
          <StatCard title="Articles Indexed" value={status?.stats?.articlesWithEmbeddings ?? '-'} />
          <StatCard title="Approved Articles" value={status?.stats?.totalApproved ?? '-'} />
          <StatCard title="Failed Embeddings" value={status?.stats?.failedEmbeddings ?? '-'} />
          <StatCard title="Exhausted Retries" value={status?.stats?.exhaustedRetries ?? '-'} />
          <StatCard title="Metrics (24h)" value={status?.stats?.metrics24h ?? '-'} />
          <StatCard title="Indexing Running" value={status?.stats?.isIndexing ? 'Yes' : 'No'} />
          <StatCard title="Re-index Queue" value={status?.stats?.reindexQueueSize ?? 0} />

          <div className="col-span-full flex flex-wrap gap-2">
            <button onClick={() => doAction('/admin/rag/index/all', 'Full indexing started')} className="btn-primary text-sm">
              Index All Articles
            </button>
            <button onClick={() => doAction('/admin/rag/reindex/stale', 'Stale reindex started')} className="btn-secondary text-sm">
              Reindex Stale
            </button>
            <button onClick={() => doAction('/admin/rag/retry-failed', 'Retrying failed embeddings')} className="btn-secondary text-sm">
              Retry Failed
            </button>
            <button onClick={() => doAction('/admin/rag/monitor/reset', 'Monitor reset')} className="btn-secondary text-sm">
              Reset Monitor
            </button>
          </div>
        </div>
      )}

      {activeTab === 'Indexing' && (
        <div className="card p-6">
          <h3 className="mb-4 text-lg font-semibold">Index a Specific Article</h3>
          <p className="mb-4 text-sm text-slate-400">Enter an article ID to index or re-index it individually.</p>
          <ArticleIndexer onDone={() => { fetchStatus(); setMessage('Article indexed'); }} />
        </div>
      )}

      {activeTab === 'Search Diagnostics' && (
        <div className="card p-6">
          <h3 className="mb-4 text-lg font-semibold">Search Diagnostic</h3>
          <p className="mb-4 text-sm text-slate-400">Test retrieval with a query and see detailed results.</p>
          <div className="flex gap-2">
            <input
              value={diagQuery}
              onChange={e => setDiagQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runDiagnostic()}
              placeholder="Enter search query..."
              className="input flex-1"
            />
            <button onClick={runDiagnostic} disabled={loading.diag} className="btn-primary">
              {loading.diag ? 'Searching...' : 'Search'}
            </button>
          </div>

          {diagResult && (
            <div className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-4">
                <StatCard title="Total Latency" value={`${diagResult.totalLatency}ms`} />
                <StatCard title="Results" value={diagResult.filteredResults} />
                <StatCard title="Confidence" value={diagResult.confidence?.toFixed(3)} />
                <StatCard title="Has Answer" value={diagResult.hasAnswer ? 'Yes' : 'No'} />
              </div>
              {diagResult.rawResults?.length > 0 && (
                <div className="card overflow-hidden p-0">
                  <table className="w-full">
                    <thead className="border-b border-slate-800 bg-slate-900">
                      <tr>
                        <th className="table-th">Score</th>
                        <th className="table-th">Type</th>
                        <th className="table-th">Title</th>
                        <th className="table-th">Preview</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {diagResult.rawResults.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-800/80">
                          <td className="table-td text-xs">{r.score?.toFixed(3)}</td>
                          <td className="table-td text-xs">{r.searchType}</td>
                          <td className="table-td text-xs font-medium">{r.citation?.title || '-'}</td>
                          <td className="table-td text-xs text-slate-400 max-w-xs truncate">{r.preview}...</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {(!diagResult.rawResults || diagResult.rawResults.length === 0) && (
                <p className="text-sm text-slate-400">No results found for this query.</p>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'Evaluations' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <button onClick={() => fetchEvaluations(1)} className="btn-secondary text-xs">Last Hour</button>
            <button onClick={() => fetchEvaluations(24)} className="btn-secondary text-xs">Last 24h</button>
            <button onClick={() => fetchEvaluations(168)} className="btn-secondary text-xs">Last 7 Days</button>
          </div>
          {status?.evaluations ? (
            <div className="grid gap-4 sm:grid-cols-4">
              <StatCard title="Avg Recall@K" value={status.evaluations.avgRecall ?? '-'} />
              <StatCard title="Avg Precision@K" value={status.evaluations.avgPrecision ?? '-'} />
              <StatCard title="Avg MRR" value={status.evaluations.avgMrr ?? '-'} />
              <StatCard title="Avg Latency" value={status.evaluations.avgLatencyMs ? `${status.evaluations.avgLatencyMs}ms` : '-'} />
              <div className="col-span-full">
                <p className="text-sm text-slate-400">Sample size: {status.evaluations.count} queries</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No evaluation data available yet.</p>
          )}
        </div>
      )}

      {activeTab === 'Failed Embeddings' && (
        <div className="card overflow-hidden p-0">
          {loading.failed ? (
            <div className="p-8 text-center text-slate-400">Loading...</div>
          ) : !status?.failedEmbeddings?.items?.length ? (
            <div className="p-8 text-center text-slate-400">No failed embeddings.</div>
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-800 bg-slate-900">
                <tr>
                  <th className="table-th">Article Title</th>
                  <th className="table-th">Error</th>
                  <th className="table-th">Retries</th>
                  <th className="table-th">Last Attempt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {status.failedEmbeddings.items.map(f => (
                  <tr key={f.id} className="hover:bg-slate-800/80">
                    <td className="table-td text-xs">{f.articleTitle || f.articleId || '-'}</td>
                    <td className="table-td text-xs text-red-400 max-w-md truncate">{f.error}</td>
                    <td className="table-td text-xs">{f.retryCount}</td>
                    <td className="table-td text-xs text-slate-400">{new Date(f.lastAttemptAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'Monitor' && (
        <div className="space-y-6">
          {status?.monitor ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="card">
                  <h4 className="mb-2 text-sm font-semibold text-slate-300">Embeddings</h4>
                  <div className="space-y-1 text-sm">
                    <p>Total: {status.monitor.embedding?.total || 0}</p>
                    <p>Avg Latency: {status.monitor.embedding?.avgLatencyMs || 0}ms</p>
                    <p>P95 Latency: {status.monitor.embedding?.p95LatencyMs || 0}ms</p>
                    <p>P99 Latency: {status.monitor.embedding?.p99LatencyMs || 0}ms</p>
                  </div>
                </div>
                <div className="card">
                  <h4 className="mb-2 text-sm font-semibold text-slate-300">Search</h4>
                  <div className="space-y-1 text-sm">
                    <p>Total: {status.monitor.search?.total || 0}</p>
                    <p>Avg Latency: {status.monitor.search?.avgLatencyMs || 0}ms</p>
                    <p>P95 Latency: {status.monitor.search?.p95LatencyMs || 0}ms</p>
                    <p>P99 Latency: {status.monitor.search?.p99LatencyMs || 0}ms</p>
                  </div>
                </div>
                <div className="card">
                  <h4 className="mb-2 text-sm font-semibold text-slate-300">Cache</h4>
                  <div className="space-y-1 text-sm">
                    <p>Hit Rate: {((status.monitor.cache?.hitRate || 0) * 100).toFixed(1)}%</p>
                    <p>Hits: {status.monitor.cache?.hits || 0}</p>
                    <p>Misses: {status.monitor.cache?.misses || 0}</p>
                  </div>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="card">
                  <h4 className="mb-2 text-sm font-semibold text-slate-300">Retrieval</h4>
                  <div className="space-y-1 text-sm">
                    <p>Avg Confidence: {status.monitor.retrieval?.avgConfidence?.toFixed(3) || 'N/A'}</p>
                    <p>Samples: {status.monitor.retrieval?.totalConfidenceSamples || 0}</p>
                  </div>
                </div>
                <div className="card">
                  <h4 className="mb-2 text-sm font-semibold text-slate-300">Operations</h4>
                  <div className="space-y-1 text-sm">
                    <p>Failed Embeddings: {status.monitor.operations?.failedEmbeddings || 0}</p>
                    <p>Re-index Operations: {status.monitor.operations?.reindexOperations || 0}</p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400">Loading monitor data...</p>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div className="card">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{title}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value ?? '-'}</p>
    </div>
  );
}

function ArticleIndexer({ onDone }) {
  const [articleId, setArticleId] = useState('');
  const [indexing, setIndexing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleIndex = async () => {
    if (!articleId.trim()) return;
    setIndexing(true); setError(null); setResult(null);
    try {
      const { data } = await api.post(`/admin/rag/index/article/${articleId.trim()}`);
      setResult(data.data);
      onDone?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Indexing failed');
    } finally {
      setIndexing(false);
    }
  };

  const handleDelete = async () => {
    if (!articleId.trim()) return;
    setIndexing(true); setError(null); setResult(null);
    try {
      await api.delete(`/admin/rag/index/article/${articleId.trim()}`);
      setResult({ deleted: true });
      onDone?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Delete failed');
    } finally {
      setIndexing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={articleId}
          onChange={e => setArticleId(e.target.value)}
          placeholder="Article UUID"
          className="input flex-1"
        />
        <button onClick={handleIndex} disabled={indexing} className="btn-primary text-sm">
          {indexing ? 'Indexing...' : 'Index'}
        </button>
        <button onClick={handleDelete} disabled={indexing} className="btn bg-red-600 hover:bg-red-700 text-white rounded px-3 py-2 text-sm">
          Delete Embeddings
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {result && (
        <div className="rounded bg-slate-800 p-3 text-sm">
          <pre className="text-green-400">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
