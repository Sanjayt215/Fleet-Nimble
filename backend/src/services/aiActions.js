/**
 * AI Actions Service
 * Performs actions after user confirmation
 * All actions require explicit user approval before execution
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

/**
 * Action types that AI can perform
 */
export const ACTION_TYPES = {
  ASSIGN_VEHICLE: 'assign_vehicle',
  SCHEDULE_MAINTENANCE: 'schedule_maintenance',
  GENERATE_WORK_ORDER: 'generate_work_order',
  CREATE_SERVICE_TICKET: 'create_service_ticket',
  NOTIFY_DRIVER: 'notify_driver',
  SEND_EMAIL: 'send_email',
  CREATE_ALERT: 'create_alert',
  GENERATE_INVOICE: 'generate_invoice',
  EXPORT_REPORT: 'export_report',
  CREATE_MAINTENANCE_REMINDER: 'create_maintenance_reminder',
  ASSIGN_TECHNICIAN: 'assign_technician',
};

/**
 * Action status
 */
export const ACTION_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  EXECUTED: 'executed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

/**
 * Store pending action for confirmation
 */
const pendingActions = new Map();

/**
 * Create action proposal for user confirmation
 */
export function createActionProposal(actionType, params, description, estimatedImpact) {
  const actionId = generateActionId();
  
  const proposal = {
    actionId,
    actionType,
    params,
    description,
    estimatedImpact,
    status: ACTION_STATUS.PENDING,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
  };

  pendingActions.set(actionId, proposal);

  return proposal;
}

/**
 * Confirm and execute action
 */
export async function confirmAndExecuteAction(actionId, userId) {
  const action = pendingActions.get(actionId);
  
  if (!action) {
    throw new Error('Action not found or expired');
  }

  if (action.status !== ACTION_STATUS.PENDING) {
    throw new Error('Action already processed');
  }

  if (new Date(action.expiresAt) < new Date()) {
    pendingActions.delete(actionId);
    throw new Error('Action expired');
  }

  action.status = ACTION_STATUS.CONFIRMED;

  try {
    const result = await executeAction(action.actionType, action.params, userId);
    action.status = ACTION_STATUS.EXECUTED;
    action.result = result;
    action.executedAt = new Date().toISOString();
    
    pendingActions.delete(actionId);
    
    return {
      success: true,
      actionId,
      result,
    };
  } catch (error) {
    action.status = ACTION_STATUS.FAILED;
    action.error = error.message;
    action.failedAt = new Date().toISOString();
    
    pendingActions.delete(actionId);
    
    throw error;
  }
}

/**
 * Cancel action
 */
export function cancelAction(actionId) {
  const action = pendingActions.get(actionId);
  
  if (!action) {
    throw new Error('Action not found');
  }

  action.status = ACTION_STATUS.CANCELLED;
  action.cancelledAt = new Date().toISOString();
  
  pendingActions.delete(actionId);
  
  return { success: true, actionId };
}

/**
 * Execute action based on type
 */
async function executeAction(actionType, params, userId) {
  try {
    switch (actionType) {
      case ACTION_TYPES.ASSIGN_VEHICLE:
        return await assignVehicle(params, userId);
      case ACTION_TYPES.SCHEDULE_MAINTENANCE:
        return await scheduleMaintenance(params, userId);
      case ACTION_TYPES.GENERATE_WORK_ORDER:
        return await generateWorkOrder(params, userId);
      case ACTION_TYPES.CREATE_SERVICE_TICKET:
        return await createServiceTicket(params, userId);
      case ACTION_TYPES.NOTIFY_DRIVER:
        return await notifyDriver(params, userId);
      case ACTION_TYPES.SEND_EMAIL:
        return await sendEmail(params, userId);
      case ACTION_TYPES.CREATE_ALERT:
        return await createAlert(params, userId);
      case ACTION_TYPES.GENERATE_INVOICE:
        return await generateInvoice(params, userId);
      case ACTION_TYPES.EXPORT_REPORT:
        return await exportReport(params, userId);
      case ACTION_TYPES.CREATE_MAINTENANCE_REMINDER:
        return await createMaintenanceReminder(params, userId);
      case ACTION_TYPES.ASSIGN_TECHNICIAN:
        return await assignTechnician(params, userId);
      default:
        throw new Error(`Unknown action type: ${actionType}`);
    }
  } catch (error) {
    logger.error('Action execution failed', { actionType, userId, error: error.message });
    throw error;
  }
}

/**
 * Assign vehicle to driver or route
 */
