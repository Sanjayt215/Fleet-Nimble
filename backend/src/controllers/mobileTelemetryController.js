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
      timestamp,
      // NEW: Engine state fields
      engineState,
      ignitionStatus,
      standbyReason,
      batteryProtectionMode,
      obdPollingActive,
      standbyHeartbeat
    } = req.body;

    // Determine if this is a STANDBY heartbeat
    const isStandbyMode = mode === "STANDBY" || engineState === "ENGINE_OFF" || engineState === "STANDBY" || standbyHeartbeat === true;

    // Log normalized values
    logger.info("📥 Incoming mobile telemetry - NORMALIZED", {
      userId,
      vehicleId,
      mode,
      isStandbyMode,
      engineState,
      ignitionStatus,
      batteryProtectionMode,
      obdPollingActive,
      standbyHeartbeat,
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
        mode: isStandbyMode ? "DEMO" : (mode === "LIVE" ? "LIVE" : "DEMO"),
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
        // NEW: Engine state fields
        engineState: engineState || null,
        ignitionStatus: ignitionStatus || null,
        standbyReason: standbyReason || null,
        batteryProtectionMode: batteryProtectionMode || null,
        obdPollingActive: obdPollingActive !== undefined ? obdPollingActive : (!isStandbyMode),
        standbyHeartbeat: standbyHeartbeat || false,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
      },
    });
    
    logger.info("💾 Telemetry saved to database", {
      telemetryId: telemetry.id,
      vehicleId,
      mode: telemetry.mode,
      engineState: telemetry.engineState,
      isStandbyMode,
      timestamp: telemetry.timestamp
    });

    // Determine vehicle status based on engine state and OBD data
    let vehicleStatus = "OFFLINE";
    
    if (isStandbyMode) {
      // STANDBY mode: engine off, battery protection active
      if (batteryProtectionMode === "LOW_BATTERY" || batteryProtectionMode === "DEEP_SLEEP") {
        vehicleStatus = "LOW_BATTERY";
        logger.warn("🔋 LOW BATTERY protection active", { vehicleId, batteryProtectionMode });
      } else if (engineState === "ENGINE_OFF" || ignitionStatus === "OFF") {
        vehicleStatus = "ENGINE_OFF";
      } else {
        vehicleStatus = "STANDBY";
      }
    } else {
      // LIVE mode: engine on, normal OBD telemetry
      if (sanitizedSpeed && sanitizedSpeed > 1) {
        vehicleStatus = "MOVING";
      } else if (sanitizedRpm && sanitizedRpm > 200) {
        vehicleStatus = "IDLING";
      } else {
        vehicleStatus = "PARKED";
      }
    }

    const vehicleUpdateData = {
      lastTelemetryAt: new Date(),
      status: vehicleStatus,
      telemetryOnline: !isStandbyMode, // Only mark online if not in standby
      engineState: engineState || vehicle.engineState,
      ignitionStatus: ignitionStatus || vehicle.ignitionStatus,
      batteryProtectionMode: batteryProtectionMode || vehicle.batteryProtectionMode,
      obdPollingActive: obdPollingActive !== undefined ? obdPollingActive : (!isStandbyMode),
    };
    
    // Update engine state timestamps
    if (engineState === "ENGINE_ON" && vehicle.engineState !== "ENGINE_ON") {
      vehicleUpdateData.lastEngineOnAt = new Date();
      logger.info("🚗 Engine started", { vehicleId });
    }
    
    if ((engineState === "ENGINE_OFF" || engineState === "STANDBY") && vehicle.engineState === "ENGINE_ON") {
      vehicleUpdateData.lastEngineOffAt = new Date();
      logger.info("🛑 Engine stopped", { vehicleId });
    }
    
    if (isStandbyMode) {
      vehicleUpdateData.lastStandbyAt = new Date();
    }

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
      engineState,
      obdPollingActive: vehicleUpdateData.obdPollingActive,
      telemetryOnline: vehicleUpdateData.telemetryOnline,
      lastTelemetryAt: vehicleUpdateData.lastTelemetryAt,
      hasGPS: !!(sanitizedLatitude !== null && sanitizedLongitude !== null),
      isStandbyMode
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
      // Emit normalized telemetry with all OBD fields + engine state
      const telemetryPayload = {
        id: telemetry.id,
        vehicleId: telemetry.vehicleId,
        userId: telemetry.userId,
        mode: isStandbyMode ? "STANDBY" : "LIVE",
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
        // NEW: Engine state fields
        engineState: telemetry.engineState,
        ignitionStatus: telemetry.ignitionStatus,
        standbyReason: telemetry.standbyReason,
        batteryProtectionMode: telemetry.batteryProtectionMode,
        obdPollingActive: telemetry.obdPollingActive,
        standbyHeartbeat: telemetry.standbyHeartbeat,
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
        engineState: telemetry.engineState,
        obdPollingActive: telemetry.obdPollingActive,
        isStandbyMode,
        rpm: sanitizedRpm,
        speed: sanitizedSpeed,
        batteryVoltage: sanitizedBatteryVoltage
      });

      io.to(`user:${userId}`).emit('live-telemetry-update', telemetryPayload);
      
      if (sanitizedLatitude !== null && sanitizedLongitude !== null) {
        logger.info("🔊 Socket.IO live-gps-update", {
          event: 'live-gps-update',
          userId,
          vehicleId,
          latitude: sanitizedLatitude,
          longitude: sanitizedLongitude,
          isStandbyMode
        });
        
        io.to(`user:${userId}`).emit('live-gps-update', {
          vehicleId,
          latitude: sanitizedLatitude,
          longitude: sanitizedLongitude,
          gpsAccuracy: sanitizedGpsAccuracy,
          gpsAltitude: sanitizedGpsAltitude,
          gpsHeading: sanitizedGpsHeading,
          speed: sanitizedSpeed,
          engineState: telemetry.engineState,
          isStandbyMode,
          timestamp: new Date(),
        });
      }
      
      // Emit appropriate vehicle state event
      if (vehicleStatus === "LOW_BATTERY") {
        logger.warn("🔊 Socket.IO vehicle-alert LOW_BATTERY", {
          event: 'vehicle-alert',
          userId,
          vehicleId,
          alertType: 'LOW_BATTERY'
        });
        
        io.to(`user:${userId}`).emit('vehicle-alert', {
          vehicleId,
          alertType: 'LOW_BATTERY',
          batteryProtectionMode,
          batteryVoltage: sanitizedBatteryVoltage,
          message: 'Low battery detected. OBD polling paused to protect battery.',
          timestamp: new Date()
        });
      } else if (isStandbyMode) {
        logger.info("🔊 Socket.IO vehicle-standby", {
          event: 'vehicle-standby',
          userId,
          vehicleId,
          engineState: telemetry.engineState
        });
        
        io.to(`user:${userId}`).emit('vehicle-standby', {
          vehicleId,
          status: vehicleStatus,
          engineState: telemetry.engineState,
          standbyReason: telemetry.standbyReason,
          online: true,
          standbyHeartbeat: true,
          timestamp: new Date()
        });
        
        if (engineState === "ENGINE_OFF" || ignitionStatus === "OFF") {
          io.to(`user:${userId}`).emit('vehicle-engine-off', {
            vehicleId,
            engineState: telemetry.engineState,
            ignitionStatus: telemetry.ignitionStatus,
            timestamp: new Date()
          });
        }
      } else {
        logger.info("🔊 Socket.IO vehicle-online", {
          event: 'vehicle-online',
          userId,
          vehicleId,
          status: vehicleStatus,
          engineState: telemetry.engineState
        });
        
        io.to(`user:${userId}`).emit('vehicle-online', {
          vehicleId,
          status: vehicleStatus,
          engineState: telemetry.engineState,
          online: true,
          timestamp: new Date()
        });
      }
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

      // Return with normalized field names + engine state
      const response = {
        ...telemetry,
        // Ensure compatibility with alternate field names
        fuel: telemetry.fuelLevel,
        coolant: telemetry.coolantTemp,
        load: telemetry.engineLoad,
        voltage: telemetry.batteryVoltage,
        throttle: telemetry.throttlePosition,
        intake: telemetry.intakeTemp,
        // Engine state info
        isStandbyMode: telemetry.engineState === "ENGINE_OFF" || telemetry.engineState === "STANDBY" || telemetry.standbyHeartbeat,
        isEngineOn: telemetry.engineState === "ENGINE_ON",
        isBatteryProtection: !!telemetry.batteryProtectionMode
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
