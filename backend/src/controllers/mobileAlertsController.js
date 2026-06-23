import prisma from "../utils/prisma.js";
import logger from "../utils/logger.js";

export async function submitAlert(req, res) {
  try {
    const userId = req.user.id || req.userId;
    const {
      vehicleId,
      alertType,
      message,
      severity = "MEDIUM",
      metadata
    } = req.body;

    logger.info("🚨 Incoming mobile alert", {
      userId,
      vehicleId,
      alertType,
      severity,
      message
    });

    if (!vehicleId) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_VEHICLE_ID",
          message: "vehicleId is required"
        }
      });
    }

    if (!alertType) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_ALERT_TYPE",
          message: "alertType is required"
        }
      });
    }

    // Verify vehicle exists and belongs to user
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId }
    });

    if (!vehicle || vehicle.deletedAt) {
      return res.status(404).json({
        success: false,
        error: {
          code: "VEHICLE_NOT_FOUND",
          message: "Vehicle not found"
        }
      });
    }

    if (vehicle.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: "VEHICLE_NOT_AUTHORIZED",
          message: "Vehicle not authorized for this user"
        }
      });
    }

    // Map alert types to severity
    let alertSeverity = severity.toUpperCase();
    if (alertType === "LOW_BATTERY" || alertType === "DEEP_SLEEP_PROTECTION") {
      alertSeverity = "HIGH";
    } else if (alertType === "OBD_POLLING_PAUSED") {
      alertSeverity = "MEDIUM";
    }

    // Create alert
    const alert = await prisma.alert.create({
      data: {
        vehicleId,
        alertType: alertType.toUpperCase().replace(/_/g, ' '),
        message: message || `${alertType.replace(/_/g, ' ')} detected`,
        severity: alertSeverity,
        read: false
      }
    });

    logger.info("✅ Alert created", {
      alertId: alert.id,
      vehicleId,
      alertType,
      severity: alertSeverity
    });

    // Update vehicle battery protection mode if applicable
    if (alertType === "LOW_BATTERY" || alertType === "DEEP_SLEEP_PROTECTION") {
      await prisma.vehicle.update({
        where: { id: vehicleId },
        data: {
          batteryProtectionMode: alertType,
          status: "LOW_BATTERY"
        }
      });

      logger.warn("🔋 Vehicle battery protection mode activated", {
        vehicleId,
        mode: alertType
      });
    }

    // Emit Socket.IO event
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${userId}`).emit('vehicle-alert', {
        vehicleId,
        alert: {
          id: alert.id,
          alertType,
          message: alert.message,
          severity: alertSeverity,
          createdAt: alert.createdAt
        },
        metadata,
        timestamp: new Date()
      });

      logger.info("🔊 Socket.IO vehicle-alert emitted", {
        userId,
        vehicleId,
        alertType
      });
    }

    res.json({
      success: true,
      data: {
        alertId: alert.id,
        vehicleId,
        alertType,
        message: alert.message,
        severity: alertSeverity,
        createdAt: alert.createdAt
      }
    });

  } catch (err) {
    logger.error("❌ Alert submission error", {
      error: err.message,
      stack: err.stack
    });
    res.status(500).json({
      success: false,
      error: {
        code: "ALERT_SUBMISSION_FAILED",
        message: err.message
      }
    });
  }
}

export async function getVehicleAlerts(req, res) {
  try {
    const userId = req.user.id || req.userId;
    const { vehicleId } = req.params;
    const { limit = 50, unreadOnly = false } = req.query;

    // Verify vehicle belongs to user
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId }
    });

    if (!vehicle || vehicle.deletedAt) {
      return res.status(404).json({
        success: false,
        error: "Vehicle not found"
      });
    }

    if (vehicle.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: "Not authorized"
      });
    }

    const alerts = await prisma.alert.findMany({
      where: {
        vehicleId,
        ...(unreadOnly === 'true' ? { read: false } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });

    res.json({
      success: true,
      data: alerts
    });

  } catch (err) {
    logger.error("❌ Get vehicle alerts error", { error: err.message });
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

export async function markAlertRead(req, res) {
  try {
    const userId = req.user.id || req.userId;
    const { alertId } = req.params;

    const alert = await prisma.alert.findUnique({
      where: { id: alertId },
      include: { vehicle: true }
    });

    if (!alert) {
      return res.status(404).json({
        success: false,
        error: "Alert not found"
      });
    }

    if (alert.vehicle.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: "Not authorized"
      });
    }

    await prisma.alert.update({
      where: { id: alertId },
      data: { read: true }
    });

    res.json({
      success: true,
      data: { alertId, read: true }
    });

  } catch (err) {
    logger.error("❌ Mark alert read error", { error: err.message });
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
}
