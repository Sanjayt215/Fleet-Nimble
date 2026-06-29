import prisma from '../utils/prisma.js';

/**
 * Build compact context based on user intent
 * Only sends essential summaries, never full database objects
 */
export async function buildCompactContext(userId, message, vehicleId = null) {
  console.log('AI_COMPACT_CONTEXT_START', { userId, message: message?.substring(0, 50) });
  
  try {
    const lowerMessage = message.toLowerCase();
    
    // Detect intent
    const isFleetSummary = lowerMessage.includes('summary') || lowerMessage.includes('overview') || lowerMessage.includes('dashboard') || lowerMessage.includes('fleet health');
    const isVehicleQuestion = vehicleId || lowerMessage.includes('vehicle') || lowerMessage.includes('show') || lowerMessage.includes('status');
    const isComparison = lowerMessage.includes('compare') || lowerMessage.includes('vs') || lowerMessage.includes('versus');
    const isDTC = lowerMessage.includes('dtc') || lowerMessage.includes('code') || lowerMessage.includes('p0') || lowerMessage.includes('error code');
    const isMaintenance = lowerMessage.includes('maintenance') || lowerMessage.includes('repair') || lowerMessage.includes('service');
    const isSupport = lowerMessage.includes('help') || lowerMessage.includes('how to') || lowerMessage.includes('support') || lowerMessage.includes('guide');
    
    let context = {
      intent: 'general',
      dataSource: 'database',
      recordCounts: {},
    };
    
    if (isFleetSummary) {
      context = await buildFleetSummaryContext(userId);
    } else if (isVehicleQuestion && vehicleId) {
      context = await buildVehicleContext(userId, vehicleId);
    } else if (isComparison) {
      context = await buildComparisonContext(userId, message);
    } else if (isDTC) {
      context = await buildDTCContext(userId, vehicleId, message);
    } else if (isMaintenance) {
      context = await buildMaintenanceContext(userId);
    } else if (isSupport) {
      context = { intent: 'support', dataSource: 'knowledge_base', recordCounts: {} };
    } else {
      // General question - minimal context
      context = await buildMinimalContext(userId);
    }
    
    console.log('AI_COMPACT_CONTEXT_COMPLETE', { 
      intent: context.intent, 
      recordCounts: context.recordCounts 
    });
    
    return context;
  } catch (error) {
    console.error('AI_COMPACT_CONTEXT_ERROR', error);
    console.error(error.stack);
    return {
      intent: 'error',
      dataSource: 'none',
      recordCounts: {},
      error: error.message,
    };
  }
}

/**
 * Fleet summary context - only counts and top items
 */
async function buildFleetSummaryContext(userId) {
  const vehicles = await prisma.vehicle.findMany({
    where: { userId, deletedAt: null },
    select: {
      id: true,
      name: true,
      plateNumber: true,
      make: true,
      model: true,
      year: true,
      liveState: { select: { status: true } },
      _count: { select: { alerts: true, dtcCodes: true, maintenanceLogs: true } },
    },
    take: 50, // Limit to 50 vehicles max
  });
  
  const onlineCount = vehicles.filter(v => v.liveState?.status === 'online').length;
  const offlineCount = vehicles.filter(v => v.liveState?.status === 'offline').length;
  const standbyCount = vehicles.filter(v => v.liveState?.status === 'standby').length;
  
  const totalAlerts = vehicles.reduce((sum, v) => sum + v._count.alerts, 0);
  const totalDTCs = vehicles.reduce((sum, v) => sum + v._count.dtcCodes, 0);
  const totalMaintenance = vehicles.reduce((sum, v) => sum + v._count.maintenanceLogs, 0);
  
  // Get top 3 vehicles with most alerts
  const topRiskyVehicles = vehicles
    .sort((a, b) => b._count.alerts - a._count.alerts)
    .slice(0, 3)
    .map(v => ({
      name: v.name,
      plate: v.plateNumber,
      alertCount: v._count.alerts,
    }));
  
  // Get top 3 vehicles with maintenance due
  const maintenanceDue = await prisma.maintenanceLog.findMany({
    where: {
      vehicle: { userId, deletedAt: null },
      completed: false,
    },
    include: {
      vehicle: { select: { name: true, plateNumber: true } },
    },
    orderBy: { dueDate: 'asc' },
    take: 3,
  });
  
  // Get latest telemetry timestamp
  const latestTelemetry = await prisma.telemetry.findFirst({
    where: {
      vehicle: { userId, deletedAt: null },
    },
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true },
  });
  
  return {
    intent: 'fleet_summary',
    dataSource: 'database',
    recordCounts: {
      vehicles: vehicles.length,
      alerts: totalAlerts,
      dtcs: totalDTCs,
      maintenance: totalMaintenance,
    },
    fleet: {
      totalVehicles: vehicles.length,
      onlineCount,
      offlineCount,
      standbyCount,
      criticalAlertCount: totalAlerts,
      maintenanceDueCount: totalMaintenance,
      activeDtcCount: totalDTCs,
      topRiskyVehicles,
      maintenanceDue: maintenanceDue.map(m => ({
        vehicle: m.vehicle.name,
        plate: m.vehicle.plateNumber,
        dueDate: m.dueDate,
      })),
      latestTelemetry: latestTelemetry?.timestamp || null,
    },
  };
}

