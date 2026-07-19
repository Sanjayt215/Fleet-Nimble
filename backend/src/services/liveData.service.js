import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import * as fleetData from './fleetDataService.js';
import * as crm from './receptionistCRM.service.js';
import * as appointments from './receptionistAppointment.service.js';
import * as support from './receptionistSupport.service.js';

class LiveDataCache {
  constructor(ttlMs = 30000) {
    this._store = new Map();
    this._ttl = ttlMs;
  }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > this._ttl) {
      this._store.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key, data) {
    this._store.set(key, { data, ts: Date.now() });
  }

  clear() {
    this._store.clear();
  }

  clearPrefix(prefix) {
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) this._store.delete(key);
    }
  }

  get size() {
    return this._store.size;
  }
}

const cache = new LiveDataCache();
const CACHE_HITS = { hits: 0, misses: 0 };
const TOOL_USAGE = new Map();

function recordToolUsage(toolName, latencyMs, success) {
  if (!TOOL_USAGE.has(toolName)) {
    TOOL_USAGE.set(toolName, { calls: 0, failures: 0, totalLatency: 0 });
  }
  const stats = TOOL_USAGE.get(toolName);
  stats.calls++;
  if (!success) stats.failures++;
  stats.totalLatency += latencyMs;
}

function recordCacheHit(isHit) {
  if (isHit) CACHE_HITS.hits++;
  else CACHE_HITS.misses++;
}

function getCacheHitRate() {
  const total = CACHE_HITS.hits + CACHE_HITS.misses;
  return total === 0 ? 0 : Math.round((CACHE_HITS.hits / total) * 100);
}

function getToolUsageStats() {
  const result = {};
  for (const [name, stats] of TOOL_USAGE) {
    result[name] = {
      calls: stats.calls,
      failures: stats.failures,
      avgLatencyMs: stats.calls > 0 ? Math.round(stats.totalLatency / stats.calls) : 0,
    };
  }
  return result;
}

async function withTimeout(promise, ms = 10000) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

