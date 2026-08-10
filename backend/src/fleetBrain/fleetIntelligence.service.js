import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { isPersistenceAvailable } from '../services/receptionistTenantResolver.service.js';

/**
 * Fleet Brain Fleet Intelligence.
 * Answers fleet questions ("which trucks require maintenance?",
 * "which drivers were speeding?", "show today's active vehicles") from
 * live fleet data, and exposes fleet KPIs for the context engine.
 */

const FLEET_QUERY_PATTERNS = [
  { queryType: 'MAINTENANCE_DUE', patterns: [/maintenance (due|needed|required|upcoming)/i, /(which|what) (trucks?|vehicles?) (require|need|are due for)/i, /service (due|needed)/i, /need (a )?(service|check)/i] },
  { queryType: 'SPEEDING_DRIVERS', patterns: [/speeding/i, /spee?d (limit|violation|exceeded)/i, /fast driving/i] },
  { queryType: 'ACTIVE_VEHICLES', patterns: [/active vehicles?/i, /vehicles? (on the road|on the move|running) (today|now)/i, /how many vehicles? (are )?(active|online|moving)/i] },
  { queryType: 'DTC_ALERTS', patterns: [/dtc|fault codes?|error codes?/i, /check engine/i] },
  { queryType: 'FUEL_USAGE', patterns: [/fuel (usage|consumption|cost)/i, /how much fuel/i, /fuel (is )?(high|expensive)/i] },
  { queryType: 'DOWNTIME', patterns: [/downtime|out of service/i, /vehicles? (down|offline)/i] },
  { queryType: 'UTILIZATION', patterns: [/utilization|how (often|frequently) (are|is) (my|our) vehicles/i, /idle time/i] },
  { queryType: 'ALERTS', patterns: [/active alerts?/i, /(any|open) alerts/i, /what.*alert/i] },
  { queryType: 'TRIP_ACTIVITY', patterns: [/trips? (today|this week)/i, /how many trips/i] },
];

export function classifyFleetQuery(message = '') {
  for (const entry of FLEET_QUERY_PATTERNS) {
    if (entry.patterns.some(p => p.test(message))) return entry.queryType;
  }
  return 'UNKNOWN';
}

export async function answerFleetQuery({ userId, query = '', limit = 20 }) {
  const queryType = classifyFleetQuery(query);
  if (queryType === 'UNKNOWN') {
    return { queryType, result: null, message: 'Fleet question not recognized', answerable: false };
  }
  if (!isPersistenceAvailable()) {
    return { queryType, result: null, message: 'Fleet data unavailable (persistence not connected)', answerable: false };
  }

  try {
    const result = await executeFleetQuery({ userId, queryType, limit });
    return { queryType, result, answerable: true, answeredAt: new Date().toISOString() };
  } catch (err) {
    logger.warn('FLEET_QUERY_FAILED', { userId, queryType, error: err.message });
    return { queryType, result: null, message: 'Fleet query failed', answerable: false };
  }
}

