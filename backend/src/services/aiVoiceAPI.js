/**
 * AI Voice Ready APIs
 * Designed for voice assistant integration
 * Provides simple, voice-friendly endpoints for common fleet operations
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { calculateFleetHealthScore } from './aiAnalysisEngine.js';
import { calculateAllVehicleHealthScores } from './aiAnalysisEngine.js';
import { getMaintenanceAIAnalysis } from './aiMaintenanceAI.js';
import { generateExecutiveReport } from './aiExecutiveReports.js';

/**
 * Voice-friendly response format
 */
function formatVoiceResponse(text, data = null) {
  return {
    speech: text,
    displayText: text,
    data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Track vehicle - Voice command: "Track vehicle FL-001"
 */
export async function voiceTrackVehicle(userId, vehicleIdentifier) {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        userId,
        deletedAt: null,
        OR: [
          { plateNumber: vehicleIdentifier.toUpperCase() },
          { vin: vehicleIdentifier.toUpperCase() },
          { id: vehicleIdentifier },
        ],
      },
      include: {
        gpsLocation: true,
        liveState: true,
      },
    });

    if (!vehicle) {
      return formatVoiceResponse(`Vehicle ${vehicleIdentifier} not found in your fleet.`);
    }

    if (!vehicle.gpsLocation) {
      return formatVoiceResponse(
        `${vehicle.make} ${vehicle.model} is not currently reporting GPS location. The vehicle may be offline or in a garage.`
      );
    }

    const speech = `${vehicle.make} ${vehicle.model} with plate ${vehicle.plateNumber || vehicle.vin} is currently located at latitude ${vehicle.gpsLocation.latitude.toFixed(4)} and longitude ${vehicle.gpsLocation.longitude.toFixed(4)}. The vehicle is ${vehicle.telemetryOnline ? 'online' : 'offline'} with ignition ${vehicle.liveState?.ignitionStatus ? 'on' : 'off'}.`;

    return formatVoiceResponse(speech, {
      vehicle: `${vehicle.make} ${vehicle.model}`,
      plate: vehicle.plateNumber || vehicle.vin,
      location: vehicle.gpsLocation,
      online: vehicle.telemetryOnline,
      ignition: vehicle.liveState?.ignitionStatus ? 'ON' : 'OFF',
    });
  } catch (error) {
    logger.error('Error in voice track vehicle', { userId, vehicleIdentifier, error: error.message });
    return formatVoiceResponse('Sorry, I encountered an error tracking the vehicle.');
  }
}

/**
 * Show diagnostics - Voice command: "Show diagnostics for FL-001"
 */
export async function voiceShowDiagnostics(userId, vehicleIdentifier) {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        userId,
        deletedAt: null,
        OR: [
          { plateNumber: vehicleIdentifier.toUpperCase() },
          { vin: vehicleIdentifier.toUpperCase() },
          { id: vehicleIdentifier },
        ],
      },
      include: {
        dtcCodes: { where: { active: true } },
        alerts: { where: { read: false } },
      },
    });

    if (!vehicle) {
      return formatVoiceResponse(`Vehicle ${vehicleIdentifier} not found in your fleet.`);
    }

    const dtcCount = vehicle.dtcCodes.length;
    const alertCount = vehicle.alerts.length;

    if (dtcCount === 0 && alertCount === 0) {
      return formatVoiceResponse(
        `${vehicle.make} ${vehicle.model} has no active diagnostic trouble codes or alerts. The vehicle appears to be in good condition.`
      );
    }

    let speech = `${vehicle.make} ${vehicle.model} has ${dtcCount} diagnostic trouble codes and ${alertCount} alerts. `;
    
    if (dtcCount > 0) {
      const topDTCs = vehicle.dtcCodes.slice(0, 3).map(d => d.code).join(', ');
      speech += `The main trouble codes are ${topDTCs}. `;
    }
    
    if (alertCount > 0) {
      const criticalAlerts = vehicle.alerts.filter(a => a.severity === 'CRITICAL').length;
      speech += criticalAlerts > 0 
        ? `There are ${criticalAlerts} critical alerts requiring immediate attention.`
        : `There are ${alertCount} alerts to review.`;
    }

    return formatVoiceResponse(speech, {
      vehicle: `${vehicle.make} ${vehicle.model}`,
      plate: vehicle.plateNumber || vehicle.vin,
      dtcCodes: vehicle.dtcCodes.map(d => d.code),
      alerts: vehicle.alerts.map(a => ({ severity: a.severity, message: a.message })),
    });
  } catch (error) {
    logger.error('Error in voice show diagnostics', { userId, vehicleIdentifier, error: error.message });
    return formatVoiceResponse('Sorry, I encountered an error retrieving diagnostics.');
  }
}

/**
 * Show maintenance - Voice command: "Show maintenance for FL-001"
 */
