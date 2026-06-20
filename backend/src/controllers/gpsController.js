import prisma from "../utils/prisma.js";
import logger from "../utils/logger.js";

function assertVehicleOwner(req, vehicle) {
  if (req.user.role?.name === "ADMIN") return;
  if (vehicle.userId !== (req.userId || req.user.id)) {
    throw new Error("Access denied");
  }
}

export async function getLiveGps(req, res) {
  try {
    const userId = req.userId || req.user?.id;
    const companyId = req.user?.companyId || req.user?.company?.id || null;

    const vehicles = await prisma.vehicle.findMany({
      where: {
        deletedAt: null,
        OR: [
          { userId },
          ...(companyId ? [{ companyId }] : []),
        ],
      },
      include: { liveState: true },
      orderBy: { createdAt: 'desc' },
    });

    const liveGpsData = vehicles.map(vehicle => ({
      vehicleId: vehicle.id,
      vehicleName: vehicle.vehicleName,
      registrationNumber: vehicle.registrationNumber,
      latitude: vehicle.gpsLastLatitude,
      longitude: vehicle.gpsLastLongitude,
      gpsLastAt: vehicle.gpsLastAt,
      status: vehicle.status,
      telemetryOnline: vehicle.telemetryOnline,
      speed: vehicle.liveState?.speed || null,
    }));

    res.json({ success: true, data: liveGpsData });
  } catch (err) {
    logger.error("Error fetching live GPS:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getLiveGpsByVehicleId(req, res) {
  try {
    const userId = req.userId || req.user?.id;
    const companyId = req.user?.companyId || req.user?.company?.id || null;
    const { vehicleId } = req.params;

    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: { liveState: true },
    });

    if (!vehicle || vehicle.deletedAt) {
      return res.status(404).json({ success: false, error: "Vehicle not found" });
    }
    if (vehicle.userId !== userId && companyId && vehicle.companyId !== companyId) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    const latestTelemetry = await prisma.telemetry.findFirst({
      where: { vehicleId: vehicle.id, mode: 'LIVE', latitude: { not: null }, longitude: { not: null } },
      orderBy: { timestamp: 'desc' },
    });

    const liveGpsData = {
      vehicleId: vehicle.id,
      vehicleName: vehicle.vehicleName,
      registrationNumber: vehicle.registrationNumber,
      latitude: vehicle.gpsLastLatitude,
      longitude: vehicle.gpsLastLongitude,
      gpsLastAt: vehicle.gpsLastAt,
      status: vehicle.status,
      telemetryOnline: vehicle.telemetryOnline,
      speed: vehicle.liveState?.speed || null,
      latestTelemetry,
    };

    res.json({ success: true, data: liveGpsData });
  } catch (err) {
    logger.error("Error fetching live GPS by vehicle ID:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getGpsHistoryByVehicleId(req, res) {
  try {
    const userId = req.userId || req.user?.id;
    const companyId = req.user?.companyId || req.user?.company?.id || null;
    const { vehicleId } = req.params;

    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle || vehicle.deletedAt) {
      return res.status(404).json({ success: false, error: "Vehicle not found" });
    }
    if (vehicle.userId !== userId && companyId && vehicle.companyId !== companyId) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    const gpsHistory = await prisma.telemetry.findMany({
      where: { 
        vehicleId: vehicle.id, 
        mode: 'LIVE', 
        latitude: { not: null }, 
        longitude: { not: null } 
      },
      orderBy: { timestamp: 'asc' },
      take: 500,
      select: {
        latitude: true,
        longitude: true,
        speed: true,
        timestamp: true,
        gpsAccuracy: true,
      },
    });

    res.json({ success: true, data: gpsHistory });
  } catch (err) {
    logger.error("Error fetching GPS history:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}