async function executeFleetQuery({ userId, queryType, limit }) {
  const sinceStartOfDay = new Date();
  sinceStartOfDay.setHours(0, 0, 0, 0);

  switch (queryType) {
    case 'MAINTENANCE_DUE': {
      const [vehicles, maintenance] = await Promise.all([
        prisma.vehicle.findMany({ where: { userId }, select: { id: true, name: true, plateNumber: true, status: true } }),
        prisma.maintenanceRecord.findMany({
          where: { vehicle: { userId } },
          select: { vehicleId: true, type: true, status: true, scheduledDate: true, odometer: true },
          orderBy: { scheduledDate: 'asc' },
        }),
      ]);
      const due = new Set(maintenance.filter(m => m.status === 'PENDING' || m.status === 'SCHEDULED').map(m => m.vehicleId));
      return {
        label: 'Vehicles with pending or scheduled maintenance',
        vehicles: vehicles.filter(v => due.has(v.id)).slice(0, limit).map(v => ({
          id: v.id, name: v.name, plateNumber: v.plateNumber, status: v.status, due: true,
        })),
        count: vehicles.filter(v => due.has(v.id)).length,
      };
    }

    case 'SPEEDING_DRIVERS': {
      const alerts = await prisma.alert.findMany({
        where: { vehicle: { userId }, alertType: 'SPEEDING', createdAt: { gte: sinceStartOfDay } },
        select: { id: true, message: true, severity: true, createdAt: true, vehicle: { select: { id: true, name: true, plateNumber: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return {
        label: 'Drivers with speeding alerts today',
        alerts: alerts.map(a => ({ id: a.id, vehicle: a.vehicle.name, plateNumber: a.vehicle.plateNumber, severity: a.severity, at: a.createdAt })),
        count: alerts.length,
      };
    }

    case 'ACTIVE_VEHICLES': {
      const [vehicleCount, tripCount] = await Promise.all([
        prisma.vehicle.count({ where: { userId, status: { in: ['ACTIVE', 'ON_TRIP', 'MOVING'] } } }),
        prisma.tripLog.count({ where: { vehicle: { userId }, endTime: null } }),
      ]);
      return {
        label: 'Active vehicles today',
        activeVehicles: vehicleCount,
        vehiclesOnTripRightNow: tripCount,
      };
    }

    case 'DTC_ALERTS': {
      const alerts = await prisma.alert.findMany({
        where: { vehicle: { userId }, alertType: 'DTC' },
        select: { id: true, message: true, severity: true, createdAt: true, vehicle: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return { label: 'Latest DTC alerts', alerts, count: alerts.length };
    }

    case 'FUEL_USAGE': {
      const records = await prisma.fuelLog.findMany({
        where: { vehicle: { userId } },
        select: { liters: true, cost: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      const totalLiters = records.reduce((s, r) => s + (r.liters || 0), 0);
      const totalCost = records.reduce((s, r) => s + (r.cost || 0), 0);
      return { label: 'Fuel usage (last 100 records)', totalLiters, totalCost, records: records.length };
    }

    case 'DOWNTIME': {
      const vehicles = await prisma.vehicle.findMany({
        where: { userId, status: { in: ['MAINTENANCE', 'INACTIVE', 'DOWN', 'OFFLINE'] } },
        select: { id: true, name: true, plateNumber: true, status: true },
      });
      return { label: 'Vehicles currently down or out of service', vehicles, count: vehicles.length };
    }

    case 'UTILIZATION': {
      const vehicles = await prisma.vehicle.findMany({ where: { userId }, select: { id: true, name: true, status: true } });
      const tripsToday = await prisma.tripLog.count({ where: { vehicle: { userId }, startTime: { gte: sinceStartOfDay } } });
      return {
        label: 'Fleet utilization',
        totalVehicles: vehicles.length,
        tripsToday,
        activeRatio: vehicles.length ? Math.round((vehicles.filter(v => v.status === 'ACTIVE').length / vehicles.length) * 100) : 0,
      };
    }

    case 'ALERTS': {
      const alerts = await prisma.alert.findMany({
        where: { vehicle: { userId }, resolvedAt: null },
        select: { id: true, alertType: true, message: true, severity: true, createdAt: true, vehicle: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return { label: 'Open alerts', alerts, count: alerts.length };
    }

    case 'TRIP_ACTIVITY': {
      const trips = await prisma.tripLog.count({ where: { vehicle: { userId }, startTime: { gte: sinceStartOfDay } } });
      return { label: 'Trips today', trips };
    }

    default:
      return null;
  }
}

export async function getFleetKpis(userId, { days = 30 } = {}) {
  if (!isPersistenceAvailable()) return {};
  try {
    const since = new Date(Date.now() - days * 86400000);
    const [vehicleCount, activeVehicles, openAlerts, trips, maintenanceDue, fuelRecords] = await Promise.all([
      prisma.vehicle.count({ where: { userId } }),
      prisma.vehicle.count({ where: { userId, status: { in: ['ACTIVE', 'ON_TRIP', 'MOVING'] } } }),
      prisma.alert.count({ where: { vehicle: { userId }, resolvedAt: null } }),
      prisma.tripLog.count({ where: { vehicle: { userId }, startTime: { gte: since } } }),
      prisma.maintenanceRecord.count({ where: { vehicle: { userId }, status: { in: ['PENDING', 'SCHEDULED'] } } }),
      prisma.fuelLog.findMany({ where: { vehicle: { userId }, createdAt: { gte: since } }, select: { liters: true, cost: true } }),
    ]);
    return {
      vehicleCount,
      activeVehicles,
      openAlerts,
      trips,
      maintenanceDue,
      totalFuelLiters: fuelRecords.reduce((s, r) => s + (r.liters || 0), 0),
      totalFuelCost: fuelRecords.reduce((s, r) => s + (r.cost || 0), 0),
      days,
    };
  } catch (err) {
    logger.warn('FLEET_KPIS_FAILED', { userId, error: err.message });
    return {};
  }
}
