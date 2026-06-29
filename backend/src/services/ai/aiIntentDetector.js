/**
 * AI Intent Detection System
 * Detects user intent from natural language queries
 */

export const INTENTS = {
  FLEET_SUMMARY: 'fleet_summary',
  VEHICLE_DETAILS: 'vehicle_details',
  VEHICLE_COMPARISON: 'vehicle_comparison',
  DIAGNOSTICS: 'diagnostics',
  MAINTENANCE: 'maintenance',
  GPS: 'gps',
  ALERTS: 'alerts',
  DTC: 'dtc',
  REPORT: 'report',
  SUPPORT: 'support',
  GENERAL: 'general',
};

/**
 * Detect intent from user message
 */
export function detectIntent(message) {
  const lowerMessage = message.toLowerCase();
  
  // Fleet summary intent
  if (lowerMessage.includes('summary') || 
      lowerMessage.includes('fleet health') || 
      lowerMessage.includes('overview') || 
      lowerMessage.includes('dashboard') ||
      lowerMessage.includes('fleet status')) {
    return INTENTS.FLEET_SUMMARY;
  }
  
  // Vehicle comparison intent
  if (lowerMessage.includes('compare') || 
      lowerMessage.includes('vs') || 
      lowerMessage.includes('versus') ||
      lowerMessage.includes('difference between')) {
    return INTENTS.VEHICLE_COMPARISON;
  }
  
  // DTC/diagnostics intent
  if (lowerMessage.includes('dtc') || 
      lowerMessage.includes('diagnostic') || 
      lowerMessage.includes('error code') ||
      lowerMessage.includes('p0') ||
      lowerMessage.includes('trouble code')) {
    return INTENTS.DTC;
  }
  
  // Maintenance intent
  if (lowerMessage.includes('maintenance') || 
      lowerMessage.includes('repair') || 
      lowerMessage.includes('service') ||
      lowerMessage.includes('service due') ||
      lowerMessage.includes('needs maintenance')) {
    return INTENTS.MAINTENANCE;
  }
  
  // GPS/location intent
  if (lowerMessage.includes('location') || 
      lowerMessage.includes('gps') || 
      lowerMessage.includes('where is') ||
      lowerMessage.includes('position')) {
    return INTENTS.GPS;
  }
  
  // Alerts intent
  if (lowerMessage.includes('alert') || 
      lowerMessage.includes('warning') || 
      lowerMessage.includes('critical') ||
      lowerMessage.includes('notification')) {
    return INTENTS.ALERTS;
  }
  
  // Report intent
  if (lowerMessage.includes('report') || 
      lowerMessage.includes('generate') || 
      lowerMessage.includes('export')) {
    return INTENTS.REPORT;
  }
  
  // Support/help intent
  if (lowerMessage.includes('help') || 
      lowerMessage.includes('how to') || 
      lowerMessage.includes('support') ||
      lowerMessage.includes('guide') ||
      lowerMessage.includes('tutorial')) {
    return INTENTS.SUPPORT;
  }
  
  // Vehicle details intent (default for vehicle-specific queries)
  if (lowerMessage.includes('show') || 
      lowerMessage.includes('vehicle') || 
      lowerMessage.includes('status') ||
      lowerMessage.includes('health')) {
    return INTENTS.VEHICLE_DETAILS;
  }
  
  // Default to general
  return INTENTS.GENERAL;
}

/**
 * Extract entities from user message
 */
export function extractEntities(message, userId, userVehicles = []) {
  const lowerMessage = message.toLowerCase();
  const entities = {
    vehicles: [],
    vin: null,
    registration: null,
    alertType: null,
    dtcCode: null,
    date: null,
    severity: null,
  };
  
  // Extract vehicle names from message
  const vehicleNames = userVehicles.map(v => v.name.toLowerCase());
  vehicleNames.forEach(name => {
    if (lowerMessage.includes(name)) {
      const vehicle = userVehicles.find(v => v.name.toLowerCase() === name);
      if (vehicle) {
        entities.vehicles.push(vehicle);
      }
    }
  });
  
  // Extract VIN
  const vinMatch = message.match(/[A-HJ-NPR-Z0-9]{17}/i);
  if (vinMatch) {
    entities.vin = vinMatch[0].toUpperCase();
  }
  
  // Extract registration/plate number
  const plateMatch = message.match(/[A-Z0-9]{2,3}[-\s]?[A-Z0-9]{4,6}/i);
  if (plateMatch) {
    entities.registration = plateMatch[0].toUpperCase();
  }
  
  // Extract DTC code
  const dtcMatch = message.match(/[Pp][0-9][0-9A-Fa-f]{3}/);
  if (dtcMatch) {
    entities.dtcCode = dtcMatch[0].toUpperCase();
  }
  
  // Extract alert type
  if (lowerMessage.includes('critical')) entities.alertType = 'CRITICAL';
  else if (lowerMessage.includes('high')) entities.alertType = 'HIGH';
  else if (lowerMessage.includes('medium')) entities.alertType = 'MEDIUM';
  else if (lowerMessage.includes('low')) entities.alertType = 'LOW';
  
  // Extract severity
  if (lowerMessage.includes('severe')) entities.severity = 'CRITICAL';
  else if (lowerMessage.includes('urgent')) entities.severity = 'HIGH';
  
  // Extract date (simple patterns)
  const today = new Date().toISOString().split('T')[0];
  if (lowerMessage.includes('today')) entities.date = today;
  else if (lowerMessage.includes('yesterday')) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    entities.date = yesterday.toISOString().split('T')[0];
  }
  
  return entities;
}
