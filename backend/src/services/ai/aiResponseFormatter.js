/**
 * AI Response Formatter Module
 * Formats AI responses with professional structure and consistent metadata
 */

/**
 * Format successful AI response with professional structure
 */
export function formatSuccessResponse(response, context, metadata = {}) {
  return {
    success: true,
    data: {
      reply: response,
      chatId: null,
      metadata: {
        title: "FleetNimble AI Assistant",
        confidence: metadata.confidence || "MEDIUM",
        dataFreshness: metadata.dataFreshness || "LIVE",
        simulatedNote: metadata.simulatedNote || null,
        suggestedActions: metadata.suggestedActions || [],
        entities: metadata.entities || {},
      },
    },
  };
}

/**
 * Format error response
 */
export function formatErrorResponse(error, context = null) {
  return {
    success: true, // Always return success with fallback
    data: {
      reply: 'I apologize, but I encountered an error processing your request. Please try again.',
      chatId: null,
      metadata: {
        title: "FleetNimble AI Assistant",
        confidence: "LOW",
        dataFreshness: "UNKNOWN",
        simulatedNote: null,
        suggestedActions: [
          "Summarize my fleet health",
          "Show critical alerts",
          "Show vehicles needing maintenance",
        ],
        entities: {},
      },
    },
  };
}

/**
 * Get suggested actions based on intent
 */
export function getSuggestedActions(intent) {
  const actionMap = {
    'fleet_summary': [
      "Show critical alerts",
      "Show vehicles needing maintenance",
      "Show offline vehicles"
    ],
    'vehicle_details': [
      "Show vehicle maintenance",
      "Show vehicle alerts",
      "Show vehicle location"
    ],
    'vehicle_comparison': [
      "Show vehicle details",
      "Compare maintenance",
      "Compare alerts"
    ],
    'dtc': [
      "Show all DTCs",
      "Clear DTCs",
      "Schedule diagnostic"
    ],
    'maintenance': [
      "Show critical alerts",
      "Show vehicle details",
      "Schedule maintenance"
    ],
    'gps': [
      "Show vehicle details",
      "Show nearby vehicles",
      "Create geofence"
    ],
    'alerts': [
      "Show vehicle details",
      "Show maintenance",
      "Acknowledge alerts"
    ],
    'offline_vehicles': [
      "Summarize my fleet health",
      "Show critical alerts",
      "Show standby vehicles"
    ],
    'standby_vehicles': [
      "Summarize my fleet health",
      "Show offline vehicles",
      "Show vehicle details"
    ],
    'battery': [
      "Show vehicle details",
      "Show fuel status",
      "Show maintenance"
    ],
    'fuel': [
      "Show vehicle details",
      "Show battery status",
      "Show nearby fuel stations"
    ],
    'predictive_maintenance': [
      "Show maintenance",
      "Show critical alerts",
      "Show vehicle details"
    ],
  };
  
  return actionMap[intent] || [
    "Summarize my fleet health",
    "Show critical alerts",
    "Show vehicles needing maintenance"
  ];
}
