/**
 * AI Orchestrator Service
 * Intelligently orchestrates AI services to answer user questions
 * - Detects intent
 * - Extracts entities
 * - Builds execution plan
 * - Calls required tools
 * - Combines results
 * - Formats professional answers
 * - Saves conversation memory
 */

import logger from '../utils/logger.js';
import { detectIntent } from './aiToolPlanner.js';
import { extractEntities } from './aiNaturalQuery.js';
import { buildExecutionPlan } from './aiToolPlanner.js';
import { executePlan } from './aiToolPlanner.js';
import { formatResponse } from './aiResponseFormatter.js';
import { saveConversationContext, getConversationContext, resolvePronouns } from './aiConversationMemory.js';
import { generateSuggestedActions } from './aiResponseFormatter.js';

/**
 * Main orchestrator function
 */
export async function orchestrateAI(userId, message, vehicleContext = null) {
  logger.info('AI_ORCHESTRATOR_START', { userId, message });
  
  try {
    // Step 1: Resolve pronouns using conversation context
    let resolvedMessage;
    try {
      resolvedMessage = await resolvePronouns(userId, message, vehicleContext);
      logger.info('AI_PRONOUN_RESOLUTION_COMPLETE');
    } catch (error) {
      logger.error('AI_FAILED_AT_PRONOUN_RESOLUTION', { error: error.message, stack: error.stack });
      resolvedMessage = message;
    }

    // Step 2: Detect intent
    let intent;
    try {
      intent = await detectIntent(resolvedMessage);
      logger.info('AI_INTENT_DETECTED', { intent: intent?.type });
    } catch (error) {
      logger.error('AI_FAILED_AT_INTENT_DETECTION', { error: error.message, stack: error.stack });
      intent = { type: 'GENERAL', confidence: 0.5 };
    }

    // Step 3: Extract entities
    let entities;
    try {
      entities = await extractEntities(resolvedMessage, userId);
      logger.info('AI_ENTITIES_EXTRACTED');
    } catch (error) {
      logger.error('AI_FAILED_AT_ENTITY_EXTRACTION', { error: error.message, stack: error.stack });
      entities = { vehicles: [], metrics: [], timeframes: [] };
    }

    // Step 4: Build execution plan
    let plan;
    try {
      plan = await buildExecutionPlan(intent, entities, userId);
      logger.info('AI_PLANNER_COMPLETE');
    } catch (error) {
      logger.error('AI_FAILED_AT_PLANNER', { error: error.message, stack: error.stack });
      plan = { steps: [], estimatedDuration: 0 };
    }

    // Step 5: Execute plan
    let results;
    try {
      results = await executePlan(plan, userId, vehicleContext);
      logger.info('AI_PLAN_EXECUTION_COMPLETE');
    } catch (error) {
      logger.error('AI_FAILED_AT_PLAN_EXECUTION', { error: error.message, stack: error.stack });
      results = [];
    }

    // Step 6: Combine results
    let combinedResults;
    try {
      combinedResults = combineResults(results, intent);
    } catch (error) {
      logger.error('AI_FAILED_AT_RESULTS_COMBINATION', { error: error.message, stack: error.stack });
      combinedResults = { data: [], summary: {}, metadata: {} };
    }

    // Step 7: Format response
    let formattedResponse;
    try {
      formattedResponse = await formatResponse(combinedResults, intent, entities);
      logger.info('AI_FORMATTER_COMPLETE');
    } catch (error) {
      logger.error('AI_FAILED_AT_FORMATTER', { error: error.message, stack: error.stack });
      formattedResponse = {
        message: 'I processed your request but encountered an issue formatting the detailed response. Please try again.',
        title: 'AI Assistant',
        metrics: {},
        risks: [],
        recommendedAction: 'Try again',
        confidence: 'LOW',
        dataFreshness: 'UNKNOWN',
        simulatedNote: null,
      };
    }

    // Step 8: Generate suggested follow-up actions
    let suggestedActions;
    try {
      suggestedActions = await generateSuggestedActions(intent, entities, combinedResults);
    } catch (error) {
      console.error('AI FAILED AT SUGGESTED ACTIONS', error);
      console.error(error.stack);
      suggestedActions = [];
    }

    // Step 9: Save conversation context
    try {
      await saveConversationContext(userId, resolvedMessage, formattedResponse, entities, vehicleContext);
    } catch (error) {
      console.error('AI FAILED AT SAVE CONTEXT', error);
      console.error(error.stack);
    }

    // Step 10: Return final response with validation
    return {
      success: true,
      message: formattedResponse?.message || 'No response generated',
      title: formattedResponse?.title || 'AI Assistant',
      metrics: formattedResponse?.metrics || {},
      risks: formattedResponse?.risks || [],
      recommendedAction: formattedResponse?.recommendedAction || null,
      confidence: formattedResponse?.confidence || 'MEDIUM',
      dataFreshness: formattedResponse?.dataFreshness || 'UNKNOWN',
      simulatedNote: formattedResponse?.simulatedNote || null,
      suggestedActions: suggestedActions || [],
      plan: plan?.steps ? plan.steps.map(s => s.description) : [],
      entities: entities || {},
      resolvedMessage: resolvedMessage !== message ? resolvedMessage : null,
    };
  } catch (error) {
    console.error('AI FAILED AT ORCHESTRATOR', error);
    console.error(error.stack);
    // Return fallback instead of throwing
    return {
      success: true,
      message: 'FleetNimble AI is online, but the advanced analysis failed temporarily. Please try again or ask a simpler fleet question.',
      title: 'FleetNimble AI Assistant',
      metrics: {},
      risks: [],
      recommendedAction: 'Try again',
      confidence: 'LOW',
      dataFreshness: 'UNKNOWN',
      simulatedNote: null,
      suggestedActions: [
        "Summarize my fleet health",
        "Show critical alerts",
        "Show vehicles needing maintenance",
        "Show offline vehicles"
      ],
      plan: [],
      entities: {},
      resolvedMessage: null,
    };
  }
}

