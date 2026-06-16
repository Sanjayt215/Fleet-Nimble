import prisma from "../utils/prisma.js";
import logger from "../utils/logger.js";

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
      obdDeviceName,
      bluetoothAddress
    } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" }
      });
    }

    if (!vehicleName || !registrationNumber || !make || !model || !year) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_PAYLOAD", message: "vehicleName, registrationNumber, make, model, and year are required" }
      });
    }

    const normalizedReg = registrationNumber.toUpperCase().trim();

    // Create or update vehicle by registrationNumber for the user
    const existingVehicle = await prisma.vehicle.findFirst({
      where: {
        userId,
        registrationNumber: normalizedReg,
        deletedAt: null,
      },
    });

    let vehicle;
    const vehicleData = {
      vehicleName,
      registrationNumber: normalizedReg,
      make,
      model,
      year: parseInt(year) || 2015,
      fuelType,
      vin: vin || "",
      companyId: companyId || undefined
    };

    if (existingVehicle) {
      vehicle = await prisma.vehicle.update({
        where: { id: existingVehicle.id },
        data: vehicleData,
      });
    } else {
      vehicle = await prisma.vehicle.create({
        data: {
          ...vehicleData,
          userId,
        },
      });
    }

    // Create or update OBD device if provided
    let obdDevice = null;
    if (obdDeviceName || bluetoothAddress) {
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

      // Update vehicle with obdDeviceId
      await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: { obdDeviceId: obdDevice.id },
      });
    }

    // Emit socket event to user's room
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
        obdDeviceId: obdDevice?.id
      }
    });
  } catch (err) {
    console.error("Vehicle setup failed:", err);
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

    // Fetch vehicles belonging to this user or their company
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

    // Attach latest telemetry (if any) for each vehicle
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
