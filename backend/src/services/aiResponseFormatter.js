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

/**
 * Format response with executive-quality concise format
 * - 150-250 words
 * - clean title
 * - 3-6 key metrics
 * - top 2-3 risks only
 * - one recommended next action
 * - confidence level
 * - data freshness
 */
export async function formatResponse(combinedResults, intent, entities) {
  try {
    const formatted = {
      title: generateTitle(intent, entities),
      message: generateMessage(combinedResults, intent),
      metrics: extractKeyMetrics(combinedResults, intent),
      risks: extractTopRisks(combinedResults, intent),
      recommendedAction: generateRecommendedAction(combinedResults, intent),
      confidence: calculateConfidence(combinedResults, intent),
      dataFreshness: calculateDataFreshness(combinedResults),
    };

    // Ensure message is 150-250 words
    formatted.message = trimToWordCount(formatted.message, 150, 250);

    return formatted;
  } catch (error) {
    throw new Error(`Error formatting response: ${error.message}`);
  }
}

/**
 * Generate title based on intent and entities
 */
function generateTitle(intent, entities) {
  const vehicleNames = entities.vehicles?.map(v => v.name).join(', ') || 'Fleet';
  
  switch (intent.type) {
    case 'FLEET_SUMMARY':
      return 'Fleet Health Overview';
    case 'VEHICLE_COMPARISON':
      return `Vehicle Comparison: ${vehicleNames}`;
    case 'DIAGNOSTICS':
      return `Diagnostics: ${vehicleNames}`;
    case 'PREDICTIVE_MAINTENANCE':
      return 'Predictive Maintenance Analysis';
    case 'BUSINESS_IMPACT':
      return 'Business Impact Analysis';
    case 'SUPPORT_TROUBLESHOOTING':
      return 'Troubleshooting Guide';
    case 'REPORT_GENERATION':
      return 'Report Generated';
    case 'VEHICLE_STATUS':
      return `Vehicle Status: ${vehicleNames}`;
    case 'MAINTENANCE_QUERY':
      return 'Maintenance Status';
    case 'PREDICTIVE_ANALYSIS':
      return 'Predictive Analysis';
    default:
      return 'Fleet Operations Insight';
  }
}

/**
 * Generate concise message (150-250 words)
 */
function generateMessage(combinedResults, intent) {
  const summary = combinedResults.summary || {};
  
  switch (intent.type) {
    case 'FLEET_SUMMARY':
      return `Your fleet consists of ${summary.totalVehicles || 0} vehicles with ${summary.onlineVehicles || 0} currently online. The overall health score is ${summary.healthScore || 'N/A'}/100 with a ${summary.riskLevel || 'UNKNOWN'} risk level. You have ${summary.criticalAlerts || 0} critical alerts requiring immediate attention and ${summary.pendingMaintenance || 0} pending maintenance items. Focus on addressing critical alerts first to minimize operational risk and ensure fleet availability.`;
    
    case 'VEHICLE_COMPARISON':
      return `Comparing ${summary.vehicles?.length || 0} vehicles based on health, efficiency, and maintenance costs. The analysis reveals differences in performance metrics that can inform maintenance prioritization and operational decisions. Review the detailed comparison to identify the best-performing vehicle and areas requiring improvement.`;
    
    case 'DIAGNOSTICS':
      return `Found ${summary.dtcCodes?.length || 0} active diagnostic trouble codes across your vehicles. The most critical issues require immediate attention to prevent further damage. Review the specific DTC codes and their descriptions to determine the appropriate repair actions.`;
    
    case 'PREDICTIVE_MAINTENANCE':
      return `AI predictions indicate ${summary.predictions?.length || 0} potential maintenance requirements in the near future. The overall risk level is ${summary.riskLevel || 'UNKNOWN'}. Proactive maintenance based on these predictions can prevent unexpected failures and reduce downtime costs.`;
    
    case 'MAINTENANCE_QUERY':
      return `You have ${summary.maintenanceItems?.length || 0} pending maintenance items with an estimated total cost of $${summary.estimatedCost || 0}. ${summary.urgentItems?.length || 0} items require urgent attention. Prioritize critical maintenance to prevent vehicle failures and ensure operational continuity.`;
    
    case 'PREDICTIVE_ANALYSIS':
      return `Based on current fleet data, the vehicle most likely to fail next is identified with a ${summary.riskLevel || 'UNKNOWN'} risk level. The analysis considers health scores, predictions, and historical trends. Address the recommended maintenance items to mitigate this risk.`;
    
    default:
      return `Analysis completed successfully. Review the metrics and recommendations below for detailed insights into your fleet operations. The data provides actionable information to optimize fleet performance and reduce operational risks.`;
  }
}

