import logger from '../utils/logger.js';
import * as liveData from './liveData.service.js';

const ERROR_MESSAGES = {
  VALIDATION: 'I need more information to look that up. Please provide the specific details.',
  NOT_FOUND: 'I could not find that information in the system.',
  TIMEOUT: 'The request took too long. Please try again.',
  SYSTEM: 'I encountered a system error. Our team has been notified.',
  AUTH: 'You do not have permission to access this information.',
};

function wrapResult(success, data, errorMessage = null) {
  return { success, data, error: errorMessage };
}

async function safeExecute(userId, toolName, handler) {
  try {
    const start = Date.now();
    const result = await handler();
    const latency = Date.now() - start;
    logger.info('LIVE_TOOL_EXECUTED', { tool: toolName, userId, latencyMs: latency });
    return wrapResult(true, result);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return wrapResult(false, null, err.message || ERROR_MESSAGES.VALIDATION);
    }
    if (err.message?.includes('not found') || err.message?.includes('access denied')) {
      return wrapResult(false, null, ERROR_MESSAGES.NOT_FOUND);
    }
    if (err.message?.includes('timed out')) {
      return wrapResult(false, null, ERROR_MESSAGES.TIMEOUT);
    }
    logger.error('LIVE_TOOL_FAILED', { tool: toolName, userId, error: err.message });
    return wrapResult(false, null, ERROR_MESSAGES.SYSTEM);
  }
}

function buildVoiceSummary(fleet) {
  if (!fleet) return 'Fleet data is currently unavailable.';
  const parts = [];
  parts.push(`Your fleet has ${fleet.totalVehicles} vehicle${fleet.totalVehicles !== 1 ? 's' : ''}.`);
  parts.push(`${fleet.onlineVehicles} are online, ${fleet.offlineVehicles} offline.`);
  if (fleet.criticalAlerts > 0) parts.push(`There ${fleet.criticalAlerts === 1 ? 'is' : 'are'} ${fleet.criticalAlerts} critical alert${fleet.criticalAlerts !== 1 ? 's' : ''}.`);
  if (fleet.maintenanceDue > 0) parts.push(`${fleet.maintenanceDue} maintenance item${fleet.maintenanceDue !== 1 ? 's are' : ' is'} due.`);
  parts.push(`Fleet health score is ${fleet.healthScore} out of 100, which is ${fleet.riskLevel}.`);
  return parts.join(' ');
}

export const LIVE_TOOL_DEFINITIONS = [
  {
    type: 'function',
    name: 'get_fleet_summary',
    description: 'Get an overall summary of the fleet including total vehicles, online/offline counts, critical alerts, maintenance due, and fleet health score.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    type: 'function',
    name: 'get_vehicle_status',
    description: 'Get detailed status for a specific vehicle by its ID or plate number. Returns live diagnostics, GPS location, active alerts, and DTC codes.',
    parameters: {
      type: 'object',
      properties: {
        identifier: { type: 'string', description: 'Vehicle ID or plate number (e.g. "ABC123" or vehicle UUID)' },
      },
      required: ['identifier'],
    },
  },
  {
    type: 'function',
    name: 'get_driver_information',
    description: 'Get driver behavior information and scores for a specific vehicle. Returns recent behavior events and average driver score.',
    parameters: {
      type: 'object',
      properties: {
        vehicleId: { type: 'string', description: 'Vehicle ID' },
      },
      required: ['vehicleId'],
    },
  },
  {
    type: 'function',
    name: 'get_live_diagnostics',
    description: 'Get real-time OBD-II diagnostics for a specific vehicle. Returns RPM, speed, coolant temperature, fuel level, battery voltage, engine load, and active DTC fault codes.',
    parameters: {
      type: 'object',
      properties: {
        vehicleId: { type: 'string', description: 'Vehicle ID' },
      },
      required: ['vehicleId'],
    },
  },
  {
    type: 'function',
    name: 'get_maintenance_schedule',
    description: 'Get maintenance tasks that are due or upcoming. Optionally filter by vehicle.',
    parameters: {
      type: 'object',
      properties: {
        vehicleId: { type: 'string', description: 'Optional vehicle ID to filter by' },
      },
    },
  },
  {
    type: 'function',
    name: 'get_alert_summary',
    description: 'Get a summary of active alerts across the fleet or for a specific vehicle. Shows count by severity (critical, high, medium, low).',
    parameters: {
      type: 'object',
      properties: {
        vehicleId: { type: 'string', description: 'Optional vehicle ID to filter by' },
      },
    },
  },
  {
    type: 'function',
    name: 'get_customer_information',
    description: 'Look up customer information by phone number, email, name, or customer ID. Returns contact details, lead score, interaction history, and recent activity.',
    parameters: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Customer phone number in E.164 format' },
        email: { type: 'string', description: 'Customer email address' },
        name: { type: 'string', description: 'Customer name to search for' },
        customerId: { type: 'string', description: 'Customer ID in the system' },
      },
    },
  },
  {
    type: 'function',
    name: 'get_company_information',
    description: 'Get company details including industry, location, total vehicles, and total users.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    type: 'function',
    name: 'get_demo_schedule',
    description: 'Get upcoming scheduled demos and appointments. Returns dates, caller names, purposes, and statuses.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    type: 'function',
    name: 'get_support_ticket_status',
    description: 'Get support ticket summary or look up a specific ticket. Returns counts by status and urgency.',
    parameters: {
      type: 'object',
      properties: {
        ticketId: { type: 'string', description: 'Optional ticket ID to look up a specific ticket' },
      },
    },
  },
  {
    type: 'function',
    name: 'get_dashboard_statistics',
    description: 'Get a comprehensive dashboard overview combining fleet summary, alerts, maintenance, demos, and support ticket statistics all in one call.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    type: 'function',
    name: 'get_recent_activity',
    description: 'Get recent fleet activity including trips, alerts, and appointments.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of activities to return (max 50, default 10)' },
      },
    },
  },
];

