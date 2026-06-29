/**
 * AI Tool Planner Service
 * Detects intent and builds execution plans for multi-step questions
 */

import logger from '../utils/logger.js';
import { getAvailableTools, executeTool } from './aiTools.js';
import prisma from '../utils/prisma.js';

/**
 * Intent types
 */
export const INTENT_TYPES = {
  FLEET_SUMMARY: 'FLEET_SUMMARY',
  VEHICLE_COMPARISON: 'VEHICLE_COMPARISON',
  DIAGNOSTICS: 'DIAGNOSTICS',
  PREDICTIVE_MAINTENANCE: 'PREDICTIVE_MAINTENANCE',
  BUSINESS_IMPACT: 'BUSINESS_IMPACT',
  SUPPORT_TROUBLESHOOTING: 'SUPPORT_TROUBLESHOOTING',
  REPORT_GENERATION: 'REPORT_GENERATION',
  ACTION_CONFIRMATION: 'ACTION_CONFIRMATION',
  NATURAL_QUERY: 'NATURAL_QUERY',
  VEHICLE_STATUS: 'VEHICLE_STATUS',
  MAINTENANCE_QUERY: 'MAINTENANCE_QUERY',
  PREDICTIVE_ANALYSIS: 'PREDICTIVE_ANALYSIS',
};

/**
 * Intent detection patterns
 */
const INTENT_PATTERNS = {
  [INTENT_TYPES.FLEET_SUMMARY]: [
    /summarize.*fleet/i,
    /fleet.*overview/i,
    /fleet.*health/i,
    /how.*my.*fleet/i,
    /fleet.*status/i,
  ],
  [INTENT_TYPES.VEHICLE_COMPARISON]: [
    /compare/i,
    /difference/i,
    /vs\.? /i,
    /versus/i,
  ],
  [INTENT_TYPES.DIAGNOSTICS]: [
    /diagnostic/i,
    /dtc/i,
    /error.*code/i,
    /why.*not.*working/i,
    /explain.*dtc/i,
  ],
  [INTENT_TYPES.PREDICTIVE_MAINTENANCE]: [
    /predict/i,
    /likely.*fail/i,
    /when.*need.*maintenance/i,
    /proactive/i,
    /predictive/i,
  ],
  [INTENT_TYPES.BUSINESS_IMPACT]: [
    /cost/i,
    /expense/i,
    /budget/i,
    /roi/i,
    /financial/i,
  ],
  [INTENT_TYPES.SUPPORT_TROUBLESHOOTING]: [
    /troubleshoot/i,
    /not.*working/i,
    /fix/i,
    /resolve/i,
    /help/i,
  ],
  [INTENT_TYPES.REPORT_GENERATION]: [
    /generate.*report/i,
    /create.*report/i,
    /export/i,
    /report/i,
  ],
  [INTENT_TYPES.ACTION_CONFIRMATION]: [
    /create.*work.*order/i,
    /schedule.*maintenance/i,
    /assign.*technician/i,
    /send.*email/i,
    /create.*alert/i,
  ],
  [INTENT_TYPES.VEHICLE_STATUS]: [
    /show.*vehicle/i,
    /vehicle.*status/i,
    /how.*is/i,
    /what.*about/i,
  ],
  [INTENT_TYPES.MAINTENANCE_QUERY]: [
    /maintenance/i,
    /service/i,
    /repair/i,
    /due/i,
  ],
  [INTENT_TYPES.PREDICTIVE_ANALYSIS]: [
    /which.*vehicle/i,
    /next.*fail/i,
    /risk/i,
    /priority/i,
  ],
};

/**
 * Detect intent from message
 */
export async function detectIntent(message) {
  try {
    const lowerMessage = message.toLowerCase();

    for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(lowerMessage)) {
          logger.info('Intent matched', { intent, pattern });
          return { type: intent, confidence: 0.9 };
        }
      }
    }

    // Default to natural query if no pattern matches
    logger.info('No intent matched, defaulting to NATURAL_QUERY');
    return { type: INTENT_TYPES.NATURAL_QUERY, confidence: 0.5 };
  } catch (error) {
    logger.error('Error detecting intent', { error: error.message });
    return { type: INTENT_TYPES.NATURAL_QUERY, confidence: 0.3 };
  }
}

/**
 * Build execution plan based on intent and entities
 */
