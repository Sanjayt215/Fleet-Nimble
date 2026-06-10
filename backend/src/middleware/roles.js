import { AppError } from './errorHandler.js';

const ROLE_HIERARCHY = { VIEWER: 0, DRIVER: 1, MANAGER: 2, ADMIN: 3 };

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const roleName = req.user?.role?.name;
    if (!roleName) return next(new AppError('Forbidden', 403, 'FORBIDDEN'));
    if (allowedRoles.includes(roleName)) return next();
    const userLevel = ROLE_HIERARCHY[roleName] ?? 0;
    const minRequired = Math.min(...allowedRoles.map((r) => ROLE_HIERARCHY[r] ?? 99));
    if (userLevel >= minRequired) return next();
    next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'));
  };
}

export function requireAdmin(req, res, next) {
  return requireRole('ADMIN')(req, res, next);
}

export async function requireVehicleAccess(req, res, next) {
  const vehicleId = req.params.vehicleId || req.params.id || req.body.vehicleId;
  if (!vehicleId) return next(new AppError('Vehicle ID required', 400, 'VALIDATION_ERROR'));

  if (req.user.role.name === 'ADMIN') return next();

  const vehicle = await import('../utils/prisma.js').then((m) =>
    m.default.vehicle.findFirst({
      where: { id: vehicleId, userId: req.userId, deletedAt: null },
    })
  );
  if (!vehicle) return next(new AppError('Vehicle not found or access denied', 404, 'NOT_FOUND'));
  req.vehicle = vehicle;
  next();
}