export async function voiceShowMaintenance(userId, vehicleIdentifier) {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        userId,
        deletedAt: null,
        OR: [
          { plateNumber: vehicleIdentifier.toUpperCase() },
          { vin: vehicleIdentifier.toUpperCase() },
          { id: vehicleIdentifier },
        ],
      },
      include: {
        maintenanceLogs: {
          where: { completed: false },
          orderBy: { dueDate: 'asc' },
          take: 5,
        },
      },
    });

    if (!vehicle) {
      return formatVoiceResponse(`Vehicle ${vehicleIdentifier} not found in your fleet.`);
    }

    const maintenanceCount = vehicle.maintenanceLogs.length;

    if (maintenanceCount === 0) {
      return formatVoiceResponse(
        `${vehicle.make} ${vehicle.model} has no pending maintenance items. Everything is up to date.`
      );
    }

    const now = new Date();
    const overdue = vehicle.maintenanceLogs.filter(m => new Date(m.dueDate) < now);
    const dueThisWeek = vehicle.maintenanceLogs.filter(m => {
      const dueDate = new Date(m.dueDate);
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      return dueDate >= now && dueDate <= weekFromNow;
    });

    let speech = `${vehicle.make} ${vehicle.model} has ${maintenanceCount} pending maintenance items. `;
    
    if (overdue.length > 0) {
      speech += `${overdue.length} items are overdue. `;
    }
    
    if (dueThisWeek.length > 0) {
      speech += `${dueThisWeek.length} items are due this week. `;
    }

    const nextMaintenance = vehicle.maintenanceLogs[0];
    speech += `The next maintenance is ${nextMaintenance.type} due on ${new Date(nextMaintenance.dueDate).toLocaleDateString()}.`;

    return formatVoiceResponse(speech, {
      vehicle: `${vehicle.make} ${vehicle.model}`,
      plate: vehicle.plateNumber || vehicle.vin,
      maintenanceItems: vehicle.maintenanceLogs.map(m => ({
        type: m.type,
        dueDate: m.dueDate,
        priority: m.priority,
      })),
    });
  } catch (error) {
    logger.error('Error in voice show maintenance', { userId, vehicleIdentifier, error: error.message });
    return formatVoiceResponse('Sorry, I encountered an error retrieving maintenance information.');
  }
}

/**
 * Generate report - Voice command: "Generate fleet report"
 */
export async function voiceGenerateReport(userId, reportType = 'executive') {
  try {
    let report;
    let speech;

    switch (reportType.toLowerCase()) {
      case 'executive':
      case 'fleet':
        report = await generateExecutiveReport(userId);
        const fleetHealth = report.executiveSummary.fleetHealthScore;
        const riskLevel = report.executiveSummary.fleetRiskLevel;
        speech = `Your fleet health score is ${fleetHealth} out of 100 with ${riskLevel} risk level. You have ${report.executiveSummary.totalVehicles} vehicles with ${report.executiveSummary.fleetUtilization}% utilization. Total fuel cost is $${report.executiveSummary.totalFuelCost} and maintenance cost is $${report.executiveSummary.totalMaintenanceCost}.`;
        break;
      case 'maintenance':
        const maintenanceAnalysis = await getMaintenanceAIAnalysis(userId);
        speech = `You have ${maintenanceAnalysis.summary.totalItems} pending maintenance items. ${maintenanceAnalysis.summary.criticalCount} are critical priority, ${maintenanceAnalysis.summary.highCount} are high priority. Total estimated cost is $${maintenanceAnalysis.totalEstimatedCost}.`;
        break;
      default:
        report = await generateExecutiveReport(userId);
        speech = `I've generated your ${reportType} report. The fleet health score is ${report.executiveSummary.fleetHealthScore} out of 100.`;
    }

    return formatVoiceResponse(speech, report);
  } catch (error) {
    logger.error('Error in voice generate report', { userId, reportType, error: error.message });
    return formatVoiceResponse('Sorry, I encountered an error generating the report.');
  }
}

/**
 * Fleet status - Voice command: "What is my fleet status?"
 */
export async function voiceFleetStatus(userId) {
  try {
    const fleetHealth = await calculateFleetHealthScore(userId);

    const speech = `Your fleet has ${fleetHealth.vehicleCount} vehicles with a health score of ${fleetHealth.score} out of 100. The risk level is ${fleetHealth.riskLevel}. ${fleetHealth.onlineCount} vehicles are online, ${fleetHealth.offlineCount} are offline. There are ${fleetHealth.criticalAlerts} critical alerts and ${fleetHealth.activeDTCs} active diagnostic trouble codes.`;

    return formatVoiceResponse(speech, fleetHealth);
  } catch (error) {
    logger.error('Error in voice fleet status', { userId, error: error.message });
    return formatVoiceResponse('Sorry, I encountered an error retrieving fleet status.');
  }
}

/**
 * Vehicle health - Voice command: "How is vehicle FL-001 doing?"
 */