export async function buildExecutionPlan(intent, entities, userId) {
  try {
    const plan = {
      intent: intent.type,
      steps: [],
      estimatedDuration: 0,
    };

    switch (intent.type) {
      case INTENT_TYPES.FLEET_SUMMARY:
        plan.steps = buildFleetSummaryPlan(entities);
        break;
      case INTENT_TYPES.VEHICLE_COMPARISON:
        plan.steps = buildVehicleComparisonPlan(entities);
        break;
      case INTENT_TYPES.DIAGNOSTICS:
        plan.steps = buildDiagnosticsPlan(entities);
        break;
      case INTENT_TYPES.PREDICTIVE_MAINTENANCE:
        plan.steps = buildPredictiveMaintenancePlan(entities);
        break;
      case INTENT_TYPES.BUSINESS_IMPACT:
        plan.steps = buildBusinessImpactPlan(entities);
        break;
      case INTENT_TYPES.SUPPORT_TROUBLESHOOTING:
        plan.steps = buildTroubleshootingPlan(entities);
        break;
      case INTENT_TYPES.REPORT_GENERATION:
        plan.steps = buildReportGenerationPlan(entities);
        break;
      case INTENT_TYPES.ACTION_CONFIRMATION:
        plan.steps = buildActionConfirmationPlan(entities);
        break;
      case INTENT_TYPES.VEHICLE_STATUS:
        plan.steps = buildVehicleStatusPlan(entities);
        break;
      case INTENT_TYPES.MAINTENANCE_QUERY:
        plan.steps = buildMaintenanceQueryPlan(entities);
        break;
      case INTENT_TYPES.PREDICTIVE_ANALYSIS:
        plan.steps = buildPredictiveAnalysisPlan(entities);
        break;
      default:
        plan.steps = buildNaturalQueryPlan(entities);
    }

    plan.estimatedDuration = plan.steps.length * 500; // 500ms per step

    logger.info('Execution plan built', { intent: intent.type, stepCount: plan.steps.length });

    return plan;
  } catch (error) {
    logger.error('Error building execution plan', { intent, error: error.message });
    throw error;
  }
}

/**
 * Build fleet summary plan
 */
function buildFleetSummaryPlan(entities) {
  return [
    {
      tool: 'get_fleet_health',
      description: 'Get fleet health score',
      params: {},
    },
    {
      tool: 'get_vehicle_count',
      description: 'Get total vehicle count',
      params: {},
    },
    {
      tool: 'get_active_alerts',
      description: 'Get active alerts',
      params: { limit: 10 },
    },
    {
      tool: 'get_pending_maintenance',
      description: 'Get pending maintenance items',
      params: {},
    },
  ];
}

/**
 * Build vehicle comparison plan
 */
function buildVehicleComparisonPlan(entities) {
  const steps = [];

  if (entities.vehicles && entities.vehicles.length >= 2) {
    entities.vehicles.forEach(vehicle => {
      steps.push({
        tool: 'get_vehicle_status',
        description: `Get status for ${vehicle}`,
        params: { vehicleId: vehicle.id },
      });
    });
  } else if (entities.vehicles && entities.vehicles.length === 1) {
    steps.push({
      tool: 'get_vehicle_status',
      description: `Get status for ${entities.vehicles[0].name}`,
      params: { vehicleId: entities.vehicles[0].id },
    });
  }

  return steps;
}

/**
 * Build diagnostics plan
 */
function buildDiagnosticsPlan(entities) {
  const steps = [];

  if (entities.vehicles && entities.vehicles.length > 0) {
    entities.vehicles.forEach(vehicle => {
      steps.push({
        tool: 'get_dtc_codes',
        description: `Get DTC codes for ${vehicle.name}`,
        params: { vehicleId: vehicle.id },
      });
    });
  }

  steps.push({
    tool: 'get_latest_telemetry',
    description: 'Get latest telemetry',
    params: entities.vehicles && entities.vehicles.length > 0 
      ? { vehicleId: entities.vehicles[0].id }
      : {},
  });

  return steps;
}

/**
 * Build predictive maintenance plan
 */
function buildPredictiveMaintenancePlan(entities) {
  return [
    {
      tool: 'get_predictions',
      description: 'Get AI predictions',
      params: entities.vehicles && entities.vehicles.length > 0
        ? { vehicleId: entities.vehicles[0].id }
        : {},
    },
    {
      tool: 'get_maintenance_schedule',
      description: 'Get maintenance schedule',
      params: {},
    },
  ];
}