function validateId(value, label) {
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${label} is required`);
  }
  return value.trim();
}

function validateOptionalId(value) {
  if (!value) return null;
  return value.trim();
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

async function verifyTenantAccess(userId) {
  if (!userId) throw new ValidationError('User ID is required');
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, companyId: true, role: true },
  });
  if (!user) throw new ValidationError('User not found');
  return user;
}

async function verifyVehicleAccess(userId, vehicleId) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, userId, deletedAt: null },
    select: { id: true },
  });
  if (!vehicle) throw new ValidationError('Vehicle not found or access denied');
  return vehicle;
}

async function logAuditEvent(userId, action, metadata = {}) {
  try {
    await prisma.aiReceptionistAuditLog.create({
      data: { userId, eventType: `live_data_${action}`, metadata },
    });
  } catch (err) {
    logger.warn('AUDIT_LOG_FAILED', { userId, action, error: err.message });
  }
}

export function validateVehicleIdentifier(identifier) {
  if (!identifier || typeof identifier !== 'string') return null;
  const trimmed = identifier.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

export function getUserRole(user) {
  return user?.role || 'VIEWER';
}

const TIMEOUT_MS = parseInt(process.env.LIVE_DATA_TIMEOUT_MS || '10000', 10);
const RESULT_LIMIT = parseInt(process.env.LIVE_DATA_RESULT_LIMIT || '50', 10);

export async function getFleetSummary(userId) {
  const start = Date.now();
  const cacheKey = `fleet_summary_${userId}`;
  const cached = cache.get(cacheKey);
  if (cached) { recordCacheHit(true); return cached; }
  recordCacheHit(false);

  try {
    await verifyTenantAccess(userId);
    const summary = await withTimeout(fleetData.getFleetSummary(userId), TIMEOUT_MS);
    cache.set(cacheKey, summary);
    recordToolUsage('get_fleet_summary', Date.now() - start, true);
    await logAuditEvent(userId, 'fleet_summary');
    return summary;
  } catch (err) {
    recordToolUsage('get_fleet_summary', Date.now() - start, false);
    logger.error('LIVE_DATA_FLEET_SUMMARY_FAILED', { userId, error: err.message });
    throw err;
  }
}

export async function getVehicleStatus(userId, identifier) {
  const start = Date.now();
  const id = validateVehicleIdentifier(identifier);
  if (!id) throw new ValidationError('Vehicle identifier (ID or plate number) is required');

  const cacheKey = `vehicle_status_${userId}_${id}`;
  const cached = cache.get(cacheKey);
  if (cached) { recordCacheHit(true); return cached; }
  recordCacheHit(false);

  try {
    await verifyTenantAccess(userId);

    let vehicle;
    if (id.length <= 10 && /^[A-Z0-9-]+$/i.test(id)) {
      try {
        vehicle = await withTimeout(fleetData.getVehicleByPlate(userId, id), TIMEOUT_MS);
      } catch {
        vehicle = await withTimeout(fleetData.getVehicle(userId, id), TIMEOUT_MS);
      }
    } else {
      vehicle = await withTimeout(fleetData.getVehicle(userId, id), TIMEOUT_MS);
    }

    const result = {
      id: vehicle.id,
      name: vehicle.name || `${vehicle.make || ''} ${vehicle.model || ''}`.trim() || 'Unknown',
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      plateNumber: vehicle.plateNumber,
      vin: vehicle.vin,
      status: vehicle.status,
      telemetryOnline: vehicle.telemetryOnline,
      ignitionOn: vehicle.ignitionOn,
      lastObdAt: vehicle.lastObdAt,
      odometer: vehicle.odometer,
      liveState: vehicle.liveState ? {
        vehicleStatus: vehicle.liveState.vehicleStatus,
        rpm: vehicle.liveState.rpm,
        speed: vehicle.liveState.speed,
        fuelLevel: vehicle.liveState.fuelLevel,
        coolantTemp: vehicle.liveState.coolantTemp,
        batteryVoltage: vehicle.liveState.batteryVoltage,
        engineLoad: vehicle.liveState.engineLoad,
        lastUpdate: vehicle.liveState.lastUpdate,
      } : null,
      gpsLocation: vehicle.gpsLocation ? {
        lat: vehicle.gpsLocation.lat,
        lng: vehicle.gpsLocation.lng,
        address: vehicle.gpsLocation.address,
        speed: vehicle.gpsLocation.speed,
        heading: vehicle.gpsLocation.heading,
        updatedAt: vehicle.gpsLocation.updatedAt,
      } : null,
      activeAlerts: (vehicle.alerts || []).length,
      activeDTCs: (vehicle.dtcCodes || []).length,
    };

    cache.set(cacheKey, result);
    recordToolUsage('get_vehicle_status', Date.now() - start, true);
    await logAuditEvent(userId, 'vehicle_status', { vehicleId: vehicle.id, identifier });
    return result;
  } catch (err) {
    recordToolUsage('get_vehicle_status', Date.now() - start, false);
    logger.error('LIVE_DATA_VEHICLE_STATUS_FAILED', { userId, identifier, error: err.message });
    throw err;
  }
}

export async function getDriverInformation(userId, vehicleId) {
  const start = Date.now();
  const id = validateVehicleIdentifier(vehicleId);
  if (!id) throw new ValidationError('Vehicle identifier is required');

  const cacheKey = `driver_info_${userId}_${id}`;
  const cached = cache.get(cacheKey);
  if (cached) { recordCacheHit(true); return cached; }
  recordCacheHit(false);

  try {
    const user = await verifyTenantAccess(userId);

    const vehicle = await withTimeout(prisma.vehicle.findFirst({
      where: { id, userId, deletedAt: null },
      select: { id: true, plateNumber: true, make: true, model: true },
    }), TIMEOUT_MS);

    if (!vehicle) throw new ValidationError('Vehicle not found');

    const [behaviorEvents, driverScores] = await Promise.all([
      withTimeout(prisma.driverBehaviorEvent.findMany({
        where: { vehicleId: id },
        orderBy: { timestamp: 'desc' },
        take: RESULT_LIMIT,
      }), TIMEOUT_MS),
      withTimeout(prisma.driverScore.findMany({
        where: { vehicleId: id },
        orderBy: { periodEnd: 'desc' },
        take: 10,
      }), TIMEOUT_MS),
    ]);

    const result = {
      vehicle: `${vehicle.make || ''} ${vehicle.model || ''}`.trim() || vehicle.plateNumber,
      plateNumber: vehicle.plateNumber,
      totalBehaviorEvents: behaviorEvents.length,
      recentEvents: behaviorEvents.slice(0, 10).map(e => ({
        type: e.eventType,
        severity: e.severity,
        timestamp: e.timestamp,
        speed: e.speed,
        value: e.value,
      })),
      driverScores: driverScores.map(s => ({
        score: s.score,
        periodStart: s.periodStart,
        periodEnd: s.periodEnd,
        harshBrakes: s.harshBrakes,
        rapidAccelerations: s.rapidAccelerations,
        harshCornering: s.harshCornering,
        speedingEvents: s.speedingEvents,
        excessiveIdle: s.excessiveIdle,
      })),
      averageScore: driverScores.length > 0
        ? Math.round(driverScores.reduce((sum, s) => sum + s.score, 0) / driverScores.length)
        : null,
    };

    cache.set(cacheKey, result);
    recordToolUsage('get_driver_information', Date.now() - start, true);
    await logAuditEvent(userId, 'driver_information', { vehicleId });
    return result;
  } catch (err) {
    recordToolUsage('get_driver_information', Date.now() - start, false);
    logger.error('LIVE_DATA_DRIVER_INFO_FAILED', { userId, vehicleId, error: err.message });
    throw err;
  }
}

export async function getLiveDiagnostics(userId, vehicleId) {
  const start = Date.now();
  const id = validateVehicleIdentifier(vehicleId);
  if (!id) throw new ValidationError('Vehicle identifier is required');

  const cacheKey = `live_diag_${userId}_${id}`;
  const cached = cache.get(cacheKey);
  if (cached) { recordCacheHit(true); return cached; }
  recordCacheHit(false);

  try {
    await verifyTenantAccess(userId);
    await verifyVehicleAccess(userId, id);

    const [telemetry, dtcCodes] = await Promise.all([
      withTimeout(prisma.obdLiveData.findFirst({
        where: { vehicleId: id },
        orderBy: { recordedAt: 'desc' },
      }), TIMEOUT_MS),
      withTimeout(prisma.dtcCode.findMany({
        where: { vehicleId: id, active: true },
        orderBy: { detectedAt: 'desc' },
        take: RESULT_LIMIT,
      }), TIMEOUT_MS),
    ]);

    const result = {
      vehicleId: id,
      telemetry: telemetry ? {
        recordedAt: telemetry.recordedAt,
        rpm: telemetry.rpm,
        speed: telemetry.speed,
        coolantTemp: telemetry.coolantTemp,
        fuelLevel: telemetry.fuelLevel,
        batteryVoltage: telemetry.batteryVoltage,
        engineLoad: telemetry.engineLoad,
        throttlePosition: telemetry.throttlePosition,
        intakeTemp: telemetry.intakeTemp,
        maf: telemetry.maf,
        fuelPressure: telemetry.fuelPressure,
        timingAdvance: telemetry.timingAdvance,
        o2Voltage: telemetry.o2Voltage,
        calculatedLoad: telemetry.calculatedLoad,
        fuelType: telemetry.fuelType,
        engineOilTemp: telemetry.engineOilTemp,
      } : null,
      activeDTCs: dtcCodes.map(d => ({
        code: d.code,
        description: d.description,
        severity: d.severity,
        detectedAt: d.detectedAt,
        occurrenceCount: d.occurrenceCount,
      })),
      dtcCount: dtcCodes.length,
    };

    cache.set(cacheKey, result);
    recordToolUsage('get_live_diagnostics', Date.now() - start, true);
    await logAuditEvent(userId, 'live_diagnostics', { vehicleId });
    return result;
  } catch (err) {
    recordToolUsage('get_live_diagnostics', Date.now() - start, false);
    logger.error('LIVE_DATA_DIAGNOSTICS_FAILED', { userId, vehicleId, error: err.message });
    throw err;
  }
}

export async function getMaintenanceSchedule(userId, vehicleId) {
  const start = Date.now();
  const cacheKey = `maintenance_${userId}_${vehicleId || 'all'}`;
  const cached = cache.get(cacheKey);
  if (cached) { recordCacheHit(true); return cached; }
  recordCacheHit(false);

  try {
    await verifyTenantAccess(userId);
    const items = await withTimeout(fleetData.getMaintenance(userId, vehicleId || undefined), TIMEOUT_MS);

    const result = {
      totalDue: items.length,
      overdue: items.filter(m => m.dueDate && new Date(m.dueDate) < new Date()).length,
      dueThisMonth: items.filter(m => {
        if (!m.dueDate) return false;
        const due = new Date(m.dueDate);
        const now = new Date();
        return due >= now && due <= new Date(now.getFullYear(), now.getMonth() + 1, 0);
      }).length,
      items: items.slice(0, 20).map(m => ({
        id: m.id,
        task: m.taskName || m.description,
        vehicle: m.vehicle ? `${m.vehicle.make || ''} ${m.vehicle.model || ''}`.trim() || m.vehicle.plateNumber : null,
        dueDate: m.dueDate,
        dueKm: m.dueKm,
        priority: m.priority,
        status: m.completed ? 'completed' : 'pending',
        notes: m.notes,
      })),
    };

    cache.set(cacheKey, result);
    recordToolUsage('get_maintenance_schedule', Date.now() - start, true);
    await logAuditEvent(userId, 'maintenance_schedule', { vehicleId });
    return result;
  } catch (err) {
    recordToolUsage('get_maintenance_schedule', Date.now() - start, false);
    logger.error('LIVE_DATA_MAINTENANCE_FAILED', { userId, vehicleId, error: err.message });
    throw err;
  }
}

export async function getAlertSummary(userId, vehicleId) {
  const start = Date.now();
  const cacheKey = `alerts_${userId}_${vehicleId || 'all'}`;
  const cached = cache.get(cacheKey);
  if (cached) { recordCacheHit(true); return cached; }
  recordCacheHit(false);

  try {
    await verifyTenantAccess(userId);
    const alerts = await withTimeout(fleetData.getAlerts(userId, vehicleId || undefined), TIMEOUT_MS);

    const severityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const a of alerts) {
      severityCounts[a.severity] = (severityCounts[a.severity] || 0) + 1;
    }

    const result = {
      total: alerts.length,
      bySeverity: severityCounts,
      criticalCount: severityCounts.CRITICAL,
      highCount: severityCounts.HIGH,
      mediumCount: severityCounts.MEDIUM,
      lowCount: severityCounts.LOW,
      recentAlerts: alerts.slice(0, 10).map(a => ({
        type: a.type,
        severity: a.severity,
        message: a.message || a.description,
        vehicle: a.vehicle ? `${a.vehicle.make || ''} ${a.vehicle.model || ''}`.trim() || a.vehicle.plateNumber : null,
        createdAt: a.createdAt,
        read: a.read,
      })),
    };

    cache.set(cacheKey, result);
    recordToolUsage('get_alert_summary', Date.now() - start, true);
    await logAuditEvent(userId, 'alert_summary', { vehicleId });
    return result;
  } catch (err) {
    recordToolUsage('get_alert_summary', Date.now() - start, false);
    logger.error('LIVE_DATA_ALERT_SUMMARY_FAILED', { userId, vehicleId, error: err.message });
    throw err;
  }
}

export async function getCustomerInformation(userId, query) {
  const start = Date.now();

  if (!query || typeof query !== 'object') throw new ValidationError('Search query is required');

  const { phone, email, name, customerId } = query;
  if (!phone && !email && !name && !customerId) {
    throw new ValidationError('Provide at least one of: phone, email, name, or customerId');
  }

  try {
    await verifyTenantAccess(userId);

    let customer;
    if (customerId) {
      customer = await withTimeout(crm.getCustomerById(userId, customerId), TIMEOUT_MS);
    } else {
      const where = { userId };
      const orClauses = [];
      if (phone) orClauses.push({ phone: phone.replace(/[^\d+]/g, '') });
      if (email) orClauses.push({ email: email.toLowerCase() });
      if (name) orClauses.push({ name: { contains: name, mode: 'insensitive' } });
      if (orClauses.length > 0) where.OR = orClauses;
      customer = await withTimeout(prisma.receptionistCustomer.findFirst({ where }), TIMEOUT_MS);
    }

    if (!customer) return { found: false, message: 'Customer not found' };

    const [notes, appointments_list, tickets] = await Promise.all([
      withTimeout(prisma.receptionistCustomerNote.findMany({
        where: { customerId: customer.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }), TIMEOUT_MS),
      withTimeout(prisma.aiReceptionistAppointment.findMany({
        where: { userId, callerName: customer.name },
        orderBy: { scheduledDate: 'desc' },
        take: 5,
      }), TIMEOUT_MS),
      withTimeout(prisma.aiReceptionistSupportTicket.findMany({
        where: { userId, callerName: customer.name },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }), TIMEOUT_MS),
    ]);

    const result = {
      found: true,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        companyName: customer.companyName,
        fleetSize: customer.fleetSize,
        status: customer.status,
        leadScore: customer.leadScore,
        totalCalls: customer.totalCalls,
        totalAppointments: customer.totalAppointments,
        lastContactAt: customer.lastContactAt,
        lastIntent: customer.lastIntent,
        lastSummary: customer.lastSummary,
      },
      recentNotes: notes.map(n => ({ content: n.content, type: n.noteType, createdAt: n.createdAt })),
      recentAppointments: appointments_list.map(a => ({
        purpose: a.meetingPurpose,
        date: a.scheduledDate,
        status: a.status,
      })),
      recentTickets: tickets.map(t => ({
        title: t.issueTitle,
        status: t.status,
        urgency: t.urgency,
        createdAt: t.createdAt,
      })),
    };

    recordToolUsage('get_customer_information', Date.now() - start, true);
    await logAuditEvent(userId, 'customer_information', { customerId: customer.id, query });
    return result;
  } catch (err) {
    recordToolUsage('get_customer_information', Date.now() - start, false);
    logger.error('LIVE_DATA_CUSTOMER_INFO_FAILED', { userId, query, error: err.message });
    throw err;
  }
}

export async function getCompanyInformation(userId) {
  const start = Date.now();
  const cacheKey = `company_info_${userId}`;
  const cached = cache.get(cacheKey);
  if (cached) { recordCacheHit(true); return cached; }
  recordCacheHit(false);

  try {
    const user = await verifyTenantAccess(userId);
    if (!user.companyId) throw new ValidationError('User does not belong to a company');

    const company = await withTimeout(prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        id: true,
        name: true,
        industry: true,
        address: true,
        phone: true,
        email: true,
        website: true,
        timezone: true,
        settings: true,
        _count: {
          select: {
            vehicles: true,
            users: true,
          },
        },
      },
    }), TIMEOUT_MS);

    if (!company) throw new ValidationError('Company not found');

    const result = {
      id: company.id,
      name: company.name,
      industry: company.industry,
      address: company.address,
      phone: company.phone,
      email: company.email,
      website: company.website,
      timezone: company.timezone,
      totalVehicles: company._count.vehicles,
      totalUsers: company._count.users,
    };

    cache.set(cacheKey, result);
    recordToolUsage('get_company_information', Date.now() - start, true);
    await logAuditEvent(userId, 'company_information');
    return result;
  } catch (err) {
    recordToolUsage('get_company_information', Date.now() - start, false);
    logger.error('LIVE_DATA_COMPANY_INFO_FAILED', { userId, error: err.message });
    throw err;
  }
}

export async function getDemoSchedule(userId) {
  const start = Date.now();
  const cacheKey = `demo_schedule_${userId}`;
  const cached = cache.get(cacheKey);
  if (cached) { recordCacheHit(true); return cached; }
  recordCacheHit(false);

  try {
    await verifyTenantAccess(userId);
    const upcoming = await withTimeout(appointments.getUpcomingAppointments(userId, 20), TIMEOUT_MS);

    const result = {
      totalUpcoming: upcoming.length,
      appointments: upcoming.map(a => ({
        id: a.id,
        callerName: a.callerName,
        companyName: a.companyName,
        purpose: a.meetingPurpose,
        date: a.scheduledDate,
        duration: a.durationMinutes,
        status: a.status,
        timezone: a.timezone,
        calendarProvider: a.calendarProvider,
      })),
    };

    cache.set(cacheKey, result);
    recordToolUsage('get_demo_schedule', Date.now() - start, true);
    await logAuditEvent(userId, 'demo_schedule');
    return result;
  } catch (err) {
    recordToolUsage('get_demo_schedule', Date.now() - start, false);
    logger.error('LIVE_DATA_DEMO_SCHEDULE_FAILED', { userId, error: err.message });
    throw err;
  }
}

export async function getSupportTicketStatus(userId, ticketId) {
  const start = Date.now();

  try {
    await verifyTenantAccess(userId);

    let tickets;
    if (ticketId) {
      const ticket = await withTimeout(support.getSupportTickets(userId, { status: ticketId }), TIMEOUT_MS)
        .catch(() => withTimeout(prisma.aiReceptionistSupportTicket.findFirst({
          where: { id: ticketId, userId },
        }), TIMEOUT_MS));
      tickets = ticket ? [ticket] : [];
    } else {
      tickets = await withTimeout(support.getSupportTickets(userId, { limit: RESULT_LIMIT }), TIMEOUT_MS);
    }

    const items = Array.isArray(tickets)
      ? (tickets.length > 0 && tickets[0]?.items ? tickets[0].items : tickets)
      : [];

    const openCount = items.filter(t =>
      t.status === 'OPEN' || t.status === 'IN_PROGRESS'
    ).length;

    const result = {
      total: items.length,
      open: openCount,
      closed: items.length - openCount,
      byUrgency: {
        CRITICAL: items.filter(t => t.urgency === 'CRITICAL').length,
        HIGH: items.filter(t => t.urgency === 'HIGH').length,
        MEDIUM: items.filter(t => t.urgency === 'MEDIUM').length,
        LOW: items.filter(t => t.urgency === 'LOW').length,
      },
      tickets: items.slice(0, 20).map(t => ({
        id: t.id,
        title: t.issueTitle || t.issueDescription?.substring(0, 100),
        status: t.status,
        urgency: t.urgency,
        callerName: t.callerName,
        createdAt: t.createdAt,
      })),
    };

    recordToolUsage('get_support_ticket_status', Date.now() - start, true);
    await logAuditEvent(userId, 'support_ticket_status', { ticketId });
    return result;
  } catch (err) {
    recordToolUsage('get_support_ticket_status', Date.now() - start, false);
    logger.error('LIVE_DATA_SUPPORT_TICKET_FAILED', { userId, ticketId, error: err.message });
    throw err;
  }
}

export async function getDashboardStatistics(userId) {
  const start = Date.now();
  const cacheKey = `dashboard_stats_${userId}`;
  const cached = cache.get(cacheKey);
  if (cached) { recordCacheHit(true); return cached; }
  recordCacheHit(false);

  try {
    const user = await verifyTenantAccess(userId);

    const [
      fleetSummary,
      alertSummary,
      maintenanceSchedule,
      demoSchedule,
      supportTickets,
    ] = await Promise.allSettled([
      getFleetSummary(userId),
      getAlertSummary(userId),
      getMaintenanceSchedule(userId),
      getDemoSchedule(userId),
      getSupportTicketStatus(userId),
    ]);

    const result = {
      fleet: fleetSummary.status === 'fulfilled' ? fleetSummary.value : null,
      alerts: alertSummary.status === 'fulfilled' ? alertSummary.value : null,
      maintenance: maintenanceSchedule.status === 'fulfilled' ? maintenanceSchedule.value : null,
      demos: demoSchedule.status === 'fulfilled' ? demoSchedule.value : null,
      supportTickets: supportTickets.status === 'fulfilled' ? supportTickets.value : null,
    };

    cache.set(cacheKey, result);
    recordToolUsage('get_dashboard_statistics', Date.now() - start, true);
    await logAuditEvent(userId, 'dashboard_statistics');
    return result;
  } catch (err) {
    recordToolUsage('get_dashboard_statistics', Date.now() - start, false);
    logger.error('LIVE_DATA_DASHBOARD_STATS_FAILED', { userId, error: err.message });
    throw err;
  }
}

export async function getRecentActivity(userId, limit = 10) {
  const start = Date.now();
  const count = Math.min(Math.max(1, limit || 10), 50);

  try {
    await verifyTenantAccess(userId);

    const [recentTrips, recentAlerts, recentAppts] = await Promise.all([
      withTimeout(prisma.tripLog.findMany({
        where: { vehicle: { userId, deletedAt: null } },
        orderBy: { startTime: 'desc' },
        take: count,
        include: { vehicle: { select: { plateNumber: true, make: true, model: true } } },
      }), TIMEOUT_MS),
      withTimeout(prisma.alert.findMany({
        where: { vehicle: { userId, deletedAt: null } },
        orderBy: { createdAt: 'desc' },
        take: count,
        include: { vehicle: { select: { plateNumber: true } } },
      }), TIMEOUT_MS),
      withTimeout(prisma.aiReceptionistAppointment.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: count,
      }), TIMEOUT_MS),
    ]);

    const activities = [];

    for (const trip of recentTrips) {
      activities.push({
        type: 'trip',
        summary: `${trip.vehicle?.plateNumber || 'Vehicle'} trip: ${trip.distanceKm?.toFixed(1)} km`,
        timestamp: trip.startTime,
        details: { distance: trip.distanceKm, duration: trip.durationMinutes, avgSpeed: trip.avgSpeedKmh },
      });
    }

    for (const alert of recentAlerts) {
      activities.push({
        type: 'alert',
        summary: `${alert.type} on ${alert.vehicle?.plateNumber || 'vehicle'}: ${alert.message || alert.description}`,
        timestamp: alert.createdAt,
        details: { severity: alert.severity },
      });
    }

    for (const appt of recentAppts) {
      activities.push({
        type: 'appointment',
        summary: `${appt.meetingPurpose || 'Demo'} with ${appt.callerName}`,
        timestamp: appt.createdAt,
        details: { date: appt.scheduledDate, status: appt.status },
      });
    }

    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const result = {
      total: activities.length,
      activities: activities.slice(0, count),
    };

    recordToolUsage('get_recent_activity', Date.now() - start, true);
    await logAuditEvent(userId, 'recent_activity');
    return result;
  } catch (err) {
    recordToolUsage('get_recent_activity', Date.now() - start, false);
    logger.error('LIVE_DATA_RECENT_ACTIVITY_FAILED', { userId, error: err.message });
    throw err;
  }
}

export function clearCache() {
  cache.clear();
  logger.info('LIVE_DATA_CACHE_CLEARED');
}

export function getMonitoringStats() {
  return {
    cacheSize: cache.size,
    cacheHitRate: getCacheHitRate(),
    toolUsage: getToolUsageStats(),
  };
}

export function formatNumber(n) {
  if (n == null) return '0';
  return Number(n).toLocaleString();
}

export function formatBoolean(v) {
  return v ? 'Yes' : 'No';
}

export function formatList(items, labelKey, max = 5) {
  if (!items || items.length === 0) return 'None';
  const list = items.slice(0, max).map(i => i[labelKey] || i.name || i.title || String(i));
  if (items.length > max) list.push(`and ${items.length - max} more`);
  return list.join(', ');
}