/**
 * Vehicle context - only selected vehicle with latest data
 */
async function buildVehicleContext(userId, vehicleId) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, userId, deletedAt: null },
    select: {
      id: true,
      name: true,
      plateNumber: true,
      vin: true,
      make: true,
      model: true,
      year: true,
      odometer: true,
      liveState: { select: { status: true } },
    },
  });
  
  if (!vehicle) {
    return {
      intent: 'vehicle',
      dataSource: 'none',
      recordCounts: {},
      error: 'Vehicle not found',
    };
  }
  
  // Latest telemetry only
  const latestTelemetry = await prisma.telemetry.findFirst({
    where: { vehicleId },
    orderBy: { timestamp: 'desc' },
    select: {
      timestamp: true,
      batteryVoltage: true,
      coolantTemp: true,
      fuelLevel: true,
      engineRPM: true,
      speed: true,
      odometer: true,
    },
  });
  
  // Latest location only
  const latestLocation = await prisma.gPSLocation.findFirst({
    where: { vehicleId },
    orderBy: { timestamp: 'desc' },
    select: {
      timestamp: true,
      latitude: true,
      longitude: true,
      address: true,
    },
  });
  
  // Latest 5 alerts only
  const alerts = await prisma.alert.findMany({
    where: { vehicleId, read: false },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      type: true,
      severity: true,
      message: true,
      createdAt: true,
    },
  });
  
  // Latest 5 maintenance only
  const maintenance = await prisma.maintenanceLog.findMany({
    where: { vehicleId, completed: false },
    orderBy: { dueDate: 'asc' },
    take: 5,
    select: {
      type: true,
      description: true,
      dueDate: true,
      priority: true,
    },
  });
  
  // Active DTCs only
  const dtcCodes = await prisma.dTCCode.findMany({
    where: { vehicleId, active: true },
    select: {
      code: true,
      description: true,
      severity: true,
      detectedAt: true,
    },
  });
  
  return {
    intent: 'vehicle',
    dataSource: 'database',
    recordCounts: {
      alerts: alerts.length,
      maintenance: maintenance.length,
      dtcs: dtcCodes.length,
    },
    vehicle: {
      name: vehicle.name,
      plate: vehicle.plateNumber,
      vin: vehicle.vin,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      odometer: vehicle.odometer,
      status: vehicle.liveState?.status || 'unknown',
      latestTelemetry,
      latestLocation,
      alerts,
      maintenance,
      dtcCodes,
    },
  };
}

/**
 * Comparison context - only 2 vehicles with summarized fields
 */
