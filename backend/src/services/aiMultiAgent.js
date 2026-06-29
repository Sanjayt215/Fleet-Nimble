/**
 * AI Multi-Agent Architecture
 * Specialized agents for different fleet operations
 * Each agent has specific capabilities and expertise
 */

import logger from '../utils/logger.js';
import { calculateFleetHealthScore } from './aiAnalysisEngine.js';
import { getMaintenanceAIAnalysis } from './aiMaintenanceAI.js';
import { getAllPredictions } from './aiPredictions.js';
import { getSupportResponse } from './aiSupportService.js';
import { generateExecutiveReport } from './aiExecutiveReports.js';
import { getBusinessAnalytics } from './aiBusinessAnalytics.js';

/**
 * Agent definitions
 */
export const AGENTS = {
  FLEET: {
    name: 'Fleet Agent',
    description: 'Specializes in fleet-wide operations, health monitoring, and overall fleet management',
    capabilities: [
      'Fleet health analysis',
      'Vehicle status monitoring',
      'Fleet utilization tracking',
      'Fleet availability assessment',
      'Fleet-wide alerts',
      'Vehicle assignment',
    ],
  },
  MAINTENANCE: {
    name: 'Maintenance Agent',
    description: 'Specializes in maintenance scheduling, prioritization, and cost estimation',
    capabilities: [
      'Maintenance scheduling',
      'Work order generation',
      'Service ticket creation',
      'Technician assignment',
      'Maintenance cost estimation',
      'Maintenance reminders',
    ],
  },
  DIAGNOSTICS: {
    name: 'Diagnostics Agent',
    description: 'Specializes in vehicle diagnostics, DTC analysis, and troubleshooting',
    capabilities: [
      'DTC code analysis',
      'Diagnostic troubleshooting',
      'Root cause analysis',
      'Component health assessment',
      'Diagnostic report generation',
    ],
  },
  SUPPORT: {
    name: 'Support Agent',
    description: 'Specializes in customer support, platform help, and user guidance',
    capabilities: [
      'Platform guidance',
      'Troubleshooting assistance',
      'Step-by-step instructions',
      'FAQ responses',
      'User onboarding',
    ],
  },
  REPORTING: {
    name: 'Reporting Agent',
    description: 'Specializes in report generation, data export, and analytics',
    capabilities: [
      'Executive reports',
      'Maintenance reports',
      'Fuel reports',
      'Trip reports',
      'Business analytics',
      'Report export',
    ],
  },
  PREDICTION: {
    name: 'Prediction Agent',
    description: 'Specializes in predictive analytics, failure prediction, and risk assessment',
    capabilities: [
      'Battery failure prediction',
      'Coolant failure prediction',
      'Brake wear prediction',
      'Tyre replacement prediction',
      'Engine overheating prediction',
      'Maintenance prediction',
    ],
  },
};

/**
 * Route query to appropriate agent
 */
export function routeToAgent(query) {
  const lowerQuery = query.toLowerCase();

  // Fleet Agent keywords
  if (lowerQuery.includes('fleet') || 
      lowerQuery.includes('all vehicles') || 
      lowerQuery.includes('fleet health') ||
      lowerQuery.includes('fleet status') ||
      lowerQuery.includes('assign vehicle') ||
      lowerQuery.includes('vehicle availability')) {
    return AGENTS.FLEET;
  }

  // Maintenance Agent keywords
  if (lowerQuery.includes('maintenance') || 
      lowerQuery.includes('service') || 
      lowerQuery.includes('work order') ||
      lowerQuery.includes('service ticket') ||
      lowerQuery.includes('technician') ||
      lowerQuery.includes('repair')) {
    return AGENTS.MAINTENANCE;
  }

  // Diagnostics Agent keywords
  if (lowerQuery.includes('diagnostic') || 
      lowerQuery.includes('dtc') || 
      lowerQuery.includes('trouble code') ||
      lowerQuery.includes('check engine') ||
      lowerQuery.includes('root cause') ||
      lowerQuery.includes('troubleshoot')) {
    return AGENTS.DIAGNOSTICS;
  }

  // Support Agent keywords
  if (lowerQuery.includes('how to') || 
      lowerQuery.includes('help') || 
      lowerQuery.includes('guide') ||
      lowerQuery.includes('tutorial') ||
      lowerQuery.includes('explain') ||
      lowerQuery.includes('support')) {
    return AGENTS.SUPPORT;
  }

  // Reporting Agent keywords
  if (lowerQuery.includes('report') || 
      lowerQuery.includes('analytics') || 
      lowerQuery.includes('export') ||
      lowerQuery.includes('summary') ||
      lowerQuery.includes('business impact') ||
      lowerQuery.includes('kpi')) {
    return AGENTS.REPORTING;
  }

  // Prediction Agent keywords
  if (lowerQuery.includes('predict') || 
      lowerQuery.includes('forecast') || 
      lowerQuery.includes('failure') ||
      lowerQuery.includes('risk') ||
      lowerQuery.includes('wear') ||
      lowerQuery.includes('overheat')) {
    return AGENTS.PREDICTION;
  }

  // Default to Fleet Agent
  return AGENTS.FLEET;
}

