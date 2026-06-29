/**
 * AI Intent Detection Service
 * Classifies user questions into intent categories for intelligent routing
 */

const INTENT_PATTERNS = {
  fleet_summary: [
    'fleet summary',
    'overview',
    'dashboard',
    'status',
    'how many vehicles',
    'fleet health',
    'fleet status',
    'show my fleet',
    'all vehicles',
    'total vehicles',
  ],
  vehicle_status: [
    'vehicle status',
    'vehicle information',
    'vehicle details',
    'show vehicle',
    'vehicle',
    'car',
    'truck',
  ],
  maintenance: [
    'maintenance',
    'service',
    'repair',
    'oil change',
    'brake',
    'tire',
    'schedule',
    'due',
  ],
  alerts: [
    'alert',
    'warning',
    'critical',
    'issue',
    'problem',
    'error',
  ],
  diagnostics: [
    'diagnostic',
    'dtc',
    'code',
    'obd',
    'check engine',
    'trouble code',
    'error code',
  ],
  gps: [
    'gps',
    'location',
    'track',
    'where is',
    'position',
    'map',
    'route',
    'nearest',
  ],
  fuel: [
    'fuel',
    'gas',
    'petrol',
    'consumption',
    'efficiency',
    'refuel',
  ],
  battery: [
    'battery',
    'voltage',
    'charge',
    'power',
    'electrical',
  ],
  trips: [
    'trip',
    'journey',
    'drive',
    'route',
    'distance',
    'travel',
  ],
  drivers: [
    'driver',
    'behavior',
    'harsh braking',
    'acceleration',
    'speeding',
    'score',
  ],
  platform_help: [
    'how to',
    'how do i',
    'help',
    'guide',
    'tutorial',
    'explain',
    'what is',
  ],
  customer_support: [
    'support',
    'troubleshoot',
    'fix',
    'not working',
    'error',
    'issue',
    'problem',
    'bluetooth',
    'connect',
    'offline',
    'unavailable',
  ],
  comparison: [
    'compare',
    'difference',
    'versus',
    'vs',
    'better',
  ],
  prediction: [
    'predict',
    'will',
    'forecast',
    'risk',
    'failure',
    'overheat',
  ],
};

/**
 * Detect intent from user message
 */
export function detectIntent(message) {
  const lowerMessage = message.toLowerCase();

  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (lowerMessage.includes(pattern)) {
        return {
          intent,
          confidence: 0.9,
        };
      }
    }
  }

  // Default to general query
  return {
    intent: 'general',
    confidence: 0.5,
  };
}

/**
 * Extract vehicle identifier from message
 */
export function extractVehicleId(message) {
  const patterns = [
    /fl[-\s]?(\d+)/i,           // FL-001, FL 001
    /vehicle[-\s]?(\d+)/i,      // Vehicle-001, Vehicle 001
    /plate[-\s]?([a-z0-9]+)/i,   // Plate ABC123
    /vin[-\s]?([a-z0-9]+)/i,    // VIN
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Extract DTC code from message
 */
export function extractDTC(message) {
  const patterns = [
    /p[0-9]{4}/i,               // P0700, P0171
    /c[0-9]{4}/i,               // C0000
    /b[0-9]{4}/i,               // B0000
    /u[0-9]{4}/i,               // U0000
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      return match[0].toUpperCase();
    }
  }

  return null;
}

/**
 * Check if message is a support question
 */
export function isSupportQuestion(message) {
  const supportKeywords = [
    'how to',
    'how do i',
    'why is',
    'why does',
    'how can',
    'troubleshoot',
    'fix',
    'not working',
    'error',
    'issue',
    'problem',
    'connect',
    'pair',
    'setup',
    'configure',
  ];

  const lowerMessage = message.toLowerCase();
  return supportKeywords.some(keyword => lowerMessage.includes(keyword));
}

/**
 * Get intent description
 */
export function getIntentDescription(intent) {
  const descriptions = {
    fleet_summary: 'User wants fleet overview and summary',
    vehicle_status: 'User wants specific vehicle information',
    maintenance: 'User wants maintenance information',
    alerts: 'User wants alerts and warnings',
    diagnostics: 'User wants diagnostic information',
    gps: 'User wants GPS/location information',
    fuel: 'User wants fuel information',
    battery: 'User wants battery information',
    trips: 'User wants trip information',
    drivers: 'User wants driver behavior information',
    platform_help: 'User wants platform help/guidance',
    customer_support: 'User needs troubleshooting support',
    comparison: 'User wants to compare vehicles',
    prediction: 'User wants predictive analysis',
    general: 'General query',
  };

  return descriptions[intent] || descriptions.general;
}