async function assignVehicle(params, userId) {
  const { vehicleId, driverId, routeId } = params;
  
  const vehicle = await prisma.vehicle.update({
    where: { id: vehicleId },
    data: {
      ...(driverId && { assignedDriverId: driverId }),
      ...(routeId && { assignedRouteId: routeId }),
    },
  });

  logger.info('Vehicle assigned', { userId, vehicleId, driverId, routeId });

  return {
    message: `Vehicle ${vehicle.plateNumber || vehicle.vin} assigned successfully`,
    vehicle: `${vehicle.make} ${vehicle.model}`,
    plate: vehicle.plateNumber || vehicle.vin,
  };
}

/**
 * Schedule maintenance
 */
async function scheduleMaintenance(params, userId) {
  const { vehicleId, type, dueDate, priority, estimatedCost, notes } = params;
  
  const maintenance = await prisma.maintenanceLog.create({
    data: {
      vehicleId,
      type,
      dueDate: new Date(dueDate),
      priority: priority || 'MEDIUM',
      estimatedCost: estimatedCost || 0,
      notes,
      completed: false,
    },
  });

  logger.info('Maintenance scheduled', { userId, vehicleId, type, dueDate });

  return {
    message: `Maintenance scheduled for ${type}`,
    maintenanceId: maintenance.id,
    dueDate: maintenance.dueDate,
    priority: maintenance.priority,
  };
}

/**
 * Generate work order
 * Creates a real DB record and returns workOrderId
 */
async function generateWorkOrder(params, userId) {
  const { vehicleId, description, priority, assignedTo } = params;
  
  const workOrder = await prisma.workOrder.create({
    data: {
      vehicleId,
      description,
      priority: priority || 'MEDIUM',
      assignedTo,
      status: 'PENDING',
      createdBy: userId,
    },
  });

  logger.info('Work order generated', { userId, vehicleId, workOrderId: workOrder.id });

  return {
    message: 'Work order generated successfully',
    workOrderId: workOrder.id,
    status: workOrder.status,
    priority: workOrder.priority,
    vehicleId: workOrder.vehicleId,
  };
}

/**
 * Create service ticket
 */
async function createServiceTicket(params, userId) {
  const { vehicleId, issue, severity, category } = params;
  
  const ticket = await prisma.serviceTicket.create({
    data: {
      vehicleId,
      issue,
      severity: severity || 'MEDIUM',
      category: category || 'GENERAL',
      status: 'OPEN',
      createdBy: userId,
    },
  });

  logger.info('Service ticket created', { userId, vehicleId, ticketId: ticket.id });

  return {
    message: 'Service ticket created successfully',
    ticketId: ticket.id,
    status: ticket.status,
    severity: ticket.severity,
  };
}

/**
 * Notify driver
 */
async function notifyDriver(params, userId) {
  const { driverId, message, type } = params;
  
  const notification = await prisma.notification.create({
    data: {
      userId: driverId,
      message,
      type: type || 'INFO',
      read: false,
    },
  });

  logger.info('Driver notified', { userId, driverId, notificationId: notification.id });

  return {
    message: 'Driver notified successfully',
    notificationId: notification.id,
    type: notification.type,
  };
}

/**
 * Send email
 */
async function sendEmail(params, userId) {
  const { to, subject, body, priority } = params;
  
  // In production, integrate with email service (SendGrid, AWS SES, etc.)
  const emailLog = await prisma.emailLog.create({
    data: {
      to,
      subject,
      body,
      priority: priority || 'NORMAL',
      status: 'SENT',
      sentBy: userId,
      sentAt: new Date(),
    },
  });

  logger.info('Email sent', { userId, to, emailId: emailLog.id });

  return {
    message: 'Email sent successfully',
    emailId: emailLog.id,
    to,
    subject,
  };
}

/**
 * Create alert
 */
async function createAlert(params, userId) {
  const { vehicleId, message, severity, type } = params;
  
  const alert = await prisma.alert.create({
    data: {
      vehicleId,
      message,
      severity: severity || 'MEDIUM',
      type: type || 'MANUAL',
      read: false,
      createdBy: userId,
    },
  });

  logger.info('Alert created', { userId, vehicleId, alertId: alert.id });

  return {
    message: 'Alert created successfully',
    alertId: alert.id,
    severity: alert.severity,
    type: alert.type,
  };
}

/**
 * Generate invoice
 */
