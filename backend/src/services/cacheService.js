import { cacheGet, cacheSet, cacheDel } from '../utils/redis.js';

const KEYS = {
  latestObd: (vehicleId) => `obd:latest:${vehicleId}`,
  vehicleList: (userId) => `vehicles:${userId}`,
};

export async function getLatestObdCached(vehicleId) {
  return cacheGet(KEYS.latestObd(vehicleId));
}

export async function setLatestObdCached(vehicleId, data) {
  return cacheSet(KEYS.latestObd(vehicleId), data, 30);
}

export async function invalidateVehicleCache(userId) {
  return cacheDel(KEYS.vehicleList(userId));
}

export { KEYS };
