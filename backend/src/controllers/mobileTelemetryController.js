import prisma from "../utils/prisma.js";
import logger from "../utils/logger.js";

function sanitizeNumber(value) {
  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) {
    return null;
  }
  return num;
}

export async function submitLiveTelemetry(req, res) {
  try {
    const userId = req.user.id || req.userId;
    const companyId = req.user.companyId || req.user.company?.id;
    const { vehicleId, mode = "LIVE", rpm, speed, fuelLevel, coolantTemp, batteryVoltage, engineLoad, latitude, longitude, odometer, timestamp } = req.body;

    // Sanitize all numeric values
    const sanitizedRpm = sanitizeNumber(rpm);
    const sanitizedSpeed = sanitizeNumber(speed);
    const sanitizedFuelLevel = sanitizeNumber(fuelLevel);
    const sanitizedCoolantTemp = sanitizeNumber(coolantTemp);
    const sanitizedBatteryVoltage = sanitizeNumber(batteryVoltage);
    const sanitizedEngineLoad = sanitizeNumber(engineLoad);
    const sanitizedLatitude = sanitizeNumber(latitude);
    const sanitizedLongitude = sanitizeNumber(longitude);
    const sanitizedOdometer = sanitizeNumber(odometer);

    // Verify vehicle exists and belongs to this user or company
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: { obdDevices: true },
    });
    if (!vehicle || vehicle.deletedAt) {
      return res.status(404).json({ success: false, error: "Vehicle not found" });
    }
    if (vehicle.userId !== userId && companyId && vehicle.companyId !== companyId) {
      return res.status(403).json({ success: false, error: "Vehicle not authorized for this user" });
    }

    // Create telemetry record
    // Note: obdDeviceId may be null if no OBD device is registered (backup mode)
    const telemetry = await prisma.telemetry.create({
      data: {
        userId,
        vehicleId,
        obdDeviceId: vehicle.obdDeviceId || null,
        mode: mode === "LIVE" ? "LIVE" : "DEMO",
        rpm: sanitizedRpm,
        speed: sanitizedSpeed,
        fuelLevel: sanitizedFuelLevel,
        coolantTemp: sanitizedCoolantTemp,
        batteryVoltage: sanitizedBatteryVoltage,
        engineLoad: sanitizedEngineLoad,
        latitude: sanitizedLatitude,
        longitude: sanitizedLongitude,
        odometer: sanitizedOdometer,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
      },
    });

    // Determine vehicle status based on speed/rpm
    let vehicleStatus = "OFFLINE";
    if (sanitizedSpeed && sanitizedSpeed > 1) vehicleStatus = "MOVING";
    else if (sanitizedRpm && sanitizedRpm > 200) vehicleStatus = "IDLING";
    else vehicleStatus = "PARKED";

    // Update vehicle live state
    await prisma.vehicleLiveState.upsert({
      where: { vehicleId },
      create: {
        vehicleId,
        telemetrySource: "REAL",
        rpm: sanitizedRpm ?? 0,
        speed: sanitizedSpeed ?? 0,
        coolantTemp: sanitizedCoolantTemp ?? 32,
        batteryVoltage: sanitizedBatteryVoltage ?? 12.5,
        fuelLevel: sanitizedFuelLevel ?? 80,
        engineLoad: sanitizedEngineLoad ?? 12,
        odometer: sanitizedOdometer ?? 0,
        gpsLat: sanitizedLatitude,
        gpsLng: sanitizedLongitude,
        lastUpdate: new Date(),
        vehicleStatus,
      },
      update: {
        telemetrySource: "REAL",
        rpm: sanitizedRpm ?? 0,
        speed: sanitizedSpeed ?? 0,
        coolantTemp: sanitizedCoolantTemp ?? 32,
        batteryVoltage: sanitizedBatteryVoltage ?? 12.5,
        fuelLevel: sanitizedFuelLevel ?? 80,
        engineLoad: sanitizedEngineLoad ?? 12,
        odometer: sanitizedOdometer ?? 0,
        gpsLat: sanitizedLatitude,
        gpsLng: sanitizedLongitude,
        lastUpdate: new Date(),
        vehicleStatus,
      },
    });

    // Update vehicle lastTelemetryAt, status, telemetryOnline
    await prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        lastTelemetryAt: new Date(),
        status: vehicleStatus,
        telemetryOnline: true,
      },
    });

    // Update OBD device lastConnectedAt if exists
    if (vehicle.obdDeviceId) {
      await prisma.oBDDevice.update({
        where: { id: vehicle.obdDeviceId },
        data: { lastConnectedAt: new Date() },
      });
    }

    // Emit socket events
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${userId}`).emit('live-telemetry-update', {
        ...telemetry,
        vehicle: {
          ...vehicle,
          lastTelemetryAt: new Date(),
          status: vehicleStatus,
          telemetryOnline: true,
        }
      });
      io.to(`user:${userId}`).emit('vehicle-online', { vehicleId });
    }

    res.json({ success: true, data: { vehicleId, saved: true } });
  } catch (err) {
    logger.error("Error submitting telemetry:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}


export async function getLatestLiveTelemetry(req, res) {
  try {
    const userId = req.user.id || req.userId;
    const companyId = req.user.companyId || req.user.company?.id || null;
    const { vehicleId } = req.query;

    let whereClause = {
      mode: 'LIVE',
      OR: [
        { userId },
        ...(companyId ? [{ vehicle: { companyId } }] : []),
      ],
    };

    // If specific vehicleId is requested, filter by it
    if (vehicleId) {
      whereClause = {
        vehicleId,
        mode: 'LIVE',
        OR: [
          { userId },
          ...(companyId ? [{ vehicle: { companyId } }] : []),
        ],
      };
    }

    const telemetry = await prisma.telemetry.findFirst({
      where: whereClause,
      orderBy: { timestamp: 'desc' },
      include: { vehicle: true, obdDevice: true },
    });

    res.json({ success: true, data: telemetry });
  } catch (err) {
    logger.error("Error fetching latest telemetry:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getTelemetryHistory(req, res) {
  try {
    const userId = req.user.id || req.userId;
    const companyId = req.user.companyId || req.user.company?.id || null;
    const { vehicleId } = req.params;

    // Verify ownership of vehicle
    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle || vehicle.deletedAt) return res.status(404).json({ success: false, error: 'Vehicle not found' });
    if (vehicle.userId !== userId && companyId && vehicle.companyId !== companyId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const telemetry = await prisma.telemetry.findMany({
      where: { vehicleId, mode: 'LIVE' },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    res.json({ success: true, data: telemetry });
  } catch (err) {
    logger.error("Error fetching telemetry history:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}
