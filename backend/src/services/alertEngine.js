import prisma from '../utils/prisma.js';
import { detectAnomalies } from './telemetryParser.js';
import logger from '../utils/logger.js';

/**
 * Check telemetry thresholds and create alerts.
 */
async function checkTelemetryThresholds(vehicleId, telemetry) {
  const alerts = [];

  // Fuel low alert
  if (telemetry.fuelLevel != null && telemetry.fuelLevel < 15) {
    alerts.push({
      type: 'FUEL_LOW',
      message: `Fuel level low: ${telemetry.fuelLevel.toFixed(1)}%`,
      severity: telemetry.fuelLevel < 5 ? 'CRITICAL' : 'MEDIUM',
    });
  }

  // Coolant temperature high
  if (telemetry.coolantTemp != null && telemetry.coolantTemp > 100) {
    alerts.push({
      type: 'COOLANT_HIGH',
      message: `Coolant temperature high: ${telemetry.coolantTemp.toFixed(1)}°C`,
      severity: telemetry.coolantTemp > 110 ? 'CRITICAL' : 'HIGH',
    });
  }

  // Battery voltage low
  if (telemetry.batteryVoltage != null && telemetry.batteryVoltage < 12.0) {
    alerts.push({
      type: 'BATTERY_LOW',
      message: `Battery voltage low: ${telemetry.batteryVoltage.toFixed(2)}V`,
      severity: telemetry.batteryVoltage < 11.5 ? 'CRITICAL' : 'HIGH',
    });
  }

  // Engine load high
  if (telemetry.engineLoad != null && telemetry.engineLoad > 85) {
    alerts.push({
      type: 'ENGINE_LOAD_HIGH',
      message: `Engine load high: ${telemetry.engineLoad.toFixed(1)}%`,
      severity: 'MEDIUM',
    });
  }

  // RPM too high (redline)
  if (telemetry.rpm != null && telemetry.rpm > 7000) {
    alerts.push({
      type: 'RPM_HIGH',
      message: `Engine RPM too high: ${Math.round(telemetry.rpm)}`,
      severity: 'HIGH',
    });
  }

  return alerts;
}

export async function processTelemetryAlerts(vehicleId, telemetry, io) {
  const anomalies = detectAnomalies(telemetry);
  const thresholdAlerts = await checkTelemetryThresholds(vehicleId, telemetry);
  const allAlerts = [...anomalies, ...thresholdAlerts];
  const created = [];

  for (const a of allAlerts) {
    // Check if we already have a recent alert of this type to avoid spam
    const recentAlert = await prisma.alert.findFirst({
      where: {
        vehicleId,
        alertType: a.type,
        createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) }, // 5 minutes
      },
    });

    if (recentAlert) continue; // Skip if we just alerted on this

    const alert = await prisma.alert.create({
      data: {
        vehicleId,
        alertType: a.type,
        message: a.message,
        severity: a.severity,
      },
    });
    created.push(alert);
    if (io) {
      io.to(`vehicle:${vehicleId}`).emit('alert:new', alert);
      io.to(`user:${(await getVehicleOwner(vehicleId))}`).emit('alert:new', alert);
    }
  }
  return created;
}

async function getVehicleOwner(vehicleId) {
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { userId: true } });
  return v?.userId;
}

export async function createDtcAlerts(vehicleId, codes, io, options = {}) {
  const { getDtcDescription, severityFromCode } = await import('../utils/dtcDecoder.js');
  const status = options.status === 'PENDING' ? 'PENDING' : 'CONFIRMED';
  const alerts = [];
  for (const code of codes) {
    const existing = await prisma.dtcCode.findFirst({
      where: { vehicleId, code, active: true, status },
    });
    if (existing) continue;

    const dtc = await prisma.dtcCode.create({
      data: {
        vehicleId,
        code,
        description: getDtcDescription(code),
        severity: severityFromCode(code),
        status,
        active: true,
      },
    });

    const alert = await prisma.alert.create({
      data: {
        vehicleId,
        alertType: 'DTC_DETECTED',
        message: `Fault code ${code}: ${dtc.description}`,
        severity: dtc.severity,
      },
    });
    alerts.push({ dtc, alert });
    if (io) {
      io.to(`vehicle:${vehicleId}`).emit('dtc:new', dtc);
      io.to(`vehicle:${vehicleId}`).emit('alert:new', alert);
    }
  }
  return alerts;
}

export async function checkMaintenanceDue() {
  const due = await prisma.maintenanceLog.findMany({
    where: {
      completed: false,
      OR: [
        { dueDate: { lte: new Date() } },
        { dueDate: { lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } },
      ],
    },
    include: { vehicle: true },
  });

  for (const m of due) {
    const exists = await prisma.alert.findFirst({
      where: {
        vehicleId: m.vehicleId,
        alertType: 'MAINTENANCE_DUE',
        message: { contains: m.serviceType },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (exists) continue;

    await prisma.alert.create({
      data: {
        vehicleId: m.vehicleId,
        alertType: 'MAINTENANCE_DUE',
        message: `Maintenance due: ${m.serviceType}`,
        severity: 'MEDIUM',
      },
    });
    logger.info('Maintenance alert created', { vehicleId: m.vehicleId, service: m.serviceType });
  }
  return due.length;
}