/**
 * Combine results from multiple tool calls
 */
function combineResults(results, intent) {
  const combined = {
    data: [],
    summary: {},
    metadata: {},
  };

  results.forEach(result => {
    if (result.success) {
      combined.data.push(result.data);
      Object.assign(combined.summary, result.summary || {});
      Object.assign(combined.metadata, result.metadata || {});
    }
  });

  // Merge based on intent type
  switch (intent.type) {
    case 'FLEET_SUMMARY':
      combined.summary = mergeFleetSummary(combined.data);
      break;
    case 'VEHICLE_COMPARISON':
      combined.summary = mergeVehicleComparison(combined.data);
      break;
    case 'DIAGNOSTICS':
      combined.summary = mergeDiagnostics(combined.data);
      break;
    case 'MAINTENANCE_QUERY':
      combined.summary = mergeMaintenanceQuery(combined.data);
      break;
    case 'PREDICTIVE_ANALYSIS':
      combined.summary = mergePredictiveAnalysis(combined.data);
      break;
    default:
      combined.summary = mergeGeneric(combined.data);
  }

  return combined;
}

/**
 * Merge fleet summary results
 */
function mergeFleetSummary(data) {
  const summary = {
    totalVehicles: 0,
    onlineVehicles: 0,
    offlineVehicles: 0,
    healthScore: 0,
    criticalAlerts: 0,
    pendingMaintenance: 0,
  };

  data.forEach(item => {
    if (item.totalVehicles) summary.totalVehicles += item.totalVehicles;
    if (item.onlineVehicles) summary.onlineVehicles += item.onlineVehicles;
    if (item.offlineVehicles) summary.offlineVehicles += item.offlineVehicles;
    if (item.healthScore) summary.healthScore = Math.max(summary.healthScore, item.healthScore);
    if (item.criticalAlerts) summary.criticalAlerts += item.criticalAlerts;
    if (item.pendingMaintenance) summary.pendingMaintenance += item.pendingMaintenance;
  });

  return summary;
}

/**
 * Merge vehicle comparison results
 */
function mergeVehicleComparison(data) {
  return {
    vehicles: data,
    comparison: data.length > 1 ? compareVehicles(data) : null,
  };
}

/**
 * Compare vehicles
 */
function compareVehicles(vehicles) {
  const comparison = {
    healthScore: vehicles.map(v => ({ vehicle: v.vehicle, score: v.healthScore })),
    fuelEfficiency: vehicles.map(v => ({ vehicle: v.vehicle, efficiency: v.fuelEfficiency })),
    maintenanceCost: vehicles.map(v => ({ vehicle: v.vehicle, cost: v.maintenanceCost })),
  };

  return comparison;
}

/**
 * Merge diagnostics results
 */
function mergeDiagnostics(data) {
  return {
    dtcCodes: data.flatMap(d => d.dtcCodes || []),
    alerts: data.flatMap(d => d.alerts || []),
    healthStatus: data.map(d => ({ vehicle: d.vehicle, status: d.status })),
  };
}

/**
 * Merge maintenance query results
 */
function mergeMaintenanceQuery(data) {
  return {
    maintenanceItems: data.flatMap(d => d.items || []),
    urgentItems: data.flatMap(d => d.urgentItems || []),
    estimatedCost: data.reduce((sum, d) => sum + (d.estimatedCost || 0), 0),
  };
}

/**
 * Merge predictive analysis results
 */
function mergePredictiveAnalysis(data) {
  return {
    predictions: data.flatMap(d => d.predictions || []),
    riskLevel: data.map(d => d.riskLevel).sort((a, b) => getRiskLevelValue(b) - getRiskLevelValue(a))[0] || 'LOW',
    recommendations: data.flatMap(d => d.recommendations || []),
  };
}

/**
 * Get risk level value for sorting
 */
function getRiskLevelValue(level) {
  const values = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  return values[level] || 0;
}

/**
 * Merge generic results
 */
function mergeGeneric(data) {
  return {
    items: data,
    count: data.length,
  };
}

/**
 * Handle action confirmation
 */
export async function handleActionConfirmation(userId, actionId, confirmed) {
  try {
    if (confirmed) {
      // Execute the action
      const result = await executeConfirmedAction(userId, actionId);
      return {
        success: true,
        message: 'Action executed successfully',
        result,
      };
    } else {
      return {
        success: false,
        message: 'Action cancelled by user',
      };
    }
  } catch (error) {
    logger.error('Error handling action confirmation', { userId, actionId, error: error.message });
    throw error;
  }
}

/**
 * Execute confirmed action
 */
async function executeConfirmedAction(userId, actionId) {
  // This would integrate with aiActions.js
  // For now, return a placeholder
  return { actionId, executed: true, timestamp: new Date() };
}

/**
 * Regenerate response
 */
export async function regenerateResponse(userId, conversationId) {
  try {
    const context = await getConversationContext(userId, conversationId);
    if (!context) {
      throw new Error('Conversation not found');
    }

    return await orchestrateAI(userId, context.lastMessage, context.vehicleContext);
  } catch (error) {
    logger.error('Error regenerating response', { userId, conversationId, error: error.message });
    throw error;
  }
}
