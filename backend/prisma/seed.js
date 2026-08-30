import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Seeded fleet: 25 vehicles (Cars:10, Vans:5, Trucks:5, Buses:3, Utility:2)
const FLEET = [
  { id: '00000000-0000-0000-0000-000000000101', category: 'CAR', make: 'Toyota',  model: 'Corolla', year: 2022, plate: 'FL-001', vin: 'VIN-FL-001', odometer: 45230 },
  { id: '00000000-0000-0000-0000-000000000102', category: 'CAR', make: 'Honda',   model: 'Civic',   year: 2021, plate: 'FL-002', vin: 'VIN-FL-002', odometer: 62100 },
  { id: '00000000-0000-0000-0000-000000000103', category: 'CAR', make: 'Hyundai', model: 'i20',     year: 2023, plate: 'FL-003', vin: 'VIN-FL-003', odometer: 18900 },
  { id: '00000000-0000-0000-0000-000000000104', category: 'CAR', make: 'Kia',     model: 'Seltos',  year: 2022, plate: 'FL-004', vin: 'VIN-FL-004', odometer: 51200 },
  { id: '00000000-0000-0000-0000-000000000105', category: 'CAR', make: 'Suzuki',  model: 'Swift',   year: 2023, plate: 'FL-005', vin: 'VIN-FL-005', odometer: 12300 },
  { id: '00000000-0000-0000-0000-000000000106', category: 'CAR', make: 'Renault', model: 'Kwid',    year: 2021, plate: 'FL-006', vin: 'VIN-FL-006', odometer: 73600 },
  { id: '00000000-0000-0000-0000-000000000107', category: 'CAR', make: 'Nissan',  model: 'Kicks',   year: 2020, plate: 'FL-007', vin: 'VIN-FL-007', odometer: 103400 },
  { id: '00000000-0000-0000-0000-000000000108', category: 'CAR', make: 'Toyota',  model: 'Camry',   year: 2022, plate: 'FL-008', vin: 'VIN-FL-008', odometer: 55600 },
  { id: '00000000-0000-0000-0000-000000000109', category: 'CAR', make: 'Honda',   model: 'Amaze',   year: 2022, plate: 'FL-009', vin: 'VIN-FL-009', odometer: 31200 },
  { id: '00000000-0000-0000-0000-000000000110', category: 'CAR', make: 'Mazda',   model: '3',       year: 2023, plate: 'FL-010', vin: 'VIN-FL-010', odometer: 22400 },

  { id: '00000000-0000-0000-0000-000000000111', category: 'VAN', make: 'Toyota', model: 'Hiace',   year: 2019, plate: 'FL-011', vin: 'VIN-FL-011', odometer: 87300 },
  { id: '00000000-0000-0000-0000-000000000112', category: 'VAN', make: 'Ford',   model: 'Transit', year: 2020, plate: 'FL-012', vin: 'VIN-FL-012', odometer: 67800 },
  { id: '00000000-0000-0000-0000-000000000113', category: 'VAN', make: 'Nissan', model: 'NV200',   year: 2021, plate: 'FL-013', vin: 'VIN-FL-013', odometer: 29100 },
  { id: '00000000-0000-0000-0000-000000000114', category: 'VAN', make: 'Renault',model: 'Trafic',  year: 2022, plate: 'FL-014', vin: 'VIN-FL-014', odometer: 41700 },
  { id: '00000000-0000-0000-0000-000000000115', category: 'VAN', make: 'Mercedes',model: 'Vito',   year: 2022, plate: 'FL-015', vin: 'VIN-FL-015', odometer: 15600 },

  { id: '00000000-0000-0000-0000-000000000116', category: 'TRUCK', make: 'Volvo', model: 'FH',      year: 2018, plate: 'FL-016', vin: 'VIN-FL-016', odometer: 200000 },
  { id: '00000000-0000-0000-0000-000000000117', category: 'TRUCK', make: 'Scania',model: 'P-Series',year: 2019, plate: 'FL-017', vin: 'VIN-FL-017', odometer: 180000 },
  { id: '00000000-0000-0000-0000-000000000118', category: 'TRUCK', make: 'MAN',    model: 'TGS',     year: 2020, plate: 'FL-018', vin: 'VIN-FL-018', odometer: 150000 },
  { id: '00000000-0000-0000-0000-000000000119', category: 'TRUCK', make: 'Isuzu',  model: 'NQR',     year: 2021, plate: 'FL-019', vin: 'VIN-FL-019', odometer: 120000 },
  { id: '00000000-0000-0000-0000-000000000120', category: 'TRUCK', make: 'Toyota', model: 'Dyna',    year: 2022, plate: 'FL-020', vin: 'VIN-FL-020', odometer: 98000 },

  { id: '00000000-0000-0000-0000-000000000121', category: 'BUS', make: 'Toyota', model: 'Coaster', year: 2015, plate: 'FL-021', vin: 'VIN-FL-021', odometer: 300000 },
  { id: '00000000-0000-0000-0000-000000000122', category: 'BUS', make: 'Mercedes',model: 'Sprinter',year: 2016, plate: 'FL-022', vin: 'VIN-FL-022', odometer: 250000 },
  { id: '00000000-0000-0000-0000-000000000123', category: 'BUS', make: 'Ashok',   model: 'Leyland', year: 2014, plate: 'FL-023', vin: 'VIN-FL-023', odometer: 400000 },

  { id: '00000000-0000-0000-0000-000000000124', category: 'UTILITY', make: 'Mahindra', model: 'Jeeto', year: 2020, plate: 'FL-024', vin: 'VIN-FL-024', odometer: 60000 },
  { id: '00000000-0000-0000-0000-000000000125', category: 'UTILITY', make: 'Tata',     model: 'Ace',   year: 2019, plate: 'FL-025', vin: 'VIN-FL-025', odometer: 85000 },
];