/**
 * Execute agent-specific task
 */
export async function executeAgentTask(agent, task, params) {
  try {
    logger.info('Executing agent task', { agent: agent.name, task, params });

    switch (agent.name) {
      case AGENTS.FLEET.name:
        return await executeFleetAgentTask(task, params);
      case AGENTS.MAINTENANCE.name:
        return await executeMaintenanceAgentTask(task, params);
      case AGENTS.DIAGNOSTICS.name:
        return await executeDiagnosticsAgentTask(task, params);
      case AGENTS.SUPPORT.name:
        return await executeSupportAgentTask(task, params);
      case AGENTS.REPORTING.name:
        return await executeReportingAgentTask(task, params);
      case AGENTS.PREDICTION.name:
        return await executePredictionAgentTask(task, params);
      default:
        throw new Error(`Unknown agent: ${agent.name}`);
    }
  } catch (error) {
    logger.error('Error executing agent task', { agent: agent.name, task, error: error.message });
    throw error;
  }
}

/**
 * Fleet Agent tasks
 */
async function executeFleetAgentTask(task, params) {
  switch (task) {
    case 'fleet_health':
      return await calculateFleetHealthScore(params.userId);
    case 'fleet_status':
      return await calculateFleetHealthScore(params.userId);
    case 'assign_vehicle':
      return { message: 'Vehicle assignment requires confirmation', actionRequired: true };
    default:
      throw new Error(`Unknown Fleet Agent task: ${task}`);
  }
}

/**
 * Maintenance Agent tasks
 */
async function executeMaintenanceAgentTask(task, params) {
  switch (task) {
    case 'maintenance_analysis':
      return await getMaintenanceAIAnalysis(params.userId);
    case 'schedule_maintenance':
      return { message: 'Maintenance scheduling requires confirmation', actionRequired: true };
    case 'generate_work_order':
      return { message: 'Work order generation requires confirmation', actionRequired: true };
    default:
      throw new Error(`Unknown Maintenance Agent task: ${task}`);
  }
}

/**
 * Diagnostics Agent tasks
 */
async function executeDiagnosticsAgentTask(task, params) {
  switch (task) {
    case 'vehicle_diagnostics':
      return await getAllPredictions(params.vehicleId);
    case 'dtc_analysis':
      return { message: 'DTC analysis requires vehicle ID', vehicleIdRequired: true };
    case 'root_cause':
      return { message: 'Root cause analysis requires symptoms and DTC codes', detailsRequired: true };
    default:
      throw new Error(`Unknown Diagnostics Agent task: ${task}`);
  }
}

/**
 * Support Agent tasks
 */
async function executeSupportAgentTask(task, params) {
  switch (task) {
    case 'support_query':
      return await getSupportResponse(params.query);
    case 'troubleshoot':
      return await getSupportResponse(params.query);
    case 'guide':
      return await getSupportResponse(params.query);
    default:
      throw new Error(`Unknown Support Agent task: ${task}`);
  }
}

/**
 * Reporting Agent tasks
 */
