import prisma from '../../utils/prisma.js';
import logger from '../../utils/logger.js';

export const INTENTS = {
  FLEET_SUMMARY: 'fleet_summary',
  VEHICLE_DETAILS: 'vehicle_details',
  VEHICLE_SEARCH: 'vehicle_search',
  LIST_VEHICLES: 'list_vehicles',
  OFFLINE_VEHICLES: 'offline_vehicles',
  ONLINE_VEHICLES: 'online_vehicles',
  VEHICLE_COMPARISON: 'vehicle_comparison',
  DIAGNOSTICS: 'diagnostics',
  MAINTENANCE: 'maintenance',
  MAINTENANCE_DUE: 'maintenance_due',
  WORK_ORDER: 'work_order',
  GPS: 'gps',
  GPS_TRACKING: 'gps_tracking',
  ALERTS: 'alerts',
  CRITICAL_ALERTS: 'critical_alerts',
  DTC: 'dtc',
  DTC_CODES: 'dtc_codes',
  REPORT: 'report',
  SUPPORT: 'support',
  BATTERY: 'battery',
  FUEL: 'fuel',
  TRIP: 'trip',
  DRIVER: 'driver',
  STANDBY_VEHICLES: 'standby_vehicles',
  ENGINE_STATE: 'engine_state',
  LIVE_DATA: 'live_data',
  LIVE_DIAGNOSTICS: 'live_diagnostics',
  PREDICTIVE_MAINTENANCE: 'predictive_maintenance',
  BUSINESS_IMPACT: 'business_impact',
  RECOMMENDATIONS: 'recommendations',
  COMPANY_INFO: 'company_info',
  HISTORY: 'history',
  GENERAL: 'general',
};

const BRAND_NAMES = [
  'honda', 'toyota', 'ford', 'mazda', 'bmw', 'mercedes', 'audi',
  'volkswagen', 'volkswagen', 'vw', 'hyundai', 'kia', 'nissan',
  'chevrolet', 'chevy', 'suzuki', 'maruti', 'tata', 'mahindra',
  'isuzu', 'man', 'scania', 'volvo', 'renault', 'peugeot',
  'citroen', 'fiat', 'jeep', 'dodge', 'ram', 'subaru', 'mitsubishi',
  'lexus', 'acura', 'infiniti', 'jaguar', 'land rover', 'porsche',
  'ferrari', 'lamborghini', 'mg', 'skoda', 'seat', 'cupra',
];

const VEHICLE_KEYWORDS = [
  'vehicle', 'car', 'truck', 'van', 'bus', 'suv', 'pickup', 'lorry',
];

function containsBrandName(text) {
  return BRAND_NAMES.some(brand => text.includes(brand));
}

function containsVehicleKeyword(text) {
  return VEHICLE_KEYWORDS.some(kw => text.includes(kw));
}

