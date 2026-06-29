/**
 * AI Response Formatter Module
 * Formats AI responses with consistent metadata and structure
 */

/**
 * Format successful AI response
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
    success: false,
    error: error.message,
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
  switch (intent) {
    case 'fleet_summary':
      return [
        "Show critical alerts",
        "Show vehicles needing maintenance",
        "Show offline vehicles"
      ];
    case 'vehicle_details':
      return [
        "Show vehicle maintenance",
        "Show vehicle alerts",
        "Show vehicle location"
      ];
    case 'vehicle_comparison':
      return [
        "Show vehicle details",
        "Compare maintenance",
        "Compare alerts"
      ];
    case 'dtc':
      return [
        "Show all DTCs",
        "Clear DTCs",
        "Schedule diagnostic"
      ];
    case 'maintenance':
      return [
        "Show critical alerts",
        "Show vehicle details",
        "Schedule maintenance"
      ];
    case 'gps':
      return [
        "Show vehicle details",
        "Show nearby vehicles",
        "Create geofence"
      ];
    case 'alerts':
      return [
        "Show vehicle details",
        "Show maintenance",
        "Acknowledge alerts"
      ];
    default:
      return [
        "Summarize my fleet health",
        "Show critical alerts",
        "Show vehicles needing maintenance"
      ];
  }
}
