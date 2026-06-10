import { processTelemetryAlerts } from './alertEngine.js';

/**
 * Fan-out live telemetry to Socket.IO rooms (shared by HTTP, Socket, MQTT ingest).
 */
export async function broadcastLiveUpdate(io, vehicleId, record, telemetry, userId) {
  if (!io) return;

  io.to(`vehicle:${vehicleId}`).emit('live:update', record);
  if (userId) {
    io.to(`user:${userId}`).emit('live:update', { vehicleId, ...record });
  }

  await processTelemetryAlerts(vehicleId, telemetry, io);
}