async function buildComparisonContext(userId, message) {
  // Simple vehicle name extraction from message
  const vehicleNames = message.match(/(?:show|compare|vs|and)\s+([a-zA-Z\s]+)/gi) || [];
  
  const vehicles = await prisma.vehicle.findMany({
    where: { userId, deletedAt: null },
    select: {
      id: true,
      name: true,
      plateNumber: true,
      make: true,
      model: true,
      year: true,
      liveState: { select: { status: true } },
    },
    take: 2,
  });
  
  if (vehicles.length < 2) {
    return {
      intent: 'comparison',
      dataSource: 'database',
      recordCounts: { vehicles: vehicles.length },
      error: 'Need at least 2 vehicles for comparison',
    };
  }
  
  const vehicleData = await Promise.all(
    vehicles.map(async (v) => {
      const telemetry = await prisma.telemetry.findFirst({
        where: { vehicleId: v.id },
        orderBy: { timestamp: 'desc' },
        select: {
          batteryVoltage: true,
          coolantTemp: true,
          fuelLevel: true,
        },
      });
      
      const alertCount = await prisma.alert.count({
        where: { vehicleId: v.id, read: false },
      });
      
      return {
        name: v.name,
        plate: v.plateNumber,
        make: v.make,
        model: v.model,
        year: v.year,
        status: v.liveState?.status || 'unknown',
        batteryVoltage: telemetry?.batteryVoltage,
        coolantTemp: telemetry?.coolantTemp,
        fuelLevel: telemetry?.fuelLevel,
        alertCount,
      };
    })
  );
  
  return {
    intent: 'comparison',
    dataSource: 'database',
    recordCounts: { vehicles: 2 },
    vehicles: vehicleData,
  };
}

/**
 * DTC context - only DTC code and vehicle context
 */
async function buildDTCContext(userId, vehicleId, message) {
  // Extract DTC code from message
  const dtcMatch = message.match(/[Pp][0-9][0-9A-Fa-f]{3}/);
  const dtcCode = dtcMatch ? dtcMatch[0].toUpperCase() : null;
  
  let vehicle = null;
  if (vehicleId) {
    vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, userId, deletedAt: null },
      select: { name: true, plateNumber: true, make: true, model: true },
    });
  }
  
  // Get DTC info from database if available
  const dtcInfo = dtcCode
    ? await prisma.dTCCode.findFirst({
        where: { code: dtcCode },
        select: { code: true, description: true, severity: true },
      })
    : null;
  
  return {
    intent: 'dtc',
    dataSource: 'database',
    recordCounts: {},
    dtc: {
      code: dtcCode,
      description: dtcInfo?.description || 'Unknown code',
      severity: dtcInfo?.severity || 'unknown',
      vehicle: vehicle ? {
        name: vehicle.name,
        plate: vehicle.plateNumber,
        make: vehicle.make,
        model: vehicle.model,
      } : null,
    },
  };
}

/**
 * Maintenance context - only vehicles needing maintenance
 */
async function buildMaintenanceContext(userId) {
  const maintenanceDue = await prisma.maintenanceLog.findMany({
    where: {
      vehicle: { userId, deletedAt: null },
      completed: false,
    },
    include: {
      vehicle: {
        select: {
          name: true,
          plateNumber: true,
          make: true,
          model: true,
        },
      },
    },
    orderBy: { dueDate: 'asc' },
    take: 10,
  });
  
  return {
    intent: 'maintenance',
    dataSource: 'database',
    recordCounts: { maintenance: maintenanceDue.length },
    maintenance: maintenanceDue.map(m => ({
      vehicle: m.vehicle.name,
      plate: m.vehicle.plateNumber,
      type: m.type,
      description: m.description,
      dueDate: m.dueDate,
      priority: m.priority,
    })),
  };
}

/**
 * Minimal context - just vehicle count
 */
async function buildMinimalContext(userId) {
  const vehicleCount = await prisma.vehicle.count({
    where: { userId, deletedAt: null },
  });
  
  return {
    intent: 'general',
    dataSource: 'database',
    recordCounts: { vehicles: vehicleCount },
    fleet: {
      totalVehicles: vehicleCount,
    },
  };
}