export function detectIntent(message) {
  const lowerMessage = message.toLowerCase().trim();
  let intent = INTENTS.GENERAL;

  // List vehicles (MUST check before generic "vehicle" match)
  if (
    /^(list|show|display)\s+(all\s+)?(vehicles|vehicle|cars|trucks|fleet)/i.test(message) ||
    lowerMessage === 'all vehicles' ||
    lowerMessage === 'vehicles list' ||
    lowerMessage === 'list vehicles' ||
    lowerMessage === 'show all vehicles'
  ) {
    return INTENTS.LIST_VEHICLES;
  }

  // List fleets
  if (
    /^(list|show)\s+(all\s+)?(fleet|fleets)/i.test(message) ||
    lowerMessage === 'all fleets' ||
    lowerMessage === 'list all the fleets'
  ) {
    return INTENTS.LIST_VEHICLES;
  }

  // Fleet summary
  if (
    lowerMessage.includes('summary') ||
    lowerMessage.includes('fleet health') ||
    lowerMessage.includes('overview') ||
    lowerMessage.includes('dashboard') ||
    lowerMessage.includes('fleet status') ||
    lowerMessage === 'overall fleet' ||
    lowerMessage === 'fleet overview'
  ) {
    return INTENTS.FLEET_SUMMARY;
  }

  // Vehicle search by brand/model
  if (
    /more information about/i.test(message) ||
    /tell me about/i.test(message) ||
    /information about/i.test(message) ||
    containsBrandName(lowerMessage)
  ) {
    return INTENTS.VEHICLE_SEARCH;
  }

  // Critical alerts (check before generic alerts)
  if (
    /show critical/i.test(message) ||
    /list critical/i.test(message) ||
    /critical (alert|warning|issue)/i.test(message) ||
    /urgent alert/i.test(message)
  ) {
    return INTENTS.CRITICAL_ALERTS;
  }

  // Live diagnostics
  if (
    /live diagnostics/i.test(message) ||
    /live (speed|rpm|data)/i.test(message) ||
    lowerMessage.includes('live telemetry') ||
    lowerMessage === 'speed rpm' ||
    /(speed|rpm|battery|coolant|fuel level)\s+(of|for|on)\s+/i.test(message)
  ) {
    return INTENTS.LIVE_DIAGNOSTICS;
  }

  // GPS tracking
  if (
    /(gps|location)\s+history/i.test(message) ||
    /where is/i.test(message) ||
    /live location/i.test(message) ||
    /gps track/i.test(message)
  ) {
    return INTENTS.GPS_TRACKING;
  }

  // Vehicle comparison
  if (
    lowerMessage.includes('compare') ||
    lowerMessage.includes('vs ') ||
    lowerMessage.includes(' versus ') ||
    lowerMessage.includes('difference between')
  ) {
    return INTENTS.VEHICLE_COMPARISON;
  }

  // Live data
  if (
    lowerMessage.includes('live') ||
    lowerMessage.includes('real-time') ||
    lowerMessage.includes('realtime') ||
    lowerMessage.includes('current')
  ) {
    return INTENTS.LIVE_DATA;
  }

  // DTC / diagnostics
  if (
    lowerMessage.includes('dtc') ||
    lowerMessage.includes('error code') ||
    lowerMessage.includes('trouble code') ||
    lowerMessage.includes('fault code') ||
    lowerMessage.includes('diagnostic') ||
    lowerMessage.includes('check engine') ||
    /p\d{4}/i.test(message) ||
    /active dtc/i.test(message)
  ) {
    return INTENTS.DTC;
  }

  // Maintenance
  if (
    lowerMessage.includes('maintenance') ||
    lowerMessage.includes('repair') ||
    lowerMessage.includes('service') ||
    lowerMessage.includes('service due') ||
    lowerMessage.includes('oil change') ||
    lowerMessage.includes('brake') ||
    lowerMessage.includes('tire')
  ) {
    if (
      lowerMessage.includes('due') ||
      lowerMessage.includes('overdue') ||
      lowerMessage.includes('upcoming') ||
      lowerMessage.includes('pending')
    ) {
      return INTENTS.MAINTENANCE_DUE;
    }
    return INTENTS.MAINTENANCE;
  }

  // Work order
  if (
    lowerMessage.includes('work order') ||
    lowerMessage.includes('workorder') ||
    lowerMessage.includes('repair task') ||
    lowerMessage.includes('create work') ||
    lowerMessage.includes('schedule repair')
  ) {
    return INTENTS.WORK_ORDER;
  }

  // Predictive maintenance
  if (
    lowerMessage.includes('predictive') ||
    lowerMessage.includes('likely to fail') ||
    lowerMessage.includes('repair priority') ||
    lowerMessage.includes('which vehicle should i repair')
  ) {
    return INTENTS.PREDICTIVE_MAINTENANCE;
  }

  // GPS / location
  if (
    lowerMessage.includes('location') ||
    lowerMessage.includes('gps') ||
    lowerMessage.includes('where is') ||
    lowerMessage.includes('position') ||
    lowerMessage.includes('nearest')
  ) {
    return INTENTS.GPS;
  }

  // Alerts
  if (
    lowerMessage.includes('alert') ||
    lowerMessage.includes('warning') ||
    lowerMessage.includes('notification')
  ) {
    if (lowerMessage.includes('critical')) {
      return INTENTS.CRITICAL_ALERTS;
    }
    return INTENTS.ALERTS;
  }

  // Offline vehicles
  if (
    lowerMessage.includes('offline') ||
    lowerMessage.includes('not responding') ||
    lowerMessage.includes('disconnected') ||
    /vehicles?\s+offline/i.test(message) ||
    /not online/i.test(message)
  ) {
    return INTENTS.OFFLINE_VEHICLES;
  }

  // Online vehicles
  if (
    lowerMessage.includes('online') &&
    (containsVehicleKeyword(lowerMessage) || lowerMessage.includes('vehicle'))
  ) {
    return INTENTS.ONLINE_VEHICLES;
  }

  // Standby vehicles
  if (
    lowerMessage.includes('standby') ||
    lowerMessage.includes('idle') ||
    lowerMessage.includes('parked')
  ) {
    return INTENTS.STANDBY_VEHICLES;
  }

  // Battery
  if (
    lowerMessage.includes('battery') ||
    lowerMessage.includes('voltage') ||
    lowerMessage.includes('power')
  ) {
    return INTENTS.BATTERY;
  }

  // Fuel
  if (
    lowerMessage.includes('fuel') ||
    lowerMessage.includes('gas') ||
    lowerMessage.includes('petrol') ||
    lowerMessage.includes('tank')
  ) {
    return INTENTS.FUEL;
  }

  // Trip
  if (
    lowerMessage.includes('trip') ||
    lowerMessage.includes('journey') ||
    lowerMessage.includes('route')
  ) {
    return INTENTS.TRIP;
  }

  // Driver
  if (
    lowerMessage.includes('driver') ||
    lowerMessage.includes('who is driving')
  ) {
    return INTENTS.DRIVER;
  }

  // Engine state
  if (
    lowerMessage.includes('engine') ||
    lowerMessage.includes('ignition') ||
    lowerMessage.includes('motor')
  ) {
    return INTENTS.ENGINE_STATE;
  }

  // Report
  if (
    lowerMessage.includes('report') ||
    lowerMessage.includes('generate') ||
    lowerMessage.includes('export')
  ) {
    return INTENTS.REPORT;
  }

  // Business impact
  if (
    lowerMessage.includes('business impact') ||
    lowerMessage.includes('cost') ||
    lowerMessage.includes('revenue') ||
    lowerMessage.includes('profit')
  ) {
    return INTENTS.BUSINESS_IMPACT;
  }

  // Recommendations
  if (
    lowerMessage.includes('recommend') ||
    lowerMessage.includes('suggest') ||
    lowerMessage.includes('advice') ||
    lowerMessage.includes('should i')
  ) {
    return INTENTS.RECOMMENDATIONS;
  }

  // Company info
  if (
    lowerMessage.includes('company') ||
    lowerMessage.includes('organization') ||
    lowerMessage.includes('fleetnimble')
  ) {
    return INTENTS.COMPANY_INFO;
  }

  // History
  if (
    lowerMessage.includes('history') ||
    lowerMessage.includes('historical') ||
    lowerMessage.includes('past') ||
    lowerMessage.includes('previous')
  ) {
    return INTENTS.HISTORY;
  }

  // Support / help
  if (
    lowerMessage.includes('help') ||
    lowerMessage.includes('how to') ||
    lowerMessage.includes('support') ||
    lowerMessage.includes('guide') ||
    lowerMessage.includes('tutorial') ||
    lowerMessage.includes('what is') ||
    lowerMessage.includes('how does') ||
    lowerMessage.includes('explain') ||
    lowerMessage.includes('troubleshoot') ||
    lowerMessage.includes('where can i')
  ) {
    return INTENTS.SUPPORT;
  }

  // Vehicle details (only if vehicle keyword present but not generic "list")
  if (containsVehicleKeyword(lowerMessage)) {
    return INTENTS.VEHICLE_DETAILS;
  }

  return INTENTS.GENERAL;
}