/**
 * Extract 3-6 key metrics
 */
function extractKeyMetrics(combinedResults, intent) {
  const summary = combinedResults.summary || {};
  const metrics = {};
  
  switch (intent.type) {
    case 'FLEET_SUMMARY':
      metrics['Total Vehicles'] = summary.totalVehicles || 0;
      metrics['Online'] = summary.onlineVehicles || 0;
      metrics['Health Score'] = `${summary.healthScore || 'N/A'}/100`;
      metrics['Critical Alerts'] = summary.criticalAlerts || 0;
      metrics['Pending Maintenance'] = summary.pendingMaintenance || 0;
      metrics['Risk Level'] = summary.riskLevel || 'UNKNOWN';
      break;
    
    case 'VEHICLE_COMPARISON':
      if (summary.comparison?.healthScore) {
        summary.comparison.healthScore.forEach(h => {
          metrics[`${h.vehicle} Health`] = `${h.score}/100`;
        });
      }
      if (summary.comparison?.fuelEfficiency) {
        summary.comparison.fuelEfficiency.forEach(f => {
          metrics[`${f.vehicle} Efficiency`] = f.efficiency || 'N/A';
        });
      }
      break;
    
    case 'DIAGNOSTICS':
      metrics['Total DTCs'] = summary.dtcCodes?.length || 0;
      metrics['Critical Codes'] = summary.dtcCodes?.filter(d => d.code.startsWith('P0')).length || 0;
      metrics['Affected Vehicles'] = summary.healthStatus?.length || 0;
      break;
    
    case 'MAINTENANCE_QUERY':
      metrics['Total Items'] = summary.maintenanceItems?.length || 0;
      metrics['Urgent Items'] = summary.urgentItems?.length || 0;
      metrics['Estimated Cost'] = `$${summary.estimatedCost || 0}`;
      break;
    
    case 'PREDICTIVE_ANALYSIS':
      metrics['Risk Level'] = summary.riskLevel || 'UNKNOWN';
      metrics['Predictions'] = summary.predictions?.length || 0;
      metrics['Recommendations'] = summary.recommendations?.length || 0;
      break;
    
    default:
      metrics['Items Analyzed'] = summary.count || 0;
      metrics['Data Points'] = combinedResults.data?.length || 0;
  }
  
  // Limit to 6 metrics
  const metricKeys = Object.keys(metrics).slice(0, 6);
  const limitedMetrics = {};
  metricKeys.forEach(key => {
    limitedMetrics[key] = metrics[key];
  });
  
  return limitedMetrics;
}

/**
 * Extract top 2-3 risks only
 */
function extractTopRisks(combinedResults, intent) {
  const risks = [];
  const summary = combinedResults.summary || {};
  
  switch (intent.type) {
    case 'FLEET_SUMMARY':
      if (summary.criticalAlerts > 0) {
        risks.push({ type: 'Critical Alerts', count: summary.criticalAlerts, severity: 'CRITICAL' });
      }
      if (summary.offlineVehicles > 0) {
        risks.push({ type: 'Offline Vehicles', count: summary.offlineVehicles, severity: 'HIGH' });
      }
      if (summary.healthScore < 60) {
        risks.push({ type: 'Low Fleet Health', score: summary.healthScore, severity: 'HIGH' });
      }
      break;
    
    case 'DIAGNOSTICS':
      if (summary.dtcCodes?.length > 0) {
        risks.push({ type: 'Active DTC Codes', count: summary.dtcCodes.length, severity: 'HIGH' });
      }
      break;
    
    case 'MAINTENANCE_QUERY':
      if (summary.urgentItems?.length > 0) {
        risks.push({ type: 'Urgent Maintenance', count: summary.urgentItems.length, severity: 'CRITICAL' });
      }
      break;
    
    case 'PREDICTIVE_ANALYSIS':
      if (summary.riskLevel === 'CRITICAL' || summary.riskLevel === 'HIGH') {
        risks.push({ type: 'Predicted Failure', level: summary.riskLevel, severity: summary.riskLevel });
      }
      break;
  }
  
  return risks.slice(0, 3);
}

/**
 * Generate one recommended next action
 */
function generateRecommendedAction(combinedResults, intent) {
  const summary = combinedResults.summary || {};
  
  switch (intent.type) {
    case 'FLEET_SUMMARY':
      if (summary.criticalAlerts > 0) return 'Address critical alerts immediately';
      if (summary.offlineVehicles > 0) return 'Restore offline vehicle connectivity';
      if (summary.pendingMaintenance > 0) return 'Schedule pending maintenance';
      return 'Continue regular fleet monitoring';
    
    case 'DIAGNOSTICS':
      return 'Review DTC codes and schedule diagnostic inspection';
    
    case 'MAINTENANCE_QUERY':
      return 'Prioritize urgent maintenance items';
    
    case 'PREDICTIVE_ANALYSIS':
      return 'Schedule proactive maintenance based on predictions';
    
    case 'VEHICLE_COMPARISON':
      return 'Review comparison results and adjust fleet strategy';
    
    default:
      return 'Review insights and take appropriate action';
  }
}