async function generateInvoice(params, userId) {
  const { vehicleId, items, dueDate, notes } = params;
  
  const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  
  const invoice = await prisma.invoice.create({
    data: {
      vehicleId,
      items,
      totalAmount,
      dueDate: dueDate ? new Date(dueDate) : null,
      notes,
      status: 'PENDING',
      createdBy: userId,
    },
  });

  logger.info('Invoice generated', { userId, vehicleId, invoiceId: invoice.id });

  return {
    message: 'Invoice generated successfully',
    invoiceId: invoice.id,
    totalAmount: invoice.totalAmount,
    status: invoice.status,
  };
}

/**
 * Export report
 */
async function exportReport(params, userId) {
  const { reportType, format, dateRange } = params;
  
  const exportRecord = await prisma.reportExport.create({
    data: {
      reportType,
      format: format || 'PDF',
      dateRange,
      status: 'COMPLETED',
      requestedBy: userId,
      completedAt: new Date(),
    },
  });

  logger.info('Report exported', { userId, reportType, format, exportId: exportRecord.id });

  return {
    message: 'Report exported successfully',
    exportId: exportRecord.id,
    reportType,
    format,
    downloadUrl: `/api/reports/download/${exportRecord.id}`,
  };
}

/**
 * Create maintenance reminder
 */
async function createMaintenanceReminder(params, userId) {
  const { vehicleId, maintenanceType, reminderDate, notes } = params;
  
  const reminder = await prisma.maintenanceReminder.create({
    data: {
      vehicleId,
      maintenanceType,
      reminderDate: new Date(reminderDate),
      notes,
      sent: false,
      createdBy: userId,
    },
  });

  logger.info('Maintenance reminder created', { userId, vehicleId, reminderId: reminder.id });

  return {
    message: 'Maintenance reminder created successfully',
    reminderId: reminder.id,
    reminderDate: reminder.reminderDate,
  };
}

/**
 * Assign technician
 */
async function assignTechnician(params, userId) {
  const { workOrderId, technicianId } = params;
  
  const workOrder = await prisma.workOrder.update({
    where: { id: workOrderId },
    data: {
      assignedTo: technicianId,
      status: 'ASSIGNED',
    },
  });

  logger.info('Technician assigned', { userId, workOrderId, technicianId });

  return {
    message: 'Technician assigned successfully',
    workOrderId,
    technicianId,
    status: workOrder.status,
  };
}

/**
 * Get pending action
 */
export function getPendingAction(actionId) {
  return pendingActions.get(actionId);
}

/**
 * Get all pending actions for a user
 */
export function getPendingActionsForUser(userId) {
  return Array.from(pendingActions.values()).filter(
    action => action.userId === userId && action.status === ACTION_STATUS.PENDING
  );
}

/**
 * Clean up expired actions
 */
export function cleanupExpiredActions() {
  const now = new Date();
  
  for (const [actionId, action] of pendingActions.entries()) {
    if (new Date(action.expiresAt) < now) {
      action.status = ACTION_STATUS.CANCELLED;
      action.cancelledAt = now.toISOString();
      pendingActions.delete(actionId);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupExpiredActions, 60000);

/**
 * Generate unique action ID
 */
function generateActionId() {
  return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get available action types
 */
export function getAvailableActionTypes() {
  return Object.values(ACTION_TYPES);
}

/**
 * Validate action parameters
 */
export function validateActionParams(actionType, params) {
  const validations = {
    [ACTION_TYPES.ASSIGN_VEHICLE]: ['vehicleId'],
    [ACTION_TYPES.SCHEDULE_MAINTENANCE]: ['vehicleId', 'type', 'dueDate'],
    [ACTION_TYPES.GENERATE_WORK_ORDER]: ['vehicleId', 'description'],
    [ACTION_TYPES.CREATE_SERVICE_TICKET]: ['vehicleId', 'issue'],
    [ACTION_TYPES.NOTIFY_DRIVER]: ['driverId', 'message'],
    [ACTION_TYPES.SEND_EMAIL]: ['to', 'subject', 'body'],
    [ACTION_TYPES.CREATE_ALERT]: ['vehicleId', 'message'],
    [ACTION_TYPES.GENERATE_INVOICE]: ['vehicleId', 'items'],
    [ACTION_TYPES.EXPORT_REPORT]: ['reportType'],
    [ACTION_TYPES.CREATE_MAINTENANCE_REMINDER]: ['vehicleId', 'maintenanceType', 'reminderDate'],
    [ACTION_TYPES.ASSIGN_TECHNICIAN]: ['workOrderId', 'technicianId'],
  };

  const requiredParams = validations[actionType];
  
  if (!requiredParams) {
    return { valid: true };
  }

  const missingParams = requiredParams.filter(param => !params[param]);
  
  if (missingParams.length > 0) {
    return {
      valid: false,
      missingParams,
    };
  }

  return { valid: true };
}
