function cleanMarkdown(text) {
  if (!text || typeof text !== 'string') return text;

  let cleaned = text.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/(#{1,6}[^\n]+)\n(?!\n)/g, '$1\n\n');
  cleaned = cleaned.replace(/-\s*\n/g, '- ');
  cleaned = cleaned.replace(/(\d+)\.\s*\n/g, '$1. ');
  cleaned = cleaned.split('\n').map(line => line.trimEnd()).join('\n');

  return cleaned.trim();
}

export function formatSuccessResponse(response, context, metadata = {}) {
  const cleanedResponse = cleanMarkdown(response);

  return {
    success: true,
    data: {
      reply: cleanedResponse,
      chatId: null,
      metadata: {
        title: "FleetNimble AI Assistant",
        confidence: metadata.confidence || "MEDIUM",
        dataFreshness: metadata.dataFreshness || "LIVE",
        simulatedNote: metadata.simulatedNote || null,
        suggestedActions: metadata.suggestedActions || getSuggestedActions(context?.intent || 'general'),
        entities: metadata.entities || {},
      },
    },
  };
}

export function formatErrorResponse(error, context = null) {
  return {
    success: true,
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

export function getSuggestedActions(intent, context = {}) {
  const actionMap = {
    'fleet_summary': [
      "Show critical alerts",
      "Show vehicles needing maintenance",
      "Show offline vehicles"
    ],
    'list_vehicles': [
      "Show fleet summary",
      "Show offline vehicles",
      "Show vehicle details for a specific vehicle"
    ],
    'vehicle_details': [
      "Show vehicle maintenance",
      "Show vehicle alerts",
      "Show vehicle location"
    ],
    'vehicle_search': [
      "Show vehicle details",
      "Show similar vehicles",
      "Show vehicle maintenance"
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
    'dtc_codes': [
      "Show all DTCs",
      "Show vehicle details",
      "Schedule diagnostic"
    ],
    'maintenance': [
      "Show critical alerts",
      "Show vehicle details",
      "Schedule maintenance"
    ],
    'maintenance_due': [
      "Show all maintenance",
      "Show critical alerts",
      "Show vehicle details"
    ],
    'gps': [
      "Show vehicle details",
      "Show nearby vehicles",
      "Create geofence"
    ],
    'gps_tracking': [
      "Track another vehicle",
      "Show vehicle details",
      "Show fleet summary"
    ],
    'alerts': [
      "Show vehicle details",
      "Show maintenance",
      "Acknowledge alerts"
    ],
    'critical_alerts': [
      "Acknowledge critical alerts",
      "Show affected vehicles",
      "Create work order"
    ],
    'offline_vehicles': [
      "Summarize my fleet health",
      "Show critical alerts",
      "Show standby vehicles"
    ],
    'online_vehicles': [
      "Show offline vehicles",
      "Show standby vehicles",
      "Show fleet summary"
    ],
    'standby_vehicles': [
      "Summarize my fleet health",
      "Show offline vehicles",
      "Show vehicle details"
    ],
    'battery': [
      "Show vehicle details",
      "Show fuel status",
      "Show battery history"
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
    'live_data': [
      "Show historical data",
      "Show vehicle details",
      "Show vehicle location"
    ],
    'live_diagnostics': [
      "Show live diagnostics",
      "Check vehicle health",
      "Show engine data"
    ],
    'history': [
      "Show live data",
      "Show vehicle details",
      "Show maintenance history"
    ],
    'work_order': [
      "Show work orders",
      "Show maintenance",
      "Create work order"
    ],
    'report': [
      "Generate executive report",
      "Show fleet summary",
      "Generate fuel report"
    ],
    'support': [
      "Show vehicle details",
      "Show live diagnostics",
      "View dashboard"
    ],
  };

  if (intent === 'live_data' && context?.message?.toLowerCase().includes('diagnostic')) {
    return [
      "Open Live Diagnostics",
      "Check OBD connection",
      "Show RPM for a vehicle"
    ];
  }

  if (intent === 'vehicle_details' && context?.message?.toLowerCase().includes('battery')) {
    return [
      "Show battery health",
      "Show GPS location",
      "Show maintenance history"
    ];
  }

  if (intent === 'alerts' && context?.message?.toLowerCase().includes('critical')) {
    return [
      "Show critical alerts",
      "Create work order",
      "Show affected vehicles"
    ];
  }

  return actionMap[intent] || [
    "Summarize my fleet health",
    "Show critical alerts",
    "Show vehicles needing maintenance"
  ];
}
