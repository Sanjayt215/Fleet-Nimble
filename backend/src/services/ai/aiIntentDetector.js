/**
 * AI Intent Detection System
 * Detects user intent from natural language queries with confidence scoring
 */

import prisma from '../../utils/prisma.js';
import logger from '../../utils/logger.js';

export const INTENTS = {
  FLEET_SUMMARY: 'fleet_summary',
  VEHICLE_DETAILS: 'vehicle_details',
  VEHICLE_COMPARISON: 'vehicle_comparison',
  DIAGNOSTICS: 'diagnostics',
  MAINTENANCE: 'maintenance',
  WORK_ORDER: 'work_order',
  GPS: 'gps',
  ALERTS: 'alerts',
  DTC: 'dtc',
  REPORT: 'report',
  SUPPORT: 'support',
  BATTERY: 'battery',
  FUEL: 'fuel',
  TRIP: 'trip',
  DRIVER: 'driver',
  OFFLINE_VEHICLES: 'offline_vehicles',
  STANDBY_VEHICLES: 'standby_vehicles',
  ENGINE_STATE: 'engine_state',
  PREDICTIVE_MAINTENANCE: 'predictive_maintenance',
  BUSINESS_IMPACT: 'business_impact',
  RECOMMENDATIONS: 'recommendations',
  COMPANY_INFO: 'company_info',
  GENERAL: 'general',
};

/**
 * Detect intent from user message with confidence score
 */
export function detectIntent(message) {
  const lowerMessage = message.toLowerCase();
  let intent = INTENTS.GENERAL;
  let confidence = 0.5;
  
  // Fleet summary intent
  if (lowerMessage.includes('summary') || 
      lowerMessage.includes('fleet health') || 
      lowerMessage.includes('overview') || 
      lowerMessage.includes('dashboard') ||
      lowerMessage.includes('fleet status')) {
    intent = INTENTS.FLEET_SUMMARY;
    confidence = 0.9;
  }
  
  // Vehicle comparison intent
  else if (lowerMessage.includes('compare') || 
           lowerMessage.includes('vs') || 
           lowerMessage.includes('versus') ||
           lowerMessage.includes('difference between')) {
    intent = INTENTS.VEHICLE_COMPARISON;
    confidence = 0.85;
  }
  
  // DTC/diagnostics intent
  else if (lowerMessage.includes('dtc') || 
           lowerMessage.includes('diagnostic') || 
           lowerMessage.includes('error code') ||
           lowerMessage.includes('p0') ||
           lowerMessage.includes('trouble code')) {
    intent = INTENTS.DTC;
    confidence = 0.95;
  }
  
  // Maintenance intent
  else if (lowerMessage.includes('maintenance') || 
           lowerMessage.includes('repair') || 
           lowerMessage.includes('service') ||
           lowerMessage.includes('service due') ||
           lowerMessage.includes('needs maintenance')) {
    intent = INTENTS.MAINTENANCE;
    confidence = 0.9;
  }
  
  // Work order intent
  else if (lowerMessage.includes('work order') ||
           lowerMessage.includes('create work order') ||
           lowerMessage.includes('new work order') ||
           lowerMessage.includes('add work order') ||
           lowerMessage.includes('schedule repair') ||
           (lowerMessage.includes('create') && (lowerMessage.includes('repair') || lowerMessage.includes('maintenance')))) {
    intent = INTENTS.WORK_ORDER;
    confidence = 0.9;
  }
  
  // Predictive maintenance intent
  else if (lowerMessage.includes('predictive') ||
           lowerMessage.includes('likely to fail') ||
           lowerMessage.includes('repair priority') ||
           lowerMessage.includes('which vehicle should i repair')) {
    intent = INTENTS.PREDICTIVE_MAINTENANCE;
    confidence = 0.85;
  }
  
  // GPS/location intent
  else if (lowerMessage.includes('location') || 
           lowerMessage.includes('gps') || 
           lowerMessage.includes('where is') ||
           lowerMessage.includes('position')) {
    intent = INTENTS.GPS;
    confidence = 0.9;
  }
  
  // Alerts intent
  else if (lowerMessage.includes('alert') || 
           lowerMessage.includes('warning') || 
           lowerMessage.includes('critical') ||
           lowerMessage.includes('notification')) {
    intent = INTENTS.ALERTS;
    confidence = 0.9;
  }
  
  // Offline vehicles intent
  else if (lowerMessage.includes('offline') ||
           lowerMessage.includes('not responding') ||
           lowerMessage.includes('disconnected')) {
    intent = INTENTS.OFFLINE_VEHICLES;
    confidence = 0.9;
  }
  
  // Standby vehicles intent
  else if (lowerMessage.includes('standby') ||
           lowerMessage.includes('idle') ||
           lowerMessage.includes('parked')) {
    intent = INTENTS.STANDBY_VEHICLES;
    confidence = 0.85;
  }
  
  // Battery intent
  else if (lowerMessage.includes('battery') ||
           lowerMessage.includes('voltage') ||
           lowerMessage.includes('power')) {
    intent = INTENTS.BATTERY;
    confidence = 0.85;
  }
  
  // Fuel intent
  else if (lowerMessage.includes('fuel') ||
           lowerMessage.includes('gas') ||
           lowerMessage.includes('petrol') ||
           lowerMessage.includes('tank')) {
    intent = INTENTS.FUEL;
    confidence = 0.85;
  }
  
  // Trip intent
  else if (lowerMessage.includes('trip') ||
           lowerMessage.includes('journey') ||
           lowerMessage.includes('route')) {
    intent = INTENTS.TRIP;
    confidence = 0.8;
  }
  
  // Driver intent
  else if (lowerMessage.includes('driver') ||
           lowerMessage.includes('who is driving')) {
    intent = INTENTS.DRIVER;
    confidence = 0.8;
  }
  
  // Engine state intent
  else if (lowerMessage.includes('engine') ||
           lowerMessage.includes('ignition') ||
           lowerMessage.includes('motor')) {
    intent = INTENTS.ENGINE_STATE;
    confidence = 0.85;
  }
  
  // Report intent
  else if (lowerMessage.includes('report') || 
           lowerMessage.includes('generate') || 
           lowerMessage.includes('export')) {
    intent = INTENTS.REPORT;
    confidence = 0.85;
  }
  
  // Business impact intent
  else if (lowerMessage.includes('business impact') ||
           lowerMessage.includes('cost') ||
           lowerMessage.includes('revenue') ||
           lowerMessage.includes('profit')) {
    intent = INTENTS.BUSINESS_IMPACT;
    confidence = 0.8;
  }
  
  // Recommendations intent
  else if (lowerMessage.includes('recommend') ||
           lowerMessage.includes('suggest') ||
           lowerMessage.includes('advice') ||
           lowerMessage.includes('should i')) {
    intent = INTENTS.RECOMMENDATIONS;
    confidence = 0.8;
  }
  
  // Company information intent
  else if (lowerMessage.includes('company') ||
           lowerMessage.includes('organization') ||
           lowerMessage.includes('fleetnimble')) {
    intent = INTENTS.COMPANY_INFO;
    confidence = 0.85;
  }
  
  // Support/help intent
  else if (lowerMessage.includes('help') || 
           lowerMessage.includes('how to') || 
           lowerMessage.includes('support') ||
           lowerMessage.includes('guide') ||
           lowerMessage.includes('tutorial') ||
           lowerMessage.includes('what is') ||
           lowerMessage.includes('how does') ||
           lowerMessage.includes('explain') ||
           lowerMessage.includes('troubleshoot') ||
           lowerMessage.includes('login') ||
           lowerMessage.includes('subscription') ||
           lowerMessage.includes('pricing') ||
           lowerMessage.includes('mobile app') ||
           lowerMessage.includes('obd device') ||
           lowerMessage.includes('gps tracking') ||
           lowerMessage.includes('digital twin') ||
           lowerMessage.includes('geofence') ||
           lowerMessage.includes('vin') ||
           lowerMessage.includes('battery protection') ||
           lowerMessage.includes('engine standby')) {
    intent = INTENTS.SUPPORT;
    confidence = 0.9;
  }
  
  // Vehicle details intent (default for vehicle-specific queries)
  else if (lowerMessage.includes('show') || 
           lowerMessage.includes('vehicle') || 
           lowerMessage.includes('status') ||
           lowerMessage.includes('health')) {
    intent = INTENTS.VEHICLE_DETAILS;
    confidence = 0.75;
  }
  
  return intent;
}

