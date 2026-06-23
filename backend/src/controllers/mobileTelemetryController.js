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
    
    // Log full raw request body for debugging
    logger.info("📥 Incoming mobile telemetry - RAW BODY", {
      fullBody: req.body
    });

    // Normalize field names - support alternate field names from mobile app
    const normalizedRpm = req.body.rpm;
    const normalizedSpeed = req.body.speed;
    const normalizedFuelLevel = req.body.fuelLevel ?? req.body.fuel;
    const normalizedCoolantTemp = req.body.coolantTemp ?? req.body.coolant;
    const normalizedEngineLoad = req.body.engineLoad ?? req.body.load;
    const normalizedBatteryVoltage = req.body.batteryVoltage ?? req.body.voltage;
    const normalizedMaf = req.body.maf;
    const normalizedThrottle = req.body.throttle ?? req.body.throttlePosition;
    const normalizedIntakeTemp = req.body.intakeTemp ?? req.body.intake;
    
    const {
      vehicleId,
      mode = "LIVE",
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

    // Log normalized values
    logger.info("📥 Incoming mobile telemetry - NORMALIZED", {
      userId,
      vehicleId,
      mode,
      rpm: normalizedRpm,
      speed: normalizedSpeed,
      fuelLevel: normalizedFuelLevel,
      coolantTemp: normalizedCoolantTemp,
      engineLoad: normalizedEngineLoad,
      batteryVoltage: normalizedBatteryVoltage,
      maf: normalizedMaf,
      throttle: normalizedThrottle,
      intakeTemp: normalizedIntakeTemp,
      latitude,
      longitude,
      vin,
      timestamp: timestamp || new Date().toISOString()
    });

    // Validate vehicleId is provided
    if (!vehicleId) {
      logger.error("❌ Telemetry rejected: No vehicleId provided", { userId, vin });
      return res.status(400).json({ 
        success: false, 
        error: {
          code: "MISSING_VEHICLE_ID",
          message: "vehicleId is required. Please setup vehicle first using /api/mobile/vehicles/setup"
        }
      });
    }

    const sanitizedRpm = sanitizeNumber(normalizedRpm);
    const sanitizedSpeed = sanitizeNumber(normalizedSpeed);
    const sanitizedFuelLevel = sanitizeNumber(normalizedFuelLevel);
    const sanitizedCoolantTemp = sanitizeNumber(normalizedCoolantTemp);
    const sanitizedBatteryVoltage = sanitizeNumber(normalizedBatteryVoltage);
    const sanitizedEngineLoad = sanitizeNumber(normalizedEngineLoad);
    const sanitizedMaf = sanitizeNumber(normalizedMaf);
    const sanitizedThrottle = sanitizeNumber(normalizedThrottle);
    const sanitizedIntakeTemp = sanitizeNumber(normalizedIntakeTemp);
    const sanitizedLatitude = sanitizeNumber(latitude);
    const sanitizedLongitude = sanitizeNumber(longitude);
    const sanitizedGpsAccuracy = sanitizeNumber(gpsAccuracy);
    const sanitizedGpsAltitude = sanitizeNumber(gpsAltitude);
    const sanitizedGpsHeading = sanitizeNumber(gpsHeading);
    const sanitizedOdometer = sanitizeNumber(odometer);

    // Verify vehicle exists and belongs to authenticated user
    logger.info("🔍 Verifying vehicle ownership", { userId, vehicleId });
    
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: { obdDevices: true },
    });
    
    if (!vehicle || vehicle.deletedAt) {
      logger.error("❌ Telemetry rejected: Vehicle not found", { userId, vehicleId });
      return res.status(404).json({ 
        success: false, 
        error: {
          code: "VEHICLE_NOT_FOUND",
          message: "Vehicle not found. The vehicleId may be invalid or vehicle may have been deleted."
        }
      });
    }
    
    if (vehicle.userId !== userId && companyId && vehicle.companyId !== companyId) {
      logger.error("❌ Telemetry rejected: Vehicle not authorized", { 
        userId, 
        vehicleId, 
        vehicleOwner: vehicle.userId,
        vehicleCompany: vehicle.companyId,
        userCompany: companyId
      });
      return res.status(403).json({ 
        success: false, 
        error: {
          code: "VEHICLE_NOT_AUTHORIZED",
          message: "Vehicle not authorized for this user"
        }
      });
    }
    
    logger.info("✅ Vehicle ownership verified", { 
      userId, 
      vehicleId,
      vehicleName: vehicle.vehicleName,
      vin: vehicle.vin
    });

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
        maf: sanitizedMaf,
        throttlePosition: sanitizedThrottle,
        intakeTemp: sanitizedIntakeTemp,
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
    
    logger.info("💾 Telemetry saved to database", {
      telemetryId: telemetry.id,
      vehicleId,
      mode: telemetry.mode,
      timestamp: telemetry.timestamp
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
    
    logger.info("🚗 Vehicle status updated", {
      vehicleId,
      status: vehicleStatus,
      telemetryOnline: true,
      lastTelemetryAt: vehicleUpdateData.lastTelemetryAt,
      hasGPS: !!(sanitizedLatitude !== null && sanitizedLongitude !== null)
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
        maf: sanitizedMaf ?? 0,
        throttlePosition: sanitizedThrottle ?? 0,
        intakeTemp: sanitizedIntakeTemp ?? 25,
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
        maf: sanitizedMaf ?? 0,
        throttlePosition: sanitizedThrottle ?? 0,
        intakeTemp: sanitizedIntakeTemp ?? 25,
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
      // Emit normalized telemetry with all OBD fields
      const telemetryPayload = {
        id: telemetry.id,
        vehicleId: telemetry.vehicleId,
        userId: telemetry.userId,
        mode: "LIVE",
        rpm: sanitizedRpm,
        speed: sanitizedSpeed,
        fuelLevel: sanitizedFuelLevel,
        coolantTemp: sanitizedCoolantTemp,
        engineLoad: sanitizedEngineLoad,
        batteryVoltage: sanitizedBatteryVoltage,
        maf: sanitizedMaf,
        throttle: sanitizedThrottle,
        throttlePosition: sanitizedThrottle,
        intakeTemp: sanitizedIntakeTemp,
        latitude: sanitizedLatitude,
        longitude: sanitizedLongitude,
        gpsAccuracy: sanitizedGpsAccuracy,
        gpsAltitude: sanitizedGpsAltitude,
        gpsHeading: sanitizedGpsHeading,
        odometer: sanitizedOdometer,
        vin: telemetry.vin,
        timestamp: telemetry.timestamp,
        createdAt: telemetry.createdAt,
        vehicle: {
          ...vehicle,
          ...vehicleUpdateData,
        }
      };

      logger.info("🔊 Socket.IO live-telemetry-update", {
        event: 'live-telemetry-update',
        userId,
        vehicleId,
        rpm: sanitizedRpm,
        speed: sanitizedSpeed,
        fuelLevel: sanitizedFuelLevel,
        coolantTemp: sanitizedCoolantTemp,
        engineLoad: sanitizedEngineLoad,
        batteryVoltage: sanitizedBatteryVoltage,
        maf: sanitizedMaf,
        throttle: sanitizedThrottle,
        intakeTemp: sanitizedIntakeTemp
      });

      io.to(`user:${userId}`).emit('live-telemetry-update', telemetryPayload);
      
      if (sanitizedLatitude !== null && sanitizedLongitude !== null) {
        logger.info("🔊 Socket.IO live-gps-update", {
          event: 'live-gps-update',
          userId,
          vehicleId,
          latitude: sanitizedLatitude,
          longitude: sanitizedLongitude
        });
        
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
      
      logger.info("🔊 Socket.IO vehicle-online", {
        event: 'vehicle-online',
        userId,
        vehicleId,
        status: vehicleStatus
      });
      
      io.to(`user:${userId}`).emit('vehicle-online', { vehicleId, status: vehicleStatus, online: true });
    }

    // Log successful save with all OBD values
    logger.info("✅ Telemetry saved successfully", {
      vehicleId,
      telemetryId: telemetry.id,
      vehicleStatus,
      obdData: {
        rpm: sanitizedRpm,
        speed: sanitizedSpeed,
        fuelLevel: sanitizedFuelLevel,
        coolantTemp: sanitizedCoolantTemp,
        engineLoad: sanitizedEngineLoad,
        batteryVoltage: sanitizedBatteryVoltage,
        maf: sanitizedMaf,
        throttle: sanitizedThrottle,
        intakeTemp: sanitizedIntakeTemp
      },
      hasGPS: sanitizedLatitude !== null && sanitizedLongitude !== null,
      socketEmitted: !!io
    });

    // Return saved telemetry in response for verification
    res.json({ 
      success: true, 
      data: { 
        vehicleId, 
        saved: true, 
        telemetryId: telemetry.id,
        savedValues: {
          rpm: sanitizedRpm,
          speed: sanitizedSpeed,
          fuelLevel: sanitizedFuelLevel,
          coolantTemp: sanitizedCoolantTemp,
          engineLoad: sanitizedEngineLoad,
          batteryVoltage: sanitizedBatteryVoltage,
          maf: sanitizedMaf,
          throttle: sanitizedThrottle,
          intakeTemp: sanitizedIntakeTemp,
          latitude: sanitizedLatitude,
          longitude: sanitizedLongitude
        }
      } 
    });
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

    logger.info("🔍 Fetching latest telemetry", { userId, vehicleId, companyId });

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

    if (telemetry) {
      logger.info("✅ Latest telemetry found", {
        telemetryId: telemetry.id,
        vehicleId: telemetry.vehicleId,
        rpm: telemetry.rpm,
        speed: telemetry.speed,
        fuelLevel: telemetry.fuelLevel,
        coolantTemp: telemetry.coolantTemp,
        engineLoad: telemetry.engineLoad,
        batteryVoltage: telemetry.batteryVoltage,
        timestamp: telemetry.timestamp
      });

      // Return with normalized field names
      const response = {
        ...telemetry,
        // Ensure compatibility with alternate field names
        fuel: telemetry.fuelLevel,
        coolant: telemetry.coolantTemp,
        load: telemetry.engineLoad,
        voltage: telemetry.batteryVoltage,
        throttle: telemetry.throttlePosition,
        intake: telemetry.intakeTemp
      };

      res.json({ success: true, data: response });
    } else {
      logger.warn("⚠️ No telemetry found", { userId, vehicleId });
      res.json({ success: true, data: null });
    }
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
