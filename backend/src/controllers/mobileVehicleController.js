import prisma from "../utils/prisma.js";
import logger from "../utils/logger.js";
import { decodeVIN } from "../services/vinDecoderService.js";

export async function vinDecode(req, res) {
  try {
    const { vin } = req.body;

    logger.info("🔍 VIN decode request", { vin });

    if (!vin) {
      return res.status(400).json({
        success: false,
        error: { 
          code: "INVALID_PAYLOAD", 
          message: "VIN is required" 
        }
      });
    }

    // Use the new VIN decoder service
    const result = await decodeVIN(vin);
    
    // Return result (success or error)
    if (result.success) {
      res.json(result);
    } else {
      // Return error but don't use HTTP 400 for valid VINs with allowManualEntry
      if (result.error?.allowManualEntry) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    }
    
  } catch (err) {
    logger.error("❌ VIN decode exception", { 
      error: err.message, 
      stack: err.stack 
    });
    res.status(500).json({
      success: false,
      error: {
        code: "VIN_DECODE_FAILED",
        message: "An error occurred while decoding the VIN. Please try again or enter vehicle details manually.",
        allowManualEntry: true
      }
    });
  }
}

export async function setupVehicle(req, res) {
  try {
    const userId = req.userId || req.user?.id;
    const companyId = req.user?.companyId || null;

    const {
      vehicleName,
      registrationNumber,
      make,
      model,
      year,
      fuelType,
      vin,
      manufacturer,
      bodyClass,
      engineModel,
      obdDeviceName,
      bluetoothAddress,
      // New decode metadata fields
      vinDecodeSource,
      vinDecodeType,
      vinCountry,
      vinConfidence,
      isPartialDecode
    } = req.body;

    logger.info("🚗 Vehicle setup request START", { 
      userId, 
      companyId,
      vehicleName, 
      registrationNumber, 
      vin,
      make,
      model,
      year,
      vinDecodeSource,
      hasOBD: !!(obdDeviceName || bluetoothAddress)
    });

    if (!userId) {
      logger.error("❌ Vehicle setup failed: User not authenticated");
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" }
      });
    }

    if (!vehicleName || !registrationNumber) {
      logger.warn("❌ Vehicle setup failed: Missing required fields");
      return res.status(400).json({
        success: false,
        error: { 
          code: "INVALID_PAYLOAD", 
          message: "vehicleName and registrationNumber are required" 
        }
      });
    }

    const normalizedReg = registrationNumber.toUpperCase().trim();

    // If VIN is provided, check if vehicle exists by VIN first (PRIORITY 1)
    let existingVehicle = null;
    let lookupMethod = null;
    
    if (vin) {
      const cleanVin = vin.trim().toUpperCase();
      existingVehicle = await prisma.vehicle.findFirst({
        where: {
          vin: cleanVin,
          userId,
          deletedAt: null,
        },
      });
      
      if (existingVehicle) {
        lookupMethod = 'VIN';
        logger.info("✅ Found existing vehicle by VIN", { 
          vehicleId: existingVehicle.id, 
          vin: cleanVin,
          decision: 'UPDATE_EXISTING'
        });
      } else {
        logger.info("🔍 VIN not found in database", { 
          vin: cleanVin,
          decision: 'WILL_CHECK_REGISTRATION'
        });
      }
    }

    // If not found by VIN, try by registration number (PRIORITY 2)
    if (!existingVehicle) {
      existingVehicle = await prisma.vehicle.findFirst({
        where: {
          userId,
          registrationNumber: normalizedReg,
          deletedAt: null,
        },
      });
      
      if (existingVehicle) {
        lookupMethod = 'REGISTRATION';
        logger.info("✅ Found existing vehicle by registration", { 
          vehicleId: existingVehicle.id, 
          registrationNumber: normalizedReg,
          decision: 'UPDATE_EXISTING'
        });
      } else {
        lookupMethod = 'NEW';
        logger.info("🆕 No existing vehicle found", { 
          vin,
          registrationNumber: normalizedReg,
          decision: 'CREATE_NEW'
        });
      }
    }

    let vehicle;
    const vehicleData = {
      vehicleName,
      registrationNumber: normalizedReg,
      make,
      model,
      year: year ? parseInt(year) : null,
      fuelType,
      vin: vin ? vin.trim().toUpperCase() : null,
      manufacturer,
      bodyClass,
      engineModel,
      companyId: companyId || undefined,
      // Store VIN decode metadata
      vinDecodeSource: vinDecodeSource || null,
      vinDecodeType: vinDecodeType || null,
      vinCountry: vinCountry || null,
      vinConfidence: vinConfidence || null,
      isPartialDecode: isPartialDecode || false
    };

    if (existingVehicle) {
      logger.info("🔄 Updating existing vehicle", { 
        vehicleId: existingVehicle.id,
        lookupMethod,
        changes: vehicleData
      });
      
      vehicle = await prisma.vehicle.update({
        where: { id: existingVehicle.id },
        data: vehicleData,
      });
      
      logger.info("✅ Vehicle updated successfully", { 
        vehicleId: vehicle.id,
        vin: vehicle.vin
      });
    } else {
      logger.info("✨ Creating new vehicle", { 
        userId,
        vehicleData
      });
      
      vehicle = await prisma.vehicle.create({
        data: {
          ...vehicleData,
          userId,
        },
      });
      
      logger.info("✅ New vehicle created successfully", { 
        vehicleId: vehicle.id,
        vin: vehicle.vin,
        vehicleName: vehicle.vehicleName
      });
    }

    let obdDevice = null;
    if (obdDeviceName || bluetoothAddress) {
      logger.info("🔌 Setting up OBD device", { 
        deviceName: obdDeviceName, 
        bluetoothAddress,
        vehicleId: vehicle.id
      });
      
      obdDevice = await prisma.oBDDevice.upsert({
        where: {
          userId_bluetoothAddress: {
            userId,
            bluetoothAddress: bluetoothAddress || "UNKNOWN",
          },
        },
        create: {
          userId,
          vehicleId: vehicle.id,
          deviceName: obdDeviceName || "ELM327",
          bluetoothAddress: bluetoothAddress || "UNKNOWN",
        },
        update: {
          vehicleId: vehicle.id,
          deviceName: obdDeviceName || "ELM327",
        },
      });

      await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: { obdDeviceId: obdDevice.id },
      });
      
      logger.info("✅ OBD device linked to vehicle", { 
        obdDeviceId: obdDevice.id,
        vehicleId: vehicle.id
      });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${userId}`).emit('vehicle-registered', {
        vehicle: {
          ...vehicle,
          obdDeviceId: obdDevice?.id,
        },
        obdDevice
      });
      
      logger.info("📡 Socket.IO vehicle-registered event emitted", { 
        userId,
        vehicleId: vehicle.id
      });
    }

    const responseData = {
      vehicleId: vehicle.id,
      vehicleName: vehicle.vehicleName,
      registrationNumber: vehicle.registrationNumber,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      fuelType: vehicle.fuelType,
      vin: vehicle.vin,
      manufacturer: vehicle.manufacturer,
      bodyClass: vehicle.bodyClass,
      engineModel: vehicle.engineModel,
      vinDecodeSource: vehicle.vinDecodeSource,
      vinDecodeType: vehicle.vinDecodeType,
      vinCountry: vehicle.vinCountry,
      vinConfidence: vehicle.vinConfidence,
      isPartialDecode: vehicle.isPartialDecode,
      obdDeviceId: obdDevice?.id,
      isNew: !existingVehicle
    };

    logger.info("✅ Vehicle setup complete - RESPONSE", { 
      vehicleId: vehicle.id,
      isNew: !existingVehicle,
      lookupMethod,
      hasOBD: !!obdDevice,
      decodeSource: vinDecodeSource,
      responseData
    });

    res.json({
      success: true, 
      data: responseData
    });
  } catch (err) {
    logger.error("❌ Vehicle setup exception", { 
      error: err.message, 
      stack: err.stack 
    });
    res.status(500).json({
      success: false,
      error: {
        code: "VEHICLE_SETUP_FAILED",
        message: err.message
      }
    });
  }
}

export async function getMyVehicles(req, res) {
  try {
    const userId = req.userId || req.user?.id;
    const companyId = req.user?.companyId || req.user?.company?.id || null;
    if (!userId) {
      return res.status(401).json({ success: false, error: "User not authenticated" });
    }

    const vehicles = await prisma.vehicle.findMany({
      where: {
        deletedAt: null,
        OR: [
          { userId },
          ...(companyId ? [{ companyId }] : []),
        ],
      },
      include: { obdDevices: true, liveState: true },
      orderBy: { createdAt: 'desc' },
    });

    const vehiclesWithTelemetry = await Promise.all(
      vehicles.map(async (v) => {
        const latest = await prisma.telemetry.findFirst({
          where: { vehicleId: v.id, mode: 'LIVE' },
          orderBy: { timestamp: 'desc' },
          include: { obdDevice: true },
        });
        return { ...v, latestTelemetry: latest || null };
      })
    );

    res.json({ success: true, data: vehiclesWithTelemetry });
  } catch (err) {
    console.error("Error fetching my vehicles:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}