/**
 * Find vehicle by text with fuzzy search
 * Searches vehicleName, registrationNumber, vin, make, model
 */
export async function findVehicleByText(userId, text) {
  const lowerText = text.toLowerCase();
  const words = lowerText.split(/\s+/).filter(w => w.length > 2);
  
  if (words.length === 0) return null;
  
  // Try exact phrase match first
  let vehicle = await prisma.vehicle.findFirst({
    where: {
      userId,
      deletedAt: null,
      OR: [
        { vehicleName: { contains: text, mode: 'insensitive' } },
        { registrationNumber: { contains: text, mode: 'insensitive' } },
        { vin: { contains: text, mode: 'insensitive' } },
      ]
    },
  });
  
  if (vehicle) return vehicle;
  
  // Try make/model combination
  if (words.length >= 2) {
    const makeWord = words[0];
    const modelWord = words.slice(1).join(' ');
    
    vehicle = await prisma.vehicle.findFirst({
      where: {
        userId,
        deletedAt: null,
        OR: [
          { make: { contains: makeWord, mode: 'insensitive' }, model: { contains: modelWord, mode: 'insensitive' } },
          { vehicleName: { contains: makeWord, mode: 'insensitive' } },
          { vehicleName: { contains: modelWord, mode: 'insensitive' } },
        ]
      },
    });
    
    if (vehicle) return vehicle;
  }
  
  // Try each word individually
  for (const word of words) {
    vehicle = await prisma.vehicle.findFirst({
      where: {
        userId,
        deletedAt: null,
        OR: [
          { vehicleName: { contains: word, mode: 'insensitive' } },
          { registrationNumber: { contains: word, mode: 'insensitive' } },
          { vin: { contains: word, mode: 'insensitive' } },
          { make: { contains: word, mode: 'insensitive' } },
          { model: { contains: word, mode: 'insensitive' } },
        ]
      },
    });
    
    if (vehicle) return vehicle;
  }
  
  return null;
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
  const vehicleNames = userVehicles.map(v => v.vehicleName?.toLowerCase() || '');
  vehicleNames.forEach(name => {
    if (name && lowerMessage.includes(name)) {
      const vehicle = userVehicles.find(v => v.vehicleName?.toLowerCase() === name);
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
