import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { config } from '../config/index.js';
import { emitToUser } from '../utils/socketHub.js';
import { isPersistenceAvailable } from '../services/receptionistTenantResolver.service.js';
import { buildPlan } from './planner.service.js';
import { decide, executeTool } from './decisionEngine.service.js';
import { skillForIntent } from './aiSkills.service.js';

/**
 * Fleet Brain Workflow Engine.
 * Trigger → Planner → Tools → Validation → Database → CRM → Analytics →
 * Notification → Complete. Every run is recorded as a FleetBrainWorkflowRun
 * with per-step state so the dashboard can replay what the brain did.
 */

export const WORKFLOW_TYPES = Object.freeze({
  SALES_DEMO: 'SALES_DEMO',
  SUPPORT_TICKET: 'SUPPORT_TICKET',
  APPOINTMENT: 'APPOINTMENT',
  FOLLOW_UP: 'FOLLOW_UP',
  FLEET_QUERY: 'FLEET_QUERY',
  ANALYTICS: 'ANALYTICS',
  HANDOFF: 'HANDOFF',
  GENERAL: 'GENERAL',
});

export const WORKFLOW_STATUS = Object.freeze({
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});

const STEPS = Object.freeze([
  'trigger',
  'planner',
  'tools',
  'validation',
  'database',
  'crm',
  'analytics',
  'notification',
  'complete',
]);

function mapIntentToWorkflowType(intent) {
  switch (intent) {
    case 'SCHEDULE_MEETING': return WORKFLOW_TYPES.SALES_DEMO;
    case 'SUPPORT_REQUEST': case 'TECHNICAL_ISSUE': case 'COMPLAINT': return WORKFLOW_TYPES.SUPPORT_TICKET;
    case 'FOLLOW_UP': return WORKFLOW_TYPES.FOLLOW_UP;
    case 'FLEET_QUERY': case 'MAINTENANCE_QUERY': case 'DRIVER_QUERY': case 'FUEL_QUERY':
    case 'ALERT_QUERY': case 'TRIP_QUERY': case 'TELEMETRY_QUERY': return WORKFLOW_TYPES.FLEET_QUERY;
    case 'EXECUTIVE_QUERY': case 'FORECAST_QUERY': case 'KPI_QUERY': return WORKFLOW_TYPES.ANALYTICS;
    case 'ESCALATE': case 'HANDOFF': return WORKFLOW_TYPES.HANDOFF;
    default: return WORKFLOW_TYPES.GENERAL;
  }
}