/**
 * Build business impact plan
 */
function buildBusinessImpactPlan(entities) {
  return [
    {
      tool: 'get_business_analytics',
      description: 'Get business analytics',
      params: { days: 30 },
    },
    {
      tool: 'get_cost_analysis',
      description: 'Get cost analysis',
      params: { days: 30 },
    },
  ];
}

/**
 * Build troubleshooting plan
 */
function buildTroubleshootingPlan(entities) {
  return [
    {
      tool: 'search_knowledge_base',
      description: 'Search knowledge base',
      params: { query: entities.issue || 'troubleshooting' },
    },
    {
      tool: 'get_vehicle_status',
      description: 'Get vehicle status',
      params: entities.vehicles && entities.vehicles.length > 0
        ? { vehicleId: entities.vehicles[0].id }
        : {},
    },
  ];
}

/**
 * Build report generation plan
 */
function buildReportGenerationPlan(entities) {
  const reportType = entities.reportType || 'fleet';
  return [
    {
      tool: 'generate_report',
      description: `Generate ${reportType} report`,
      params: { type: reportType, days: entities.days || 30 },
    },
  ];
}

/**
 * Build action confirmation plan
 */
function buildActionConfirmationPlan(entities) {
  return [
    {
      tool: 'prepare_action',
      description: 'Prepare action for confirmation',
      params: {
        actionType: entities.actionType,
        vehicleId: entities.vehicles?.[0]?.id,
        details: entities.details,
      },
    },
  ];
}

/**
 * Build vehicle status plan
 */
function buildVehicleStatusPlan(entities) {
  const steps = [];

  if (entities.vehicles && entities.vehicles.length > 0) {
    entities.vehicles.forEach(vehicle => {
      steps.push({
        tool: 'get_vehicle_status',
        description: `Get status for ${vehicle.name}`,
        params: { vehicleId: vehicle.id },
      });
    });
  } else {
    steps.push({
      tool: 'get_all_vehicles',
      description: 'Get all vehicles',
      params: {},
    });
  }

  return steps;
}

/**
 * Build maintenance query plan
 */
function buildMaintenanceQueryPlan(entities) {
  const steps = [
    {
      tool: 'get_maintenance_logs',
      description: 'Get maintenance logs',
      params: { completed: false },
    },
  ];

  if (entities.vehicles && entities.vehicles.length > 0) {
    entities.vehicles.forEach(vehicle => {
      steps.push({
        tool: 'get_vehicle_maintenance',
        description: `Get maintenance for ${vehicle.name}`,
        params: { vehicleId: vehicle.id },
      });
    });
  }

  return steps;
}

/**
 * Build predictive analysis plan
 */
function buildPredictiveAnalysisPlan(entities) {
  return [
    {
      tool: 'get_all_predictions',
      description: 'Get all predictions',
      params: {},
    },
    {
      tool: 'get_health_scores',
      description: 'Get health scores',
      params: {},
    },
  ];
}

/**
 * Build natural query plan
 */
function buildNaturalQueryPlan(entities) {
  // This will be handled by aiNaturalQuery.js
  return [
    {
      tool: 'natural_query',
      description: 'Execute natural language query',
      params: entities,
    },
  ];
}

/**
 * Execute plan
 */
export async function executePlan(plan, userId, vehicleContext = null) {
  try {
    const results = [];
    const availableTools = getAvailableTools();

    for (const step of plan.steps) {
      const tool = availableTools.find(t => t.name === step.tool);
      
      if (!tool) {
        logger.warn('Tool not found', { tool: step.tool });
        results.push({
          success: false,
          tool: step.tool,
          error: 'Tool not found',
        });
        continue;
      }

      try {
        const toolParams = { ...step.params, userId, vehicleContext };
        const result = await executeTool(tool.name, toolParams);
        
        results.push({
          success: true,
          tool: step.tool,
          data: result,
          description: step.description,
        });

        logger.info('Tool executed successfully', { tool: step.tool });
      } catch (error) {
        logger.error('Tool execution failed', { tool: step.tool, error: error.message });
        results.push({
          success: false,
          tool: step.tool,
          error: error.message,
        });
      }
    }

    return results;
  } catch (error) {
    logger.error('Error executing plan', { error: error.message });
    throw error;
  }
}
