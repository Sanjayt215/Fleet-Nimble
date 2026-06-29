/**
 * AI Response Formatter
 * Structures AI responses in professional JSON format for frontend rendering
 */

/**
 * Create structured response format
 */
export function createStructuredResponse({
  title,
  summary,
  metrics = {},
  priority = 'Medium',
  recommendations = [],
  businessImpact = null,
  confidence = 'High',
  dataFreshness = 'Live',
  sections = [],
}) {
  return {
    title,
    summary,
    metrics,
    priority, // Critical, High, Medium, Low
    recommendations,
    businessImpact,
    confidence, // High, Medium, Low, or percentage
    dataFreshness, // Live, Historical, Simulated, Offline
    sections,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create fleet summary response
 */
export function createFleetSummaryResponse(fleetData) {
  return createStructuredResponse({
    title: 'Fleet Summary',
    summary: `Your fleet has ${fleetData.totalVehicles} vehicles with ${fleetData.onlineVehicles} currently online.`,
    metrics: {
      'Total Vehicles': fleetData.totalVehicles,
      'Online': fleetData.onlineVehicles,
      'Offline': fleetData.offlineVehicles,
      'Standby': fleetData.standbyVehicles,
      'Critical Alerts': fleetData.criticalAlerts,
      'Maintenance Due': fleetData.maintenanceDue,
      'Active DTCs': fleetData.activeDTCs,
      'Health Score': `${fleetData.healthScore}/100`,
      'Risk Level': fleetData.riskLevel,
    },
    priority: fleetData.riskLevel === 'Critical' ? 'Critical' : fleetData.riskLevel === 'High' ? 'High' : 'Medium',
    recommendations: [
      fleetData.criticalAlerts > 0 ? 'Address critical alerts immediately' : null,
      fleetData.maintenanceDue > 0 ? 'Schedule overdue maintenance' : null,
      fleetData.offlineVehicles > 0 ? 'Check offline vehicle connectivity' : null,
    ].filter(Boolean),
    businessImpact: fleetData.riskLevel === 'Critical' 
      ? 'High risk of vehicle downtime and delivery delays'
      : fleetData.riskLevel === 'High'
      ? 'Moderate risk of operational disruption'
      : 'Low operational risk',
    confidence: 'High',
    dataFreshness: fleetData.lastTelemetryUpdate 
      ? Date.now() - new Date(fleetData.lastTelemetryUpdate).getTime() < 3600000 ? 'Live' : 'Historical'
      : 'Offline',
  });
}

/**
 * Create vehicle status response
 */
export function createVehicleStatusResponse(vehicle, telemetry) {
  const healthScore = calculateVehicleHealthScore(vehicle, telemetry);
  
  return createStructuredResponse({
    title: `Vehicle Status: ${vehicle.make} ${vehicle.model}`,
    summary: `${vehicle.plateNumber || vehicle.vin} is ${vehicle.telemetryOnline ? 'online' : 'offline'} with ignition ${vehicle.liveState?.ignitionStatus ? 'ON' : 'OFF'}.`,
    metrics: {
      'Status': vehicle.liveState?.vehicleStatus || 'Unknown',
      'Ignition': vehicle.liveState?.ignitionStatus ? 'ON' : 'OFF',
      'Telemetry': vehicle.telemetryOnline ? 'Online' : 'Offline',
      'Battery Voltage': telemetry?.batteryVoltage ? `${telemetry.batteryVoltage.toFixed(2)}V` : 'N/A',
      'Coolant Temp': telemetry?.coolantTemp ? `${telemetry.coolantTemp.toFixed(1)}°C` : 'N/A',
      'Fuel Level': telemetry?.fuelLevel ? `${telemetry.fuelLevel.toFixed(1)}%` : 'N/A',
      'RPM': telemetry?.rpm || 'N/A',
      'Speed': telemetry?.speed || 'N/A',
      'Health Score': `${healthScore}/100`,
    },
    priority: healthScore < 50 ? 'Critical' : healthScore < 70 ? 'High' : 'Medium',
    recommendations: [
      !vehicle.telemetryOnline ? 'Check vehicle connectivity' : null,
      telemetry?.batteryVoltage < 12 ? 'Check battery health' : null,
      telemetry?.coolantTemp > 100 ? 'Check cooling system' : null,
    ].filter(Boolean),
    businessImpact: healthScore < 50 
      ? 'High risk of vehicle failure and downtime'
      : 'Low operational risk',
    confidence: vehicle.telemetryOnline ? 'High' : 'Medium',
    dataFreshness: vehicle.telemetryOnline ? 'Live' : 'Offline',
  });
}

/**
 * Create alerts response
 */
export function createAlertsResponse(alerts) {
  const criticalCount = alerts.filter(a => a.severity === 'CRITICAL').length;
  
  return createStructuredResponse({
    title: 'Active Alerts',
    summary: `You have ${alerts.length} unread alerts, including ${criticalCount} critical issues.`,
    metrics: {
      'Total Alerts': alerts.length,
      'Critical': criticalCount,
      'High': alerts.filter(a => a.severity === 'HIGH').length,
      'Medium': alerts.filter(a => a.severity === 'MEDIUM').length,
      'Low': alerts.filter(a => a.severity === 'LOW').length,
    },
    priority: criticalCount > 0 ? 'Critical' : alerts.length > 0 ? 'High' : 'Low',
    recommendations: [
      criticalCount > 0 ? 'Address critical alerts immediately' : null,
      alerts.length > 0 ? 'Review all alerts and take action' : null,
    ].filter(Boolean),
    businessImpact: criticalCount > 0 
      ? 'High risk of vehicle damage and safety incidents'
      : 'Moderate operational impact',
    confidence: 'High',
    dataFreshness: 'Live',
    sections: alerts.slice(0, 5).map(alert => ({
      type: 'alert',
      vehicle: alert.vehicle.plateNumber,
      severity: alert.severity,
      message: alert.message,
      timestamp: alert.createdAt,
    })),
  });
}

/**
 * Create maintenance response
 */
export function createMaintenanceResponse(maintenanceItems) {
  const overdueCount = maintenanceItems.filter(m => new Date(m.dueDate) < new Date()).length;
  
  return createStructuredResponse({
    title: 'Maintenance Schedule',
    summary: `You have ${maintenanceItems.length} pending maintenance items, ${overdueCount} are overdue.`,
    metrics: {
      'Total Maintenance': maintenanceItems.length,
      'Overdue': overdueCount,
      'Due This Week': maintenanceItems.filter(m => {
        const due = new Date(m.dueDate);
        const weekFromNow = new Date();
        weekFromNow.setDate(weekFromNow.getDate() + 7);
        return due > new Date() && due <= weekFromNow;
      }).length,
    },
    priority: overdueCount > 0 ? 'Critical' : maintenanceItems.length > 0 ? 'Medium' : 'Low',
    recommendations: [
      overdueCount > 0 ? 'Schedule overdue maintenance immediately' : null,
      maintenanceItems.length > 0 ? 'Plan upcoming maintenance' : null,
    ].filter(Boolean),
    businessImpact: overdueCount > 0 
      ? 'High risk of vehicle failure and increased repair costs'
      : 'Low operational impact',
    confidence: 'High',
    dataFreshness: 'Live',
    sections: maintenanceItems.slice(0, 5).map(item => ({
      type: 'maintenance',
      vehicle: item.vehicle.plateNumber,
      type: item.type,
      dueDate: item.dueDate,
      priority: item.priority,
    })),
  });
}

/**
 * Create diagnostics response
 */
export function createDiagnosticsResponse(dtcCodes) {
  return createStructuredResponse({
    title: 'Active Diagnostics',
    summary: `You have ${dtcCodes.length} active diagnostic trouble codes.`,
    metrics: {
      'Total DTCs': dtcCodes.length,
      'Powertrain (P)': dtcCodes.filter(d => d.code.startsWith('P')).length,
      'Chassis (C)': dtcCodes.filter(d => d.code.startsWith('C')).length,
      'Body (B)': dtcCodes.filter(d => d.code.startsWith('B')).length,
      'Network (U)': dtcCodes.filter(d => d.code.startsWith('U')).length,
    },
    priority: dtcCodes.length > 0 ? 'High' : 'Low',
    recommendations: [
      dtcCodes.length > 0 ? 'Address diagnostic codes to prevent further issues' : null,
    ].filter(Boolean),
    businessImpact: dtcCodes.length > 0 
      ? 'Potential vehicle performance issues and emissions problems'
      : 'No operational impact',
    confidence: 'High',
    dataFreshness: 'Live',
    sections: dtcCodes.slice(0, 5).map(dtc => ({
      type: 'dtc',
      vehicle: dtc.vehicle.plateNumber,
      code: dtc.code,
      description: dtc.description,
      detectedAt: dtc.detectedAt,
    })),
  });
}

/**
 * Create GPS/location response
 */
export function createGPSResponse(vehicle, location) {
  return createStructuredResponse({
    title: `Vehicle Location: ${vehicle.make} ${vehicle.model}`,
    summary: location 
      ? `Vehicle ${vehicle.plateNumber || vehicle.vin} is located at ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}.`
      : `Vehicle ${vehicle.plateNumber || vehicle.vin} has no GPS data available.`,
    metrics: location ? {
      'Latitude': location.latitude.toFixed(4),
      'Longitude': location.longitude.toFixed(4),
      'Speed': location.speed || 'N/A',
      'Heading': location.heading || 'N/A',
      'Last Update': location.timestamp || 'N/A',
    } : {},
    priority: 'Low',
    recommendations: [
      !location ? 'Check GPS device connectivity' : null,
    ].filter(Boolean),
    businessImpact: 'No immediate business impact',
    confidence: location ? 'High' : 'Low',
    dataFreshness: location ? 'Live' : 'Offline',
  });
}

/**
 * Create support response
 */
export function createSupportResponse(topic, steps) {
  return createStructuredResponse({
    title: `Support: ${topic}`,
    summary: `Step-by-step guide for ${topic.toLowerCase()}.`,
    metrics: {},
    priority: 'Low',
    recommendations: [],
    businessImpact: null,
    confidence: 'High',
    dataFreshness: 'N/A',
    sections: steps.map((step, index) => ({
      type: 'step',
      step: index + 1,
      instruction: step,
    })),
  });
}

/**
 * Calculate vehicle health score
 */
function calculateVehicleHealthScore(vehicle, telemetry) {
  let score = 100;
  
  if (!vehicle.telemetryOnline) score -= 30;
  if (vehicle.alerts?.length > 0) score -= vehicle.alerts.length * 10;
  if (vehicle.dtcCodes?.length > 0) score -= vehicle.dtcCodes.length * 5;
  if (telemetry?.batteryVoltage < 12) score -= 15;
  if (telemetry?.coolantTemp > 100) score -= 20;
  
  return Math.max(0, score);
}
