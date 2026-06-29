/**
 * AI Role-Based Permissions Service
 * Defines and enforces permissions for different user roles
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

/**
 * Role definitions with permissions
 */
export const ROLE_PERMISSIONS = {
  ADMIN: {
    canViewAllVehicles: true,
    canEditAllVehicles: true,
    canDeleteVehicles: true,
    canAssignVehicles: true,
    canScheduleMaintenance: true,
    canCancelMaintenance: true,
    canGenerateWorkOrders: true,
    canCreateServiceTickets: true,
    canResolveServiceTickets: true,
    canNotifyDrivers: true,
    canSendEmails: true,
    canCreateAlerts: true,
    canGenerateInvoices: true,
    canExportReports: true,
    canViewAllUsers: true,
    canManageUsers: true,
    canViewAllMaintenance: true,
    canViewAllAlerts: true,
    canAccessAIActions: true,
    canAccessVoiceAPI: true,
    canViewAnalytics: true,
    canManageSettings: true,
  },
  MANAGER: {
    canViewAllVehicles: true,
    canEditAllVehicles: true,
    canDeleteVehicles: false,
    canAssignVehicles: true,
    canScheduleMaintenance: true,
    canCancelMaintenance: true,
    canGenerateWorkOrders: true,
    canCreateServiceTickets: true,
    canResolveServiceTickets: true,
    canNotifyDrivers: true,
    canSendEmails: true,
    canCreateAlerts: true,
    canGenerateInvoices: true,
    canExportReports: true,
    canViewAllUsers: false,
    canManageUsers: false,
    canViewAllMaintenance: true,
    canViewAllAlerts: true,
    canAccessAIActions: true,
    canAccessVoiceAPI: true,
    canViewAnalytics: true,
    canManageSettings: false,
  },
  TECHNICIAN: {
    canViewAllVehicles: false,
    canEditAllVehicles: false,
    canDeleteVehicles: false,
    canAssignVehicles: false,
    canScheduleMaintenance: false,
    canCancelMaintenance: false,
    canGenerateWorkOrders: true,
    canCreateServiceTickets: true,
    canResolveServiceTickets: true,
    canNotifyDrivers: false,
    canSendEmails: false,
    canCreateAlerts: false,
    canGenerateInvoices: false,
    canExportReports: false,
    canViewAllUsers: false,
    canManageUsers: false,
    canViewAllMaintenance: true,
    canViewAllAlerts: true,
    canAccessAIActions: true,
    canAccessVoiceAPI: true,
    canViewAnalytics: false,
    canManageSettings: false,
  },
  DRIVER: {
    canViewAllVehicles: false,
    canEditAllVehicles: false,
    canDeleteVehicles: false,
    canAssignVehicles: false,
    canScheduleMaintenance: false,
    canCancelMaintenance: false,
    canGenerateWorkOrders: false,
    canCreateServiceTickets: true,
    canResolveServiceTickets: false,
    canNotifyDrivers: false,
    canSendEmails: false,
    canCreateAlerts: false,
    canGenerateInvoices: false,
    canExportReports: false,
    canViewAllUsers: false,
    canManageUsers: false,
    canViewAllMaintenance: false,
    canViewAllAlerts: false,
    canAccessAIActions: false,
    canAccessVoiceAPI: true,
    canViewAnalytics: false,
    canManageSettings: false,
  },
  VIEWER: {
    canViewAllVehicles: true,
    canEditAllVehicles: false,
    canDeleteVehicles: false,
    canAssignVehicles: false,
    canScheduleMaintenance: false,
    canCancelMaintenance: false,
    canGenerateWorkOrders: false,
    canCreateServiceTickets: false,
    canResolveServiceTickets: false,
    canNotifyDrivers: false,
    canSendEmails: false,
    canCreateAlerts: false,
    canGenerateInvoices: false,
    canExportReports: true,
    canViewAllUsers: false,
    canManageUsers: false,
    canViewAllMaintenance: true,
    canViewAllAlerts: true,
    canAccessAIActions: false,
    canAccessVoiceAPI: true,
    canViewAnalytics: true,
    canManageSettings: false,
  },
};

/**
 * Get user role
 */
export async function getUserRole(userId) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return user.role.name;
  } catch (error) {
    logger.error('Error getting user role', { userId, error: error.message });
    throw error;
  }
}