async function executeReportingAgentTask(task, params) {
  switch (task) {
    case 'executive_report':
      return await generateExecutiveReport(params.userId);
    case 'business_analytics':
      return await getBusinessAnalytics(params.userId, params.days || 30);
    case 'export_report':
      return { message: 'Report export requires confirmation', actionRequired: true };
    default:
      throw new Error(`Unknown Reporting Agent task: ${task}`);
  }
}

/**
 * Prediction Agent tasks
 */
async function executePredictionAgentTask(task, params) {
  switch (task) {
    case 'predict_failures':
      return await getAllPredictions(params.vehicleId);
    case 'battery_prediction':
      const predictions = await getAllPredictions(params.vehicleId);
      return predictions.battery;
    case 'coolant_prediction':
      const allPredictions = await getAllPredictions(params.vehicleId);
      return allPredictions.coolant;
    default:
      throw new Error(`Unknown Prediction Agent task: ${task}`);
  }
}

/**
 * Multi-agent collaboration
 * Multiple agents work together on complex queries
 */
export async function multiAgentCollaboration(query, params) {
  const agents = [];
  const tasks = [];

  // Determine which agents are needed based on query
  const lowerQuery = query.toLowerCase();

  if (lowerQuery.includes('fleet') && lowerQuery.includes('maintenance')) {
    agents.push(AGENTS.FLEET, AGENTS.MAINTENANCE);
    tasks.push('fleet_health', 'maintenance_analysis');
  } else if (lowerQuery.includes('predict') && lowerQuery.includes('report')) {
    agents.push(AGENTS.PREDICTION, AGENTS.REPORTING);
    tasks.push('predict_failures', 'executive_report');
  } else if (lowerQuery.includes('diagnostic') && lowerQuery.includes('maintenance')) {
    agents.push(AGENTS.DIAGNOSTICS, AGENTS.MAINTENANCE);
    tasks.push('vehicle_diagnostics', 'maintenance_analysis');
  } else {
    // Default single agent
    const agent = routeToAgent(query);
    agents.push(agent);
    tasks.push(params.task || 'default');
  }

  // Execute tasks in parallel
  const results = await Promise.all(
    agents.map((agent, index) => executeAgentTask(agent, tasks[index], params))
  );

  return {
    agents: agents.map(a => a.name),
    tasks,
    results,
    collaboration: agents.length > 1,
  };
}

/**
 * Get agent capabilities
 */
export function getAgentCapabilities(agentName) {
  const agent = Object.values(AGENTS).find(a => a.name === agentName);
  return agent ? agent.capabilities : [];
}

/**
 * Get all agents
 */
export function getAllAgents() {
  return Object.values(AGENTS);
}

/**
 * Agent handoff
 * Transfer context from one agent to another
 */
export function agentHandoff(fromAgent, toAgent, context) {
  logger.info('Agent handoff', { from: fromAgent.name, to: toAgent.name });

  return {
    fromAgent: fromAgent.name,
    toAgent: toAgent.name,
    context,
    handoffTimestamp: new Date().toISOString(),
  };
}

/**
 * Agent context sharing
 */
export function shareAgentContext(agent, contextData) {
  logger.info('Agent context shared', { agent: agent.name });

  return {
    agent: agent.name,
    contextData,
    sharedAt: new Date().toISOString(),
  };
}

/**
 * Agent performance tracking
 */
const agentPerformance = new Map();

export function trackAgentPerformance(agentName, task, duration, success) {
  if (!agentPerformance.has(agentName)) {
    agentPerformance.set(agentName, {
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      averageDuration: 0,
      totalDuration: 0,
    });
  }

  const perf = agentPerformance.get(agentName);
  perf.totalTasks++;
  perf.totalDuration += duration;
  perf.averageDuration = perf.totalDuration / perf.totalTasks;

  if (success) {
    perf.successfulTasks++;
  } else {
    perf.failedTasks++;
  }

  agentPerformance.set(agentName, perf);
}

/**
 * Get agent performance metrics
 */
export function getAgentPerformance(agentName) {
  return agentPerformance.get(agentName) || null;
}

/**
 * Get all agent performance metrics
 */
export function getAllAgentPerformance() {
  const metrics = {};
  for (const [agentName, perf] of agentPerformance.entries()) {
    metrics[agentName] = perf;
  }
  return metrics;
}