const DEFAULT_LAT = 9.9252;
const DEFAULT_LNG = 78.1198;

function rand(min, max, dec = 1) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(dec));
}

async function main() {
  // Roles
  for (const name of ['ADMIN', 'MANAGER', 'DRIVER', 'VIEWER']) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  // Company
  const company = await prisma.company.upsert({
    where: { slug: 'default' },
    update: {},
    create: { id: '00000000-0000-0000-0000-000000000010', name: 'FleetNimble Default', slug: 'default' },
  });

  const adminRole = await prisma.role.findUnique({ where: { name: 'ADMIN' } });
  const ADMIN_PASSWORD = 'Admin123!';
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  // Check if admin exists with valid password hash
  const existingAdmin = await prisma.user.findUnique({ where: { email: 'admin@fleetnimble.com' } });
  const hasValidHash = existingAdmin?.passwordHash && 
    (existingAdmin.passwordHash.startsWith('$2a$') || existingAdmin.passwordHash.startsWith('$2b$'));

  let admin;
  if (!existingAdmin) {
    // Create admin if doesn't exist
    admin = await prisma.user.create({
      data: {
        name: 'FleetNimble Admin',
        email: 'admin@fleetnimble.com',
        passwordHash: hash,
        roleId: adminRole.id,
        companyId: company.id,
      },
    });
    console.log('Created admin user');
  } else if (!hasValidHash) {
    // Update password hash only if invalid (corrupted or missing)
    admin = await prisma.user.update({
      where: { email: 'admin@fleetnimble.com' },
      data: { 
        passwordHash: hash,
        companyId: company.id,
        deletedAt: null,
      },
    });
    console.log('Updated admin password hash (was invalid)');
  } else {
    // User exists with valid hash - only update companyId if needed
    admin = await prisma.user.update({
      where: { email: 'admin@fleetnimble.com' },
      data: { companyId: company.id },
    });
    console.log('Admin user already exists with valid password hash');
  }

  // Create organization membership for multi-tenant architecture
  const existingMembership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: company.id,
        userId: admin.id
      }
    }
  });

  if (!existingMembership) {
    await prisma.organizationMember.create({
      data: {
        organizationId: company.id,
        userId: admin.id,
        role: 'OWNER',
        status: 'ACTIVE'
      }
    });
    console.log('Created organization membership for admin');
  } else {
    console.log('Organization membership already exists');
  }

  console.log('Seeding 25 vehicles with digital twins...');

  for (const spec of FLEET) {
    // Upsert vehicle (idempotent by plate)
    let vehicle = await prisma.vehicle.findFirst({ where: { plateNumber: spec.plate } });
    if (!vehicle) {
      vehicle = await prisma.vehicle.create({
        data: {
          id: spec.id,
          userId: admin.id,
          companyId: company.id,
          vin: spec.vin,
          plateNumber: spec.plate,
          make: spec.make,
          model: spec.model,
          year: spec.year,
          odometer: spec.odometer,
        },
      });
    }

    // Digital twin — upsert
    const engineHours = rand(500, 5000, 1);
    await prisma.vehicleLiveState.upsert({
      where: { vehicleId: vehicle.id },
      update: {},
      create: {
        vehicleId: vehicle.id,
        telemetrySource: 'SIMULATED',
        rpm: 0,
        speed: 0,
        coolantTemp: rand(28, 35, 1),
        batteryVoltage: rand(12.4, 12.6, 2),
        fuelLevel: rand(55, 95, 1),
        engineLoad: 0,
        maf: 0,
        throttlePosition: 0,
        intakeTemp: rand(28, 35, 1),
        engineHours,
        odometer: spec.odometer,
        gpsLat: DEFAULT_LAT + rand(-0.08, 0.08, 5),
        gpsLng: DEFAULT_LNG + rand(-0.08, 0.08, 5),
        ignitionStatus: false,
        vehicleStatus: 'PARKED',
      },
    });

    // Default fuel log
    await prisma.fuelLog.upsert({
      where: { id: `seed-fuel-${vehicle.id}`.slice(0, 36) },
      update: {},
      create: {
        id: `seed-fuel-${vehicle.id}`.slice(0, 36),
        vehicleId: vehicle.id,
        liters: rand(30, 55, 1),
        cost: rand(3000, 6000, 0),
        mileage: spec.odometer,
      },
    }).catch(() => {}); // id collision on re-seed is fine

    // Default maintenance
    const existing = await prisma.maintenanceLog.findFirst({ where: { vehicleId: vehicle.id, serviceType: 'Oil Change' } });
    if (!existing) {
      await prisma.maintenanceLog.createMany({
        data: [
          { vehicleId: vehicle.id, serviceType: 'Oil Change', dueKm: spec.odometer + rand(3000, 7000, 0), dueDate: new Date(Date.now() + rand(20, 120, 0) * 86400000) },
          { vehicleId: vehicle.id, serviceType: 'Tire Rotation', dueDate: new Date(Date.now() + rand(10, 60, 0) * 86400000) },
          { vehicleId: vehicle.id, serviceType: 'Air Filter', dueKm: spec.odometer + rand(8000, 15000, 0) },
        ],
        skipDuplicates: true,
      });
    }

    process.stdout.write(`  ✓ ${spec.make} ${spec.model} (${spec.plate})\n`);
  }

  console.log('\nSeed complete:');
  console.log(`  Admin email: admin@fleetnimble.com`);
  console.log(`  Admin password: ${ADMIN_PASSWORD}`);
  console.log(`  Vehicles seeded: ${FLEET.length}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