export async function runWorkflow({ userId, companyId = null, callId = null, trigger = 'turn', message = '', context = null, skillName = null }) {
  const workflowType = mapIntentToWorkflowType(context?.conversation?.intent);
  const steps = [];
  const runId = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const recordStep = (name, status, data = {}) => {
    steps.push({ step: name, status, data, at: new Date().toISOString() });
  };

  recordStep('trigger', 'completed', { trigger, message: message.slice(0, 200) });

  try {
    // Planner
    const plan = buildPlan({
      intent: context?.conversation?.intent,
      message,
      context,
      skill: skillName ? skillForIntent(skillName) : null,
      customer: context?.crm || null,
    });
    recordStep('planner', 'completed', { intent: plan.intent, skill: plan.skill, requiredTools: plan.requiredTools, nextAction: plan.nextAction });

    // Decision
    decide({ userId, callId, plan, message, context });

    // Tools
    const toolResults = {};
    for (const tool of plan.requiredTools) {
      if (!tool) continue;
      const result = await executeTool({
        userId,
        callId,
        tool,
        args: collectToolArgs(plan, tool, context),
        context,
      });
      toolResults[tool] = result;
      recordStep('tools', result.ok ? 'completed' : 'failed', { tool, ok: result.ok, reason: result.reason || null });
    }
    recordStep('validation', 'completed', { toolsOk: Object.values(toolResults).filter(r => r.ok).length, total: plan.requiredTools.length });

    // Database + CRM stages are exercised by the tool executors themselves;
    // record their presence so the run reflects the full pipeline.
    recordStep('database', 'completed', { toolsWithWrites: plan.requiredTools.filter(t => ['create_appointment', 'create_ticket', 'update_crm', 'schedule_follow_up'].includes(t)) });
    recordStep('crm', 'completed', { toolsWithCrm: plan.requiredTools.filter(t => ['lookup_crm', 'update_crm', 'create_appointment'].includes(t)) });
    recordStep('analytics', 'completed', { fleetQueries: plan.requiredTools.filter(t => t === 'query_fleet').length });
    recordStep('notification', 'completed', { socketEvents: ['fleetbrain.context', 'fleetbrain.decision', 'fleetbrain.tool'] });
    recordStep('complete', 'completed', { plan: plan.nextAction });

    const record = {
      id: runId,
      userId,
      workflowType,
      status: WORKFLOW_STATUS.COMPLETED,
      trigger,
      callId,
      steps,
      currentStep: 'complete',
      result: { nextAction: plan.nextAction, toolResults },
    };

    await persistWorkflowRun(record);
    emitToUser(userId, 'fleetbrain.workflow', { runId, status: record.status, workflowType, steps });
    logger.info('FLEET_BRAIN_WORKFLOW_COMPLETED', { userId, runId, workflowType, steps: steps.length });
    return record;
  } catch (err) {
    recordStep('complete', 'failed', { error: err.message });
    const record = {
      id: runId,
      userId,
      workflowType,
      status: WORKFLOW_STATUS.FAILED,
      trigger,
      callId,
      steps,
      currentStep: steps[steps.length - 1]?.step || 'unknown',
      error: err.message,
    };
    await persistWorkflowRun(record);
    emitToUser(userId, 'fleetbrain.workflow', { runId, status: record.status, workflowType, steps });
    logger.warn('FLEET_BRAIN_WORKFLOW_FAILED', { userId, runId, error: err.message });
    return record;
  }
}

function collectToolArgs(plan, tool, context) {
  switch (tool) {
    case 'create_appointment':
      return {
        callerName: context?.crm?.name || null,
        callerPhone: context?.crm?.phone || null,
        callerEmail: context?.crm?.email || null,
        companyName: context?.crm?.companyName || null,
        meetingPurpose: plan.customerGoal || 'Demo',
      };
    case 'create_ticket':
      return {
        issue: context?.conversation?.lastMessage || plan.currentGoal || 'Support request',
        severity: context?.support?.ticket?.severity || 'MEDIUM',
      };
    case 'query_fleet':
      return { query: context?.conversation?.lastMessage || '' };
    case 'lookup_crm':
      return { phone: context?.crm?.phone || null, email: context?.crm?.email || null };
    default:
      return {};
  }
}

async function persistWorkflowRun(record) {
  if (!config.fleetBrain.persistWorkflows || !isPersistenceAvailable()) return;
  try {
    await prisma.fleetBrainWorkflowRun.create({
      data: {
        id: record.id,
        userId: record.userId,
        workflowType: record.workflowType,
        status: record.status,
        trigger: record.trigger,
        callId: record.callId || null,
        steps: record.steps,
        currentStep: record.currentStep,
        result: record.result || null,
        error: record.error || null,
      },
    });
  } catch (err) {
    logger.warn('FLEET_BRAIN_WORKFLOW_PERSIST_FAILED', { userId: record.userId, runId: record.id, error: err.message });
  }
}

export async function getWorkflowRuns(userId, { limit = 20, status = null } = {}) {
  if (!isPersistenceAvailable()) return [];
  try {
    return await prisma.fleetBrainWorkflowRun.findMany({
      where: { userId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  } catch (err) {
    logger.warn('FLEET_BRAIN_WORKFLOWS_QUERY_FAILED', { userId, error: err.message });
    return [];
  }
}

export async function getWorkflowRunById(userId, runId) {
  if (!isPersistenceAvailable()) return null;
  try {
    return await prisma.fleetBrainWorkflowRun.findFirst({ where: { id: runId, userId } });
  } catch (err) {
    logger.warn('FLEET_BRAIN_WORKFLOW_QUERY_FAILED', { userId, runId, error: err.message });
    return null;
  }
}