export async function findVehicleByText(userId, text) {
  const lowerText = text.toLowerCase();
  const words = lowerText.split(/\s+/).filter(w => w.length > 2);

  if (words.length === 0) return null;

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
    make: null,
    model: null,
  };

  const vehicleNames = userVehicles.map(v => v.vehicleName?.toLowerCase() || '');
  vehicleNames.forEach(name => {
    if (name && lowerMessage.includes(name)) {
      const vehicle = userVehicles.find(v => v.vehicleName?.toLowerCase() === name);
      if (vehicle) {
        entities.vehicles.push(vehicle);
      }
    }
  });

  for (const brand of BRAND_NAMES) {
    if (lowerMessage.includes(brand)) {
      entities.make = brand.charAt(0).toUpperCase() + brand.slice(1);
      break;
    }
  }

  const modelMatch = lowerMessage.match(/(?:honda|toyota|ford|mazda|bmw|hyundai|kia|nissan|suzuki|tata|mahindra)\s+([a-z]+)/i);
  if (modelMatch) {
    entities.model = modelMatch[1].charAt(0).toUpperCase() + modelMatch[1].slice(1);
  }

  const vinMatch = message.match(/[A-HJ-NPR-Z0-9]{17}/i);
  if (vinMatch) {
    entities.vin = vinMatch[0].toUpperCase();
  }

  const plateMatch = message.match(/[A-Z0-9]{2,3}[-\s]?[A-Z0-9]{4,6}/i);
  if (plateMatch) {
    entities.registration = plateMatch[0].toUpperCase();
  }

  const dtcMatch = message.match(/[Pp][0-9][0-9A-Fa-f]{3}/);
  if (dtcMatch) {
    entities.dtcCode = dtcMatch[0].toUpperCase();
  }

  if (lowerMessage.includes('critical')) entities.alertType = 'CRITICAL';
  else if (lowerMessage.includes('high')) entities.alertType = 'HIGH';
  else if (lowerMessage.includes('medium')) entities.alertType = 'MEDIUM';
  else if (lowerMessage.includes('low')) entities.alertType = 'LOW';

  if (lowerMessage.includes('severe')) entities.severity = 'CRITICAL';
  else if (lowerMessage.includes('urgent')) entities.severity = 'HIGH';

  return entities;
}
