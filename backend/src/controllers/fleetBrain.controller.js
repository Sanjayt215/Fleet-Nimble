import { getFleetBrain } from '../fleetBrain/fleetBrain.service.js';
import * as memoryEngine from '../fleetBrain/memoryEngine.service.js';
import * as decisionEngine from '../fleetBrain/decisionEngine.service.js';
import * as workflowEngine from '../fleetBrain/workflowEngine.service.js';
import * as businessIntelligence from '../fleetBrain/businessIntelligence.service.js';
import * as selfOptimization from '../fleetBrain/selfOptimization.service.js';
import * as skills from '../fleetBrain/aiSkills.service.js';
import * as planner from '../fleetBrain/planner.service.js';
import * as fleetIntelligence from '../fleetBrain/fleetIntelligence.service.js';

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}

export async function getDashboard(req, res) {
  const { limit = 20 } = req.query;
  const brain = getFleetBrain();
  if (!brain.isEnabled()) {
    return res.status(200).json({ success: true, data: { enabled: false, message: 'Fleet Brain is disabled' } });
  }
  const dashboard = await brain.getDashboard(req.user.id, { limit: parseInt(limit, 10) || 20 });
  res.json({ success: true, data: dashboard });
}

export async function getContext(req, res) {
  const brain = getFleetBrain();
  if (!brain.isEnabled()) return badRequest(res, 'Fleet Brain is disabled');
  const context = await brain.getContext(req.user.id, { force: false });
  res.json({ success: true, data: context });
}

export async function getMemory(req, res) {
  const { scope, key, limit = 50 } = req.query;
  const brain = getFleetBrain();
  if (!brain.isEnabled()) return badRequest(res, 'Fleet Brain is disabled');
  const memories = await memoryEngine.recallAll({
    userId: req.user.id,
    scope: scope || null,
    customerId: null,
  });
  res.json({ success: true, data: memories.slice(0, parseInt(limit, 10) || 50) });
}

export async function getPlans(req, res) {
  const { intent, limit = 20 } = req.query;
  const brain = getFleetBrain();
  if (!brain.isEnabled()) return badRequest(res, 'Fleet Brain is disabled');
  const plans = planner.getRecentPlans
    ? planner.getRecentPlans({ userId: req.user.id, limit: parseInt(limit, 10) || 20, intent: intent || null })
    : [];
  res.json({ success: true, data: plans });
}

export async function getWorkflows(req, res) {
  const { limit = 20, status } = req.query;
  const brain = getFleetBrain();
  if (!brain.isEnabled()) return badRequest(res, 'Fleet Brain is disabled');
  const workflows = await workflowEngine.getWorkflowRuns(req.user.id, {
    limit: parseInt(limit, 10) || 20,
    status: status || null,
  });
  res.json({ success: true, data: workflows });
}

export async function getWorkflowById(req, res) {
  const { runId } = req.params;
  const brain = getFleetBrain();
  if (!brain.isEnabled()) return badRequest(res, 'Fleet Brain is disabled');
  const workflow = await workflowEngine.getWorkflowRunById(req.user.id, runId);
  if (!workflow) {
    return res.status(404).json({ success: false, message: 'Workflow run not found' });
  }
  res.json({ success: true, data: workflow });
}

export async function getInsights(req, res) {
  const { days = 30 } = req.query;
  const brain = getFleetBrain();
  if (!brain.isEnabled()) return badRequest(res, 'Fleet Brain is disabled');
  const snapshot = await businessIntelligence.getBusinessIntelligenceSnapshot(req.user.id, { days: parseInt(days, 10) || 30 });
  res.json({ success: true, data: snapshot });
}

export async function generateInsights(req, res) {
  const { days = 30 } = req.body || {};
  const brain = getFleetBrain();
  if (!brain.isEnabled()) return badRequest(res, 'Fleet Brain is disabled');
  const result = await brain.generateInsights(req.user.id, { days: parseInt(days, 10) || 30 });
  res.json({ success: true, data: result });
}

export async function getLearnings(req, res) {
  const { limit = 25, type } = req.query;
  const brain = getFleetBrain();
  if (!brain.isEnabled()) return badRequest(res, 'Fleet Brain is disabled');
  const learnings = await selfOptimization.getLearnings(req.user.id, {
    limit: parseInt(limit, 10) || 25,
    type: type || null,
  });
  res.json({ success: true, data: learnings });
}

export async function applyRecommendation(req, res) {
  const { id } = req.params;
  const brain = getFleetBrain();
  if (!brain.isEnabled()) return badRequest(res, 'Fleet Brain is disabled');
  const applied = await selfOptimization.applyRecommendation(req.user.id, id);
  if (!applied) {
    return res.status(404).json({ success: false, message: 'Learning not found or not applicable' });
  }
  res.json({ success: true, data: applied });
}

export async function getSkills(_req, res) {
  res.json({ success: true, data: { skills: skills.listSkills(), count: skills.getSkillCount() } });
}

export async function getDecisions(req, res) {
  const { limit = 25 } = req.query;
  res.json({ success: true, data: decisionEngine.getRecentDecisions(req.user.id, { limit: parseInt(limit, 10) || 25 }) });
}

export async function getToolCapabilities(_req, res) {
  res.json({ success: true, data: decisionEngine.getToolCapabilities() });
}

export async function answerFleetQuery(req, res) {
  const { query } = req.params;
  if (!query || !query.trim()) return badRequest(res, 'Query is required');
  const brain = getFleetBrain();
  if (!brain.isEnabled()) return badRequest(res, 'Fleet Brain is disabled');
  const answer = await brain.answerFleetQuery(req.user.id, query);
  res.json({ success: true, data: answer });
}

export async function getFleetKpis(req, res) {
  const { days = 30 } = req.query;
  const brain = getFleetBrain();
  if (!brain.isEnabled()) return badRequest(res, 'Fleet Brain is disabled');
  const kpis = await brain.getFleetKpis(req.user.id, { days: parseInt(days, 10) || 30 });
  res.json({ success: true, data: kpis });
}
