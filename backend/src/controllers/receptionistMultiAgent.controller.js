import { getOrchestrator, isMultiAgentEnabled, isShadowMode } from '../multiagent/index.js';

export async function getStatus(_req, res) {
  try {
    const status = getOrchestrator().getStatus();
    res.json({
      success: true,
      data: {
        enabled: isMultiAgentEnabled(),
        shadowMode: isShadowMode(),
        ...status,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getRecentRuns(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const runs = getOrchestrator().getRecentRuns({ limit });
    res.json({ success: true, data: { runs } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getRunsByCall(req, res) {
  try {
    const { callId } = req.params;
    const runs = await getOrchestrator().getRunsByCall(callId);
    res.json({ success: true, data: { callId, runs } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getRunTasks(req, res) {
  try {
    const { runId } = req.params;
    const tasks = await getOrchestrator().getRunTasks(runId);
    res.json({ success: true, data: { runId, tasks } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getPerformance(req, res) {
  try {
    const { from = null, to = null } = req.query;
    const performance = await getOrchestrator().getPerformance({ from, to });
    res.json({ success: true, data: performance });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
