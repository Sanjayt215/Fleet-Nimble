import { verifyAccessToken } from '../utils/jwt.js';
import logger from '../utils/logger.js';
import { processTelemetryAlerts, createDtcAlerts } from '../services/alertEngine.js';
import prisma from '../utils/prisma.js';
import { ingestObdReading } from '../services/obdIngest.js';

export function initSockets(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('Authentication required'));
      const decoded = verifyAccessToken(token);
      socket.userId = decoded.sub;
      socket.userRole = decoded.role;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info('Socket connected', { userId: socket.userId });

    const rejoinRooms = () => {
      socket.join(`user:${socket.userId}`);
      if (socket.data.vehicleId) {
        socket.join(`vehicle:${socket.data.vehicleId}`);
      }
    };

    socket.on('join:vehicle', (vehicleId) => {
      if (!vehicleId) return;
      socket.data.vehicleId = vehicleId;
      socket.join(`vehicle:${vehicleId}`);
      socket.join(`user:${socket.userId}`);
    });

    socket.on('join:user', () => {
      socket.join(`user:${socket.userId}`);
    });

    socket.on('ping:heartbeat', () => {
      socket.emit('pong:heartbeat', { ts: Date.now() });
    });

    socket.on('vehicle:liveData', async (payload) => {
      try {
        const { vehicleId, ...raw } = payload || {};
        if (!vehicleId) return;

        const { record, telemetry } = await ingestObdReading(vehicleId, { vehicleId, ...raw }, {
          source: 'socket',
        });

        io.to(`vehicle:${vehicleId}`).emit('live:update', record);
        io.to(`user:${socket.userId}`).emit('live:update', { vehicleId, ...record });
        await processTelemetryAlerts(vehicleId, telemetry, io);
      } catch (err) {
        logger.error('vehicle:liveData error', { err: err.message });
      }
    });

    socket.on('vehicle:alert', async (payload) => {
      try {
        const { vehicleId, alertType, message, severity } = payload || {};
        if (!vehicleId || !message) return;
        const alert = await prisma.alert.create({
          data: {
            vehicleId,
            alertType: alertType || 'MOBILE',
            message,
            severity: severity || 'MEDIUM',
          },
        });
        io.to(`vehicle:${vehicleId}`).emit('alert:new', alert);
      } catch (err) {
        logger.error('vehicle:alert error', { err: err.message });
      }
    });

    socket.on('vehicle:dtcDetected', async (payload) => {
      try {
        const { vehicleId, codes, rawResponse } = payload || {};
        if (!vehicleId) return;
        let codeList = codes;
        if (!codeList?.length && rawResponse) {
          const { parseDtcResponse } = await import('../utils/dtcDecoder.js');
          codeList = parseDtcResponse(rawResponse);
        }
        if (codeList?.length) {
          await createDtcAlerts(vehicleId, codeList, io);
          io.to(`vehicle:${vehicleId}`).emit('dtc:new', { vehicleId, codes: codeList });
        }
      } catch (err) {
        logger.error('vehicle:dtcDetected error', { err: err.message });
      }
    });

    socket.on('trip:gps', async (payload) => {
      try {
        const { tripId, vehicleId, latitude, longitude } = payload || {};
        if (latitude == null || longitude == null) return;

        let trip;
        if (tripId) {
          trip = await prisma.tripLog.findUnique({ where: { id: tripId } });
        } else if (vehicleId) {
          trip = await prisma.tripLog.findFirst({
            where: { vehicleId, endTime: null },
            orderBy: { startTime: 'desc' },
          });
        }
        if (!trip) return;

        const point = await prisma.gpsHistory.create({
          data: { tripId: trip.id, latitude, longitude },
        });
        io.to(`vehicle:${trip.vehicleId}`).emit('trip:update', {
          tripId: trip.id,
          vehicleId: trip.vehicleId,
          gps: point,
        });
      } catch (err) {
        logger.error('trip:gps error', { err: err.message });
      }
    });

    // ── AI Receptionist live call events ──
    socket.on('receptionist:join', () => {
      socket.join(`user:${socket.userId}`);
      logger.debug('RECEPTIONIST_JOINED', { userId: socket.userId });
    });

    socket.on('receptionist:endCall', (callSid) => {
      logger.info('RECEPTIONIST_END_CALL', { userId: socket.userId, callSid });
      socket.to(`user:${socket.userId}`).emit('call.ended', {
        callSid,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('receptionist:escalate', (data) => {
      logger.info('RECEPTIONIST_ESCALATE', { userId: socket.userId, ...data });
      socket.to(`user:${socket.userId}`).emit('call.escalated', {
        ...data,
        timestamp: new Date().toISOString(),
      });
    });

    rejoinRooms();

    socket.on('disconnect', () => {
      logger.debug('Socket disconnected', { userId: socket.userId });
    });
  });
}