/**
 * Check if user has permission
 */
export async function hasPermission(userId, permission) {
  try {
    const roleName = await getUserRole(userId);
    const permissions = ROLE_PERMISSIONS[roleName] || ROLE_PERMISSIONS.VIEWER;
    
    return permissions[permission] || false;
  } catch (error) {
    logger.error('Error checking permission', { userId, permission, error: error.message });
    return false;
  }
}

/**
 * Check if user has any of the specified permissions
 */
export async function hasAnyPermission(userId, permissions) {
  try {
    const roleName = await getUserRole(userId);
    const rolePermissions = ROLE_PERMISSIONS[roleName] || ROLE_PERMISSIONS.VIEWER;
    
    return permissions.some(permission => rolePermissions[permission] || false);
  } catch (error) {
    logger.error('Error checking any permission', { userId, permissions, error: error.message });
    return false;
  }
}

/**
 * Check if user has all specified permissions
 */
export async function hasAllPermissions(userId, permissions) {
  try {
    const roleName = await getUserRole(userId);
    const rolePermissions = ROLE_PERMISSIONS[roleName] || ROLE_PERMISSIONS.VIEWER;
    
    return permissions.every(permission => rolePermissions[permission] || false);
  } catch (error) {
    logger.error('Error checking all permissions', { userId, permissions, error: error.message });
    return false;
  }
}

/**
 * Get user permissions object
 */
export async function getUserPermissions(userId) {
  try {
    const roleName = await getUserRole(userId);
    return ROLE_PERMISSIONS[roleName] || ROLE_PERMISSIONS.VIEWER;
  } catch (error) {
    logger.error('Error getting user permissions', { userId, error: error.message });
    return ROLE_PERMISSIONS.VIEWER;
  }
}

/**
 * Filter vehicles based on user role
 */
export async function filterVehiclesByRole(userId, vehicles) {
  try {
    const canViewAll = await hasPermission(userId, 'canViewAllVehicles');
    
    if (canViewAll) {
      return vehicles;
    }

    // For drivers, only show assigned vehicles
    const roleName = await getUserRole(userId);
    if (roleName === 'DRIVER') {
      return vehicles.filter(v => v.assignedDriverId === userId);
    }

    // For technicians, show vehicles with assigned work orders
    if (roleName === 'TECHNICIAN') {
      const workOrders = await prisma.workOrder.findMany({
        where: { assignedTo: userId },
        select: { vehicleId: true },
      });
      const vehicleIds = workOrders.map(wo => wo.vehicleId);
      return vehicles.filter(v => vehicleIds.includes(v.id));
    }

    // Default: return empty array for restricted roles
    return [];
  } catch (error) {
    logger.error('Error filtering vehicles by role', { userId, error: error.message });
    return [];
  }
}

/**
 * Filter maintenance logs based on user role
 */
export async function filterMaintenanceByRole(userId, maintenanceLogs) {
  try {
    const canViewAll = await hasPermission(userId, 'canViewAllMaintenance');
    
    if (canViewAll) {
      return maintenanceLogs;
    }

    // For drivers, only show maintenance for their assigned vehicles
    const roleName = await getUserRole(userId);
    if (roleName === 'DRIVER') {
      const userVehicles = await prisma.vehicle.findMany({
        where: { assignedDriverId: userId },
        select: { id: true },
      });
      const vehicleIds = userVehicles.map(v => v.id);
      return maintenanceLogs.filter(m => vehicleIds.includes(m.vehicleId));
    }

    // Default: return empty array for restricted roles
    return [];
  } catch (error) {
    logger.error('Error filtering maintenance by role', { userId, error: error.message });
    return [];
  }
}

/**
 * Filter alerts based on user role
 */
export async function filterAlertsByRole(userId, alerts) {
  try {
    const canViewAll = await hasPermission(userId, 'canViewAllAlerts');
    
    if (canViewAll) {
      return alerts;
    }

    // For drivers, only show alerts for their assigned vehicles
    const roleName = await getUserRole(userId);
    if (roleName === 'DRIVER') {
      const userVehicles = await prisma.vehicle.findMany({
        where: { assignedDriverId: userId },
        select: { id: true },
      });
      const vehicleIds = userVehicles.map(v => v.id);
      return alerts.filter(a => vehicleIds.includes(a.vehicleId));
    }

    // Default: return empty array for restricted roles
    return [];
  } catch (error) {
    logger.error('Error filtering alerts by role', { userId, error: error.message });
    return [];
  }
}

