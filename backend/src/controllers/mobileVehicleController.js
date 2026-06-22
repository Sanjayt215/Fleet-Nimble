import prisma from "../utils/prisma.js";
import logger from "../utils/logger.js";

export async function vinDecode(req, res) {
  try {
    const { vin } = req.body;

    logger.info("🔍 VIN decode request", { vin });

    // Validate VIN is provided
    if (!vin) {
      logger.warn("❌ VIN decode failed: VIN is required");
      return res.status(400).json({
        success: false,
        error: { 
          code: "INVALID_PAYLOAD", 
          message: "VIN is required" 
        }
      });
    }

    // Clean and validate VIN format
    const cleanVin = vin.trim().toUpperCase();
    
    // VIN must be exactly 17 characters
    if (cleanVin.length !== 17) {
      logger.warn("❌ VIN decode failed: Invalid length", { 
        vin: cleanVin, 
        length: cleanVin.length 
      });
      return res.status(400).json({
        success: false,
        error: { 
          code: "INVALID_VIN", 
          message: `VIN must be exactly 17 characters (received ${cleanVin.length})` 
        }
      });
    }

    // VIN cannot contain I, O, or Q
    const invalidChars = cleanVin.match(/[IOQ]/g);
    if (invalidChars) {
      logger.warn("❌ VIN decode failed: Invalid characters", { 
        vin: cleanVin, 
        invalidChars: invalidChars.join(', ') 
      });
      return res.status(400).json({
        success: false,
        error: { 
          code: "INVALID_VIN", 
          message: `VIN contains invalid characters: ${invalidChars.join(', ')}. VIN cannot contain I, O, or Q.` 
        }
      });
    }

    // VIN must only contain alphanumeric characters
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(cleanVin)) {
      logger.warn("❌ VIN decode failed: Invalid format", { vin: cleanVin });
      return res.status(400).json({
        success: false,
        error: { 
          code: "INVALID_VIN", 
          message: "VIN must contain only letters (A-H, J-N, P, R-Z) and numbers (0-9)" 
        }
      });
    }

    // VIN format is valid - call NHTSA VIN decoder
    logger.info("📞 Calling NHTSA VIN decoder", { vin: cleanVin });
    const response = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${cleanVin}?format=json`
    );

    if (!response.ok) {
      logger.error("❌ NHTSA API request failed", { 
        status: response.status, 
        statusText: response.statusText 
      });
      
      // VIN is valid but NHTSA service is down - allow manual entry
      return res.json({
        success: false,
        error: { 
          code: "VIN_DECODE_SERVICE_UNAVAILABLE", 
          message: "VIN is valid, but vehicle decoder service is temporarily unavailable. Please enter vehicle details manually.",
          allowManualEntry: true,
          vin: cleanVin
        }
      });
    }

    const data = await response.json();
    const result = data.Results[0];

    // Check for API errors
    if (!result) {
      logger.error("❌ NHTSA API returned no results", { vin: cleanVin });
      return res.json({
        success: false,
        error: { 
          code: "VIN_DECODE_NO_RESULTS", 
          message: "VIN is valid, but no vehicle data was found. Please enter vehicle details manually.",
          allowManualEntry: true,
          vin: cleanVin
        }
      });
    }

    // Log NHTSA error codes if present
    if (result.ErrorCode && result.ErrorCode !== "0") {
      logger.warn("⚠️ NHTSA returned error codes", { 
        vin: cleanVin, 
        errorCode: result.ErrorCode,
        errorText: result.ErrorText 
      });
    }

    // Check if we got any meaningful data
    const hasMakeOrModel = result.Make || result.Model;
    
    if (!hasMakeOrModel) {
      // VIN is valid format but NHTSA has no data (non-US vehicle, etc.)
      logger.warn("⚠️ VIN valid but no vehicle data available", { 
        vin: cleanVin,
        errorCode: result.ErrorCode,
        errorText: result.ErrorText
      });
      
      return res.json({
        success: false,
        error: { 
          code: "VIN_DECODE_UNAVAILABLE", 
          message: "VIN is valid but vehicle details could not be decoded. This may be a non-US vehicle or the VIN format is not recognized by the decoder. Please enter vehicle details manually.",
          allowManualEntry: true,
          vin: cleanVin,
          nhtsaError: result.ErrorText
        }
      });
    }

    // We have at least some data - return it
    const decodedData = {
      vin: result.VIN || cleanVin,
      make: result.Make || null,
      model: result.Model || null,
      year: result.ModelYear ? parseInt(result.ModelYear) : null,
      manufacturer: result.Manufacturer || null,
      fuelType: result.FuelTypePrimary || null,
      bodyClass: result.BodyClass || null,
      engineModel: result.EngineModel || null
    };

    logger.info("✅ VIN decoded successfully", { 
      vin: cleanVin, 
      make: decodedData.make, 
      model: decodedData.model, 
      year: decodedData.year,
      hasWarnings: result.ErrorCode && result.ErrorCode !== "0"
    });

    res.json({
      success: true,
      data: decodedData,
      warning: result.ErrorCode && result.ErrorCode !== "0" ? result.ErrorText : null
    });
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
      bluetoothAddress
    } = req.body;

    logger.info("🚗 Vehicle setup request", { 
      userId, 
      vehicleName, 
      registrationNumber, 
      vin,
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

    // If VIN is provided, check if vehicle exists by VIN first
    let existingVehicle = null;
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
        logger.info("✅ Found existing vehicle by VIN", { 
          vehicleId: existingVehicle.id, 
          vin: cleanVin 
        });
      }
    }

    // If not found by VIN, try by registration number
    if (!existingVehicle) {
      existingVehicle = await prisma.vehicle.findFirst({
        where: {
          userId,
          registrationNumber: normalizedReg,
          deletedAt: null,
        },
      });
      
      if (existingVehicle) {
        logger.info("✅ Found existing vehicle by registration", { 
          vehicleId: existingVehicle.id, 
          registrationNumber: normalizedReg 
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
      companyId: companyId || undefined
    };

    if (existingVehicle) {
      logger.info("🔄 Updating existing vehicle", { vehicleId: existingVehicle.id });
      vehicle = await prisma.vehicle.update({
        where: { id: existingVehicle.id },
        data: vehicleData,
      });
    } else {
      logger.info("✨ Creating new vehicle");
      vehicle = await prisma.vehicle.create({
        data: {
          ...vehicleData,
          userId,
        },
      });
    }

    let obdDevice = null;
    if (obdDeviceName || bluetoothAddress) {
      logger.info("🔌 Setting up OBD device", { 
        deviceName: obdDeviceName, 
        bluetoothAddress 
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
    }

    logger.info("✅ Vehicle setup complete", { 
      vehicleId: vehicle.id, 
      isNew: !existingVehicle,
      hasOBD: !!obdDevice 
    });

    res.json({
      success: true, 
      data: {
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
        obdDeviceId: obdDevice?.id,
        isNew: !existingVehicle
      }
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