/**
 * Calculate confidence level
 */
function calculateConfidence(combinedResults, intent) {
  const dataCount = combinedResults.data?.length || 0;
  const successCount = combinedResults.data?.filter(d => d.success !== false).length || 0;
  
  if (dataCount === 0) return 'LOW';
  if (successCount === dataCount) return 'HIGH';
  if (successCount / dataCount > 0.7) return 'MEDIUM';
  return 'LOW';
}

/**
 * Calculate data freshness
 */
function calculateDataFreshness(combinedResults) {
  const metadata = combinedResults.metadata || {};
  const lastUpdate = metadata.lastUpdate || metadata.timestamp;
  
  if (!lastUpdate) return 'UNKNOWN';
  
  const age = Date.now() - new Date(lastUpdate).getTime();
  
  if (age < 5 * 60 * 1000) return 'LIVE'; // Less than 5 minutes
  if (age < 60 * 60 * 1000) return 'RECENT'; // Less than 1 hour
  if (age < 24 * 60 * 60 * 1000) return 'HISTORICAL'; // Less than 24 hours
  return 'STALE';
}

/**
 * Trim message to word count range
 */
function trimToWordCount(message, minWords, maxWords) {
  const words = message.split(/\s+/);
  
  if (words.length <= maxWords && words.length >= minWords) {
    return message;
  }
  
  if (words.length > maxWords) {
    return words.slice(0, maxWords).join(' ') + '...';
  }
  
  // If too short, expand with generic text (shouldn't happen with proper generation)
  return message + ' Additional analysis available upon request.';
}

/**
 * Generate suggested follow-up actions based on context
 */
export async function generateSuggestedActions(intent, entities, combinedResults) {
  const actions = [];
  const vehicleNames = entities.vehicles?.map(v => v.name) || [];
  
  // Context-aware suggestions
  if (intent.type === 'FLEET_SUMMARY') {
    actions.push({ label: 'View Critical Alerts', action: 'show_alerts', params: { severity: 'CRITICAL' } });
    actions.push({ label: 'Generate Fleet Report', action: 'generate_report', params: { type: 'fleet' } });
    actions.push({ label: 'View Maintenance Schedule', action: 'show_maintenance', params: {} });
  } else if (intent.type === 'VEHICLE_STATUS' && vehicleNames.length > 0) {
    actions.push({ label: 'Open Live Diagnostics', action: 'show_diagnostics', params: { vehicle: vehicleNames[0] } });
    actions.push({ label: 'Show GPS Location', action: 'show_gps', params: { vehicle: vehicleNames[0] } });
    actions.push({ label: 'Generate Vehicle Report', action: 'generate_report', params: { vehicle: vehicleNames[0] } });
  } else if (intent.type === 'DIAGNOSTICS') {
    actions.push({ label: 'Explain DTC Codes', action: 'explain_dtc', params: {} });
    actions.push({ label: 'Schedule Maintenance', action: 'schedule_maintenance', params: {} });
    actions.push({ label: 'Compare Vehicles', action: 'compare_vehicles', params: {} });
  } else if (intent.type === 'MAINTENANCE_QUERY') {
    actions.push({ label: 'Schedule Maintenance', action: 'schedule_maintenance', params: {} });
    actions.push({ label: 'View Cost Analysis', action: 'show_costs', params: {} });
    actions.push({ label: 'Generate Maintenance Report', action: 'generate_report', params: { type: 'maintenance' } });
  } else if (intent.type === 'PREDICTIVE_ANALYSIS') {
    actions.push({ label: 'View Predictions', action: 'show_predictions', params: {} });
    actions.push({ label: 'Schedule Proactive Maintenance', action: 'schedule_maintenance', params: {} });
    actions.push({ label: 'Generate Risk Report', action: 'generate_report', params: { type: 'risk' } });
  } else {
    // Default suggestions
    if (vehicleNames.length > 0) {
      actions.push({ label: `View ${vehicleNames[0]} Details`, action: 'show_vehicle', params: { vehicle: vehicleNames[0] } });
    }
    actions.push({ label: 'Generate Fleet Report', action: 'generate_report', params: { type: 'fleet' } });
    actions.push({ label: 'View Alerts', action: 'show_alerts', params: {} });
  }
  
  return actions.slice(0, 3);
}
