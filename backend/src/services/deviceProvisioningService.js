import bcrypt from 'bcrypt';
import crypto from 'crypto';
import prisma from '../utils/prisma.js';
import { telemetryObdTopic, deviceCmdTopic, devicePublishTopics } from '../mqtt/topics.js';

const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000010';

function generateDeviceUid() {
  return `dev_${crypto.randomBytes(8).toString('hex')}`;
}

export async function provisionDevice({ vehicleId, companyId, deviceType = 'MOBILE_APP', userId, ipAddress }) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, deletedAt: null },
    include: { company: true, telematicsDevice: true },
  });
  if (!vehicle) throw Object.assign(new Error('Vehicle not found'), { status: 404 });
  if (vehicle.telematicsDevice) {
    throw Object.assign(new Error('Vehicle already has a provisioned device'), { status: 409 });
  }

  const resolvedCompanyId = companyId || vehicle.companyId || DEFAULT_COMPANY_ID;
  let company = await prisma.company.findUnique({ where: { id: resolvedCompanyId } });
  if (!company) {
    company = await prisma.company.findUnique({ where: { slug: 'default' } });
  }
  if (!company) throw Object.assign(new Error('Company not found'), { status: 404 });

  const deviceUid = generateDeviceUid();
  const mqttClientId = `fleet-${deviceUid}`;
  const deviceSecret = crypto.randomBytes(24).toString('base64url');
  const deviceSecretHash = await bcrypt.hash(deviceSecret, 12);

  const device = await prisma.telematicsDevice.create({
    data: {
      companyId: company.id,
      vehicleId,
      deviceUid,
      mqttClientId,
      deviceSecretHash,
      deviceType,
      status: 'PROVISIONED',
    },
  });

  await prisma.auditLog.create({
    data: {
      companyId: company.id,
      userId,
      action: 'DEVICE_PROVISION',
      resource: `telematics_devices/${device.id}`,
      ipAddress,
      metadata: { vehicleId, deviceUid },
    },
  });

  return {
    device: {
      id: device.id,
      deviceUid,
      mqttClientId,
      status: device.status,
      vehicleId,
    },
    credentials: {
      deviceSecret,
      username: deviceUid,
      publishTopics: devicePublishTopics(company.slug, vehicleId),
      subscribeTopics: [deviceCmdTopic(company.slug, vehicleId, '#')],
    },
    mqtt: {
      tenantId: company.slug,
      companyId: company.id,
    },
  };
}

export async function listCompanyDevices(companyId) {
  return prisma.telematicsDevice.findMany({
    where: { companyId },
    include: { vehicle: { select: { id: true, plateNumber: true, make: true, model: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function validateDeviceCredentials(deviceUid, deviceSecret) {
  const device = await prisma.telematicsDevice.findUnique({
    where: { deviceUid },
    include: { company: true, vehicle: true },
  });
  if (!device || device.status === 'REVOKED') return null;

  const valid = await bcrypt.compare(deviceSecret, device.deviceSecretHash);
  if (!valid) return null;

  return device;
}

export async function touchDeviceLastSeen(deviceId) {
  await prisma.telematicsDevice.update({
    where: { id: deviceId },
    data: { lastSeenAt: new Date(), status: 'ACTIVE' },
  });
}