export async function voiceVehicleHealth(userId, vehicleIdentifier) {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        userId,
        deletedAt: null,
        OR: [
          { plateNumber: vehicleIdentifier.toUpperCase() },
          { vin: vehicleIdentifier.toUpperCase() },
          { id: vehicleIdentifier },
        ],
      },
    });

    if (!vehicle) {
      return formatVoiceResponse(`Vehicle ${vehicleIdentifier} not found in your fleet.`);
    }

    const healthScores = await calculateAllVehicleHealthScores(vehicle.id);

    const speech = `${vehicle.make} ${vehicle.model} has an overall health score of ${healthScores.vehicle.score} out of 100 with ${healthScores.vehicle.riskLevel} risk. Battery health is ${healthScores.battery.score}, engine health is ${healthScores.engine.score}, and maintenance health is ${healthScores.maintenance.score}.`;

    return formatVoiceResponse(speech, {
      vehicle: `${vehicle.make} ${vehicle.model}`,
      plate: vehicle.plateNumber || vehicle.vin,
      healthScores,
    });
  } catch (error) {
    logger.error('Error in voice vehicle health', { userId, vehicleIdentifier, error: error.message });
    return formatVoiceResponse('Sorry, I encountered an error retrieving vehicle health.');
  }
}

/**
 * Critical alerts - Voice command: "What are the critical alerts?"
 */
export async function voiceCriticalAlerts(userId) {
  try {
    const alerts = await prisma.alert.findMany({
      where: {
        vehicle: { userId, deletedAt: null },
        severity: 'CRITICAL',
        read: false,
      },
      include: {
        vehicle: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (alerts.length === 0) {
      return formatVoiceResponse('Good news! There are no critical alerts in your fleet.');
    }

    const vehicleNames = alerts.map(a => `${a.vehicle.make} ${a.vehicle.model}`).join(', ');
    const speech = `You have ${alerts.length} critical alerts affecting ${vehicleNames}. These require immediate attention.`;

    return formatVoiceResponse(speech, {
      alertCount: alerts.length,
      alerts: alerts.map(a => ({
        vehicle: `${a.vehicle.make} ${a.vehicle.model}`,
        message: a.message,
        severity: a.severity,
      })),
    });
  } catch (error) {
    logger.error('Error in voice critical alerts', { userId, error: error.message });
    return formatVoiceResponse('Sorry, I encountered an error retrieving critical alerts.');
  }
}

/**
 * Voice command router
 */
export async function voiceCommandRouter(userId, command, params = {}) {
  const lowerCommand = command.toLowerCase();

  try {
    if (lowerCommand.includes('track') || lowerCommand.includes('where is')) {
      return await voiceTrackVehicle(userId, params.vehicleIdentifier);
    } else if (lowerCommand.includes('diagnostic') || lowerCommand.includes('dtc')) {
      return await voiceShowDiagnostics(userId, params.vehicleIdentifier);
    } else if (lowerCommand.includes('maintenance') || lowerCommand.includes('service')) {
      return await voiceShowMaintenance(userId, params.vehicleIdentifier);
    } else if (lowerCommand.includes('report')) {
      return await voiceGenerateReport(userId, params.reportType);
    } else if (lowerCommand.includes('fleet status') || lowerCommand.includes('how is my fleet')) {
      return await voiceFleetStatus(userId);
    } else if (lowerCommand.includes('vehicle health') || lowerCommand.includes('how is vehicle')) {
      return await voiceVehicleHealth(userId, params.vehicleIdentifier);
    } else if (lowerCommand.includes('critical alert') || lowerCommand.includes('urgent')) {
      return await voiceCriticalAlerts(userId);
    } else {
      return formatVoiceResponse('I didn\'t understand that command. You can ask me to track a vehicle, show diagnostics, show maintenance, generate a report, check fleet status, check vehicle health, or show critical alerts.');
    }
  } catch (error) {
    logger.error('Error in voice command router', { userId, command, error: error.message });
    return formatVoiceResponse('Sorry, I encountered an error processing your request.');
  }
}

/**
 * Get available voice commands
 */
export function getAvailableVoiceCommands() {
  return [
    {
      command: 'Track vehicle',
      examples: ['Track vehicle FL-001', 'Where is vehicle FL-001', 'Find FL-001'],
      description: 'Get current location and status of a vehicle',
    },
    {
      command: 'Show diagnostics',
      examples: ['Show diagnostics for FL-001', 'What are the trouble codes for FL-001'],
      description: 'Get diagnostic trouble codes and alerts for a vehicle',
    },
    {
      command: 'Show maintenance',
      examples: ['Show maintenance for FL-001', 'What maintenance is due for FL-001'],
      description: 'Get pending maintenance items for a vehicle',
    },
    {
      command: 'Generate report',
      examples: ['Generate fleet report', 'Generate executive report', 'Generate maintenance report'],
      description: 'Generate various fleet reports',
    },
    {
      command: 'Fleet status',
      examples: ['What is my fleet status', 'How is my fleet doing', 'Fleet overview'],
      description: 'Get overall fleet health and status',
    },
    {
      command: 'Vehicle health',
      examples: ['How is vehicle FL-001 doing', 'Vehicle health for FL-001'],
      description: 'Get comprehensive health score for a vehicle',
    },
    {
      command: 'Critical alerts',
      examples: ['What are the critical alerts', 'Show urgent alerts', 'Critical issues'],
      description: 'Get all critical alerts requiring immediate attention',
    },
  ];
}
