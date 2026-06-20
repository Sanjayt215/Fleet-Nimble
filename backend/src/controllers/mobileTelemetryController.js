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
    const { 
      vehicleId, 
      mode = "LIVE", 
      rpm, 
      speed, 
      fuelLevel, 
      coolantTemp, 
      batteryVoltage, 
      engineLoad, 
      latitude, 
      longitude, 
      gpsAccuracy, 
      gpsAltitude, 
      gpsHeading, 
      gpsTimestamp,
      vin,
      odometer, 
      timestamp 
    } = req.body;

    // STEP 1: Log incoming telemetry
    logger.info("📥 Incoming mobile telemetry", {
      userId,
      vehicleId,
      mode,
      rpm,
      speed,
      fuelLevel,
      coolantTemp,
      engineLoad,
      batteryVoltage,
      latitude,
      longitude,
      vin,
      timestamp: timestamp || new Date().toISOString()
    });

    const sanitizedRpm = sanitizeNumber(rpm);
    const sanitizedSpeed = sanitizeNumber(speed);
    const sanitizedFuelLevel = sanitizeNumber(fuelLevel);
    const sanitizedCoolantTemp = sanitizeNumber(coolantTemp);
    const sanitizedBatteryVoltage = sanitizeNumber(batteryVoltage);
    const sanitizedEngineLoad = sanitizeNumber(engineLoad);
    const sanitizedLatitude = sanitizeNumber(latitude);
    const sanitizedLongitude = sanitizeNumber(longitude);
    const sanitizedGpsAccuracy = sanitizeNumber(gpsAccuracy);
    const sanitizedGpsAltitude = sanitizeNumber(gpsAltitude);
    const sanitizedGpsHeading = sanitizeNumber(gpsHeading);
    const sanitizedOdometer = sanitizeNumber(odometer);

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
        gpsAccuracy: sanitizedGpsAccuracy,
        gpsAltitude: sanitizedGpsAltitude,
        gpsHeading: sanitizedGpsHeading,
        gpsTimestamp: gpsTimestamp ? new Date(gpsTimestamp) : null,
        vin: vin || null,
        odometer: sanitizedOdometer,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
      },
    });

    let vehicleStatus = "OFFLINE";
    if (sanitizedSpeed && sanitizedSpeed > 1) vehicleStatus = "MOVING";
    else if (sanitizedRpm && sanitizedRpm > 200) vehicleStatus = "IDLING";
    else vehicleStatus = "PARKED";

    const vehicleUpdateData = {
      lastTelemetryAt: new Date(),
      status: vehicleStatus,
      telemetryOnline: true,
    };

    if (sanitizedLatitude !== null && sanitizedLongitude !== null) {
      vehicleUpdateData.gpsLastLatitude = sanitizedLatitude;
      vehicleUpdateData.gpsLastLongitude = sanitizedLongitude;
      vehicleUpdateData.gpsLastAt = new Date();
    }

    await prisma.vehicle.update({
      where: { id: vehicleId },
      data: vehicleUpdateData,
    });

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

    if (vehicle.obdDeviceId) {
      await prisma.oBDDevice.update({
        where: { id: vehicle.obdDeviceId },
        data: { lastConnectedAt: new Date() },
      });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${userId}`).emit('live-telemetry-update', {
        ...telemetry,
        mode: "LIVE", // Ensure mode is explicitly set
        vehicle: {
          ...vehicle,
          ...vehicleUpdateData,
        }
      });
      if (sanitizedLatitude !== null && sanitizedLongitude !== null) {
        io.to(`user:${userId}`).emit('live-gps-update', {
          vehicleId,
          latitude: sanitizedLatitude,
          longitude: sanitizedLongitude,
          gpsAccuracy: sanitizedGpsAccuracy,
          gpsAltitude: sanitizedGpsAltitude,
          gpsHeading: sanitizedGpsHeading,
          speed: sanitizedSpeed,
          timestamp: new Date(),
        });
      }
      io.to(`user:${userId}`).emit('vehicle-online', { vehicleId, status: vehicleStatus, online: true });
    }

    // Log successful save
    logger.info("✅ Telemetry saved successfully", {
      vehicleId,
      telemetryId: telemetry.id,
      vehicleStatus,
      hasGPS: sanitizedLatitude !== null && sanitizedLongitude !== null,
      socketEmitted: !!io
    });

    res.json({ success: true, data: { vehicleId, saved: true, telemetryId: telemetry.id } });
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