const TOOL_HANDLERS = {
  get_fleet_summary: async (userId, args) => {
    return safeExecute(userId, 'get_fleet_summary', () => liveData.getFleetSummary(userId));
  },

  get_vehicle_status: async (userId, args) => {
    const identifier = args?.identifier;
    if (!identifier) return wrapResult(false, null, 'Please provide a vehicle ID or plate number.');
    return safeExecute(userId, 'get_vehicle_status', () => liveData.getVehicleStatus(userId, identifier));
  },

  get_driver_information: async (userId, args) => {
    const vehicleId = args?.vehicleId;
    if (!vehicleId) return wrapResult(false, null, 'Please provide a vehicle ID.');
    return safeExecute(userId, 'get_driver_information', () => liveData.getDriverInformation(userId, vehicleId));
  },

  get_live_diagnostics: async (userId, args) => {
    const vehicleId = args?.vehicleId;
    if (!vehicleId) return wrapResult(false, null, 'Please provide a vehicle ID.');
    return safeExecute(userId, 'get_live_diagnostics', () => liveData.getLiveDiagnostics(userId, vehicleId));
  },

  get_maintenance_schedule: async (userId, args) => {
    const vehicleId = args?.vehicleId || null;
    return safeExecute(userId, 'get_maintenance_schedule', () => liveData.getMaintenanceSchedule(userId, vehicleId));
  },

  get_alert_summary: async (userId, args) => {
    const vehicleId = args?.vehicleId || null;
    return safeExecute(userId, 'get_alert_summary', () => liveData.getAlertSummary(userId, vehicleId));
  },

  get_customer_information: async (userId, args) => {
    const query = {};
    if (args?.phone) query.phone = args.phone;
    if (args?.email) query.email = args.email;
    if (args?.name) query.name = args.name;
    if (args?.customerId) query.customerId = args.customerId;
    if (Object.keys(query).length === 0) return wrapResult(false, null, 'Please provide a phone number, email, name, or customer ID to search.');
    return safeExecute(userId, 'get_customer_information', () => liveData.getCustomerInformation(userId, query));
  },

  get_company_information: async (userId, args) => {
    return safeExecute(userId, 'get_company_information', () => liveData.getCompanyInformation(userId));
  },

  get_demo_schedule: async (userId, args) => {
    return safeExecute(userId, 'get_demo_schedule', () => liveData.getDemoSchedule(userId));
  },

  get_support_ticket_status: async (userId, args) => {
    const ticketId = args?.ticketId || null;
    return safeExecute(userId, 'get_support_ticket_status', () => liveData.getSupportTicketStatus(userId, ticketId));
  },

  get_dashboard_statistics: async (userId, args) => {
    return safeExecute(userId, 'get_dashboard_statistics', () => liveData.getDashboardStatistics(userId));
  },

  get_recent_activity: async (userId, args) => {
    const limit = args?.limit || 10;
    return safeExecute(userId, 'get_recent_activity', () => liveData.getRecentActivity(userId, limit));
  },
};

export function isLiveTool(name) {
  return name in TOOL_HANDLERS;
}

export function getLiveToolNames() {
  return Object.keys(TOOL_HANDLERS);
}

export async function executeLiveTool(userId, toolName, args = {}) {
  const handler = TOOL_HANDLERS[toolName];
  if (!handler) {
    logger.warn('UNKNOWN_LIVE_TOOL_CALLED', { toolName, userId });
    return wrapResult(false, null, `Unknown tool: ${toolName}`);
  }
  return handler(userId, args);
}

export function formatToolResultForVoice(result) {
  if (!result.success) {
    return result.error || ERROR_MESSAGES.SYSTEM;
  }
  return null;
}

export { buildVoiceSummary };