/**
 * Check if user can perform AI action
 */
export async function canPerformAIAction(userId, actionType) {
  try {
    const canAccessAIActions = await hasPermission(userId, 'canAccessAIActions');
    
    if (!canAccessAIActions) {
      return { allowed: false, reason: 'User does not have permission to perform AI actions' };
    }

    // Additional role-specific action checks
    const roleName = await getUserRole(userId);
    
    const actionRoleRestrictions = {
      assign_vehicle: ['ADMIN', 'MANAGER'],
      schedule_maintenance: ['ADMIN', 'MANAGER'],
      generate_work_order: ['ADMIN', 'MANAGER', 'TECHNICIAN'],
      create_service_ticket: ['ADMIN', 'MANAGER', 'TECHNICIAN', 'DRIVER'],
      notify_driver: ['ADMIN', 'MANAGER'],
      send_email: ['ADMIN', 'MANAGER'],
      create_alert: ['ADMIN', 'MANAGER'],
      generate_invoice: ['ADMIN', 'MANAGER'],
      export_report: ['ADMIN', 'MANAGER', 'VIEWER'],
      create_maintenance_reminder: ['ADMIN', 'MANAGER'],
      assign_technician: ['ADMIN', 'MANAGER'],
    };

    const allowedRoles = actionRoleRestrictions[actionType] || [];
    
    if (allowedRoles.length > 0 && !allowedRoles.includes(roleName)) {
      return { 
        allowed: false, 
        reason: `Action ${actionType} requires one of these roles: ${allowedRoles.join(', ')}` 
      };
    }

    return { allowed: true };
  } catch (error) {
    logger.error('Error checking AI action permission', { userId, actionType, error: error.message });
    return { allowed: false, reason: 'Error checking permissions' };
  }
}

/**
 * Check if user can access voice API
 */
export async function canAccessVoiceAPI(userId) {
  try {
    return await hasPermission(userId, 'canAccessVoiceAPI');
  } catch (error) {
    logger.error('Error checking voice API access', { userId, error: error.message });
    return false;
  }
}

/**
 * Check if user can view analytics
 */
export async function canViewAnalytics(userId) {
  try {
    return await hasPermission(userId, 'canViewAnalytics');
  } catch (error) {
    logger.error('Error checking analytics access', { userId, error: error.message });
    return false;
  }
}

/**
 * Get role hierarchy level (higher = more permissions)
 */
function getRoleLevel(roleName) {
  const levels = {
    ADMIN: 5,
    MANAGER: 4,
    TECHNICIAN: 3,
    VIEWER: 2,
    DRIVER: 1,
  };
  return levels[roleName] || 0;
}

/**
 * Check if user has higher or equal role than target role
 */
export async function hasRoleLevelOrHigher(userId, targetRoleName) {
  try {
    const userRoleName = await getUserRole(userId);
    const userLevel = getRoleLevel(userRoleName);
    const targetLevel = getRoleLevel(targetRoleName);
    
    return userLevel >= targetLevel;
  } catch (error) {
    logger.error('Error checking role level', { userId, targetRoleName, error: error.message });
    return false;
  }
}

/**
 * Middleware to check permission
 */
export function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      const userId = req.userId;
      const hasPerm = await hasPermission(userId, permission);
      
      if (!hasPerm) {
        return res.status(403).json({
          success: false,
          message: `Permission denied: ${permission} required`,
        });
      }
      
      next();
    } catch (error) {
      logger.error('Permission middleware error', { error: error.message });
      res.status(500).json({
        success: false,
        message: 'Error checking permissions',
      });
    }
  };
}

/**
 * Middleware to check any of multiple permissions
 */
export function requireAnyPermission(permissions) {
  return async (req, res, next) => {
    try {
      const userId = req.userId;
      const hasPerm = await hasAnyPermission(userId, permissions);
      
      if (!hasPerm) {
        return res.status(403).json({
          success: false,
          message: `Permission denied: one of ${permissions.join(', ')} required`,
        });
      }
      
      next();
    } catch (error) {
      logger.error('Permission middleware error', { error: error.message });
      res.status(500).json({
        success: false,
        message: 'Error checking permissions',
      });
    }
  };
}
