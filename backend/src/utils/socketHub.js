import logger from './logger.js';

let ioInstance = null;

export function setIo(io) {
  ioInstance = io;
  logger.info('SOCKET_HUB_INITIALIZED', { ready: !!io });
}

export function getIo() {
  return ioInstance;
}

export function emitToUser(userId, event, data) {
  if (!ioInstance || !userId) return false;
  try {
    ioInstance.to(`user:${userId}`).emit(event, data);
    return true;
  } catch (err) {
    logger.warn('SOCKET_EMIT_FAILED', { event, userId, error: err.message });
    return false;
  }
}

export function emitToRoom(room, event, data) {
  if (!ioInstance || !room) return false;
  try {
    ioInstance.to(room).emit(event, data);
    return true;
  } catch (err) {
    logger.warn('SOCKET_EMIT_FAILED', { event, room, error: err.message });
    return false;
  }
}

export function emitGlobal(event, data) {
  if (!ioInstance) return false;
  try {
    ioInstance.emit(event, data);
    return true;
  } catch (err) {
    logger.warn('SOCKET_EMIT_FAILED', { event, error: err.message });
    return false;
  }
}

export const ADMIN_ROOM = 'receptionist:admin';

export function emitToAdminRoom(event, data) {
  if (!ioInstance) return false;
  try {
    ioInstance.to(ADMIN_ROOM).emit(event, data);
    return true;
  } catch (err) {
    logger.warn('SOCKET_EMIT_FAILED', { event, room: ADMIN_ROOM, error: err.message });
    return false;
  }
}
