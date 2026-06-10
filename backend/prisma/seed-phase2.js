import prisma from '../src/utils/prisma.js';
import logger from '../src/utils/logger.js';

// Sample vehicle data
const vehicleData = [
  { make: 'Toyota', model: 'Camry', vin: 'VIN001', plate: 'FL-001', year: 2022 },
  { make: 'Honda', model: 'Accord', vin: 'VIN002', plate: 'FL-002', year: 2021 },
  { make: 'Ford', model: 'F-150', vin: 'VIN003', plate: 'FL-003', year: 2023 },
  { make: 'Chevrolet', model: 'Silverado', vin: 'VIN004', plate: 'FL-004', year: 2022 },
  { make: 'BMW', model: '3 Series', vin: 'VIN005', plate: 'FL-005', year: 2023 },
  { make: 'Mercedes', model: 'C-Class', vin: 'VIN006', plate: 'FL-006', year: 2021 },
  { make: 'Audi', model: 'A4', vin: 'VIN007', plate: 'FL-007', year: 2022 },
  { make: 'Volkswagen', model: 'Jetta', vin: 'VIN008', plate: 'FL-008', year: 2020 },
  { make: 'Hyundai', model: 'Elantra', vin: 'VIN009', plate: 'FL-009', year: 2022 },
  { make: 'Kia', model: 'Optima', vin: 'VIN010', plate: 'FL-010', year: 2021 },
  { make: 'Tesla', model: 'Model 3', vin: 'VIN011', plate: 'FL-011', year: 2023 },
  { make: 'Nissan', model: 'Altima', vin: 'VIN012', plate: 'FL-012', year: 2022 },
  { make: 'Mazda', model: 'CX-5', vin: 'VIN013', plate: 'FL-013', year: 2021 },
  { make: 'Subaru', model: 'Outback', vin: 'VIN014', plate: 'FL-014', year: 2022 },
  { make: 'Toyota', model: 'Highlander', vin: 'VIN015', plate: 'FL-015', year: 2023 },
  { make: 'Honda', model: 'CR-V', vin: 'VIN016', plate: 'FL-016', year: 2021 },
  { make: 'Ford', model: 'Escape', vin: 'VIN017', plate: 'FL-017', year: 2022 },
  { make: 'Chevrolet', model: 'Equinox', vin: 'VIN018', plate: 'FL-018', year: 2020 },
  { make: 'GMC', model: 'Sierra', vin: 'VIN019', plate: 'FL-019', year: 2022 },
  { make: 'Ram', model: '1500', vin: 'VIN020', plate: 'FL-020', year: 2023 },
];

async function seedDatabase() {
  try {
    logger.info('🌱 Starting Phase-2 database seed...');

    const vehicleCount = await prisma.vehicle.count();
    let vehicles = [];
    if (vehicleCount === 0) {
      const role = await prisma.role.findFirst({ where: { name: 'MANAGER' } });
      if (!role) {
        logger.error('No MANAGER role found. Please seed roles first.');
        process.exit(1);
      }
      const user = await prisma.user.create({
        data: {
          name: 'Fleet Manager',
          email: 'fleet@example.com',
          passwordHash: 'fleetmanager-placeholder',
          roleId: role.id,
        },
      });
      logger.info('✅ Created sample fleet manager');

      for (let i = 0; i < vehicleData.length; i++) {
        const data = vehicleData[i];
        const odometer = Math.floor(Math.random() * 150000) + 10000;
        const engineHours = odometer / 60 + Math.random() * 500;

        const vehicle = await prisma.vehicle.create({
          data: {
            userId: user.id,
            vin: data.vin,
            plateNumber: data.plate,
            make: data.make,
            model: data.model,
            year: data.year,
            odometer,
            engineHoursObd: engineHours,
          },
        });
        vehicles.push(vehicle);
        logger.info(`✅ Created vehicle ${i + 1}/${vehicleData.length}: ${data.make} ${data.model}`);
      }
    } else {
      vehicles = await prisma.vehicle.findMany({ where: { deletedAt: null }, take: 25, orderBy: { createdAt: 'asc' } });
      logger.info(`✅ Using ${vehicles.length} existing vehicles for phase2 demo data`);
    }

    // Create live states for each vehicle
    for (const vehicle of vehicles) {
      const fuelLevel = Math.floor(Math.random() * 50) + 30; // 30-80%
      const status = Math.random() > 0.7 ? 'MOVING' : Math.random() > 0.5 ? 'IDLING' : 'PARKED';
      const engineHours = vehicle.engineHoursObd ?? Math.max(0, Math.floor(vehicle.odometer / 60));

      const liveState = await prisma.vehicleLiveState.upsert({
        where: { vehicleId: vehicle.id },
        update: {
          telemetrySource: 'SIMULATED',
          rpm: status === 'PARKED' ? 0 : status === 'IDLING' ? Math.floor(Math.random() * 200) + 700 : Math.floor(Math.random() * 1300) + 1200,
          speed: status === 'PARKED' ? 0 : status === 'IDLING' ? 0 : Math.floor(Math.random() * 40) + 20,
          coolantTemp: Math.floor(Math.random() * 40) + 70,
          batteryVoltage: Math.floor(Math.random() * 2) + 12.5,
          fuelLevel,
          engineLoad: status === 'PARKED' ? 0 : Math.floor(Math.random() * 60) + 20,
          throttlePosition: status === 'PARKED' ? 0 : Math.floor(Math.random() * 70) + 10,
          engineHours,
          odometer: vehicle.odometer,
          gpsLat: 37.7749 + (Math.random() - 0.5),
          gpsLng: -122.4194 + (Math.random() - 0.5),
          ignitionStatus: status !== 'PARKED',
          vehicleStatus: status,
        },
        create: {
          vehicle: { connect: { id: vehicle.id } },
          telemetrySource: 'SIMULATED',
          rpm: status === 'PARKED' ? 0 : status === 'IDLING' ? Math.floor(Math.random() * 200) + 700 : Math.floor(Math.random() * 1300) + 1200,
          speed: status === 'PARKED' ? 0 : status === 'IDLING' ? 0 : Math.floor(Math.random() * 40) + 20,
          coolantTemp: Math.floor(Math.random() * 40) + 70,
          batteryVoltage: Math.floor(Math.random() * 2) + 12.5,
          fuelLevel,
          engineLoad: status === 'PARKED' ? 0 : Math.floor(Math.random() * 60) + 20,
          throttlePosition: status === 'PARKED' ? 0 : Math.floor(Math.random() * 70) + 10,
          engineHours,
          odometer: vehicle.odometer,
          gpsLat: 37.7749 + (Math.random() - 0.5),
          gpsLng: -122.4194 + (Math.random() - 0.5),
          ignitionStatus: status !== 'PARKED',
          vehicleStatus: status,
        },
      });

      logger.debug(`  Live state initialized: ${liveState.vehicleStatus}`);
    }

    // Create fuel logs for each vehicle
    for (const vehicle of vehicles) {
      await prisma.fuelLog.create({
        data: {
          vehicleId: vehicle.id,
          liters: 50,
          cost: 75,
          mileage: vehicle.odometer,
        },
      });
    }

    // Create maintenance logs
    for (const vehicle of vehicles) {
      await prisma.maintenanceLog.create({
        data: {
          vehicleId: vehicle.id,
          serviceType: 'Oil Change',
          dueKm: vehicle.odometer + 5000,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          completed: false,
        },
      });

      await prisma.maintenanceLog.create({
        data: {
          vehicleId: vehicle.id,
          serviceType: 'Tire Rotation',
          dueKm: vehicle.odometer + 8000,
          dueDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          completed: false,
        },
      });
    }

    // Create some sample fuel history records
    for (const vehicle of vehicles) {
      // Sample consumption events
      for (let i = 0; i < 3; i++) {
        await prisma.fuelHistory.create({
          data: {
            vehicleId: vehicle.id,
            fuelBefore: 80 - i * 10,
            fuelAfter: 70 - i * 10,
            eventType: 'CONSUMPTION',
            source: 'SYSTEM',
            metadata: {
              distance: Math.floor(Math.random() * 50) + 30,
              avgSpeed: Math.floor(Math.random() * 40) + 30,
              avgRpm: Math.floor(Math.random() * 1000) + 2000,
            },
            timestamp: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000),
          },
        });
      }

      // Sample refuel event
      await prisma.fuelHistory.create({
        data: {
          vehicleId: vehicle.id,
          fuelBefore: 15,
          fuelAfter: 85,
          litersAdded: 50,
          eventType: 'REFUEL',
          source: 'MANUAL',
          metadata: {
            cost: 75,
            pricePerLiter: 1.5,
          },
          timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        },
      });
    }

    // Create some sample alerts
    const alertTypes = ['FUEL_LOW', 'COOLANT_HIGH', 'BATTERY_LOW', 'MAINTENANCE_DUE'];
    for (const vehicle of vehicles) {
      const randomAlert = alertTypes[Math.floor(Math.random() * alertTypes.length)];
      
      if (Math.random() > 0.6) { // 40% of vehicles have an alert
        await prisma.alert.create({
          data: {
            vehicleId: vehicle.id,
            alertType: randomAlert,
            message: `${randomAlert.replace(/_/g, ' ')}: Check vehicle`,
            severity: Math.random() > 0.7 ? 'CRITICAL' : 'MEDIUM',
            read: false,
          },
        });
      }
    }

    // === Add demo drivers (ensure 8 drivers) ===
    const driverRole = await prisma.role.findUnique({ where: { name: 'DRIVER' } });
    if (!driverRole) {
      logger.error('DRIVER role missing; please run initial seed');
      process.exit(1);
    }

    const company = await prisma.company.findFirst();
    const existingDrivers = await prisma.user.count({ where: { roleId: driverRole.id } });
    const driversToCreate = Math.max(0, 8 - existingDrivers);
    for (let i = 0; i < driversToCreate; i++) {
      const idx = existingDrivers + i + 1;
      const email = `driver${idx}@fleetnimble.com`;
      const name = `Demo Driver ${idx}`;
      await prisma.user.upsert({
        where: { email },
        update: { name, roleId: driverRole.id },
        create: {
          name,
          email,
          passwordHash: 'driver-seed-placeholder',
          roleId: driverRole.id,
          companyId: company?.id || undefined,
        },
      });
    }

    // If there are drivers, assign first 8 vehicles to drivers for demo
    const allDrivers = await prisma.user.findMany({ where: { roleId: driverRole.id }, take: 8 });
    for (let i = 0; i < Math.min(allDrivers.length, vehicles.length); i++) {
      const drv = allDrivers[i];
      const v = vehicles[i];
      await prisma.vehicle.update({ where: { id: v.id }, data: { userId: drv.id } });
    }

    // === Ensure driver scores exist for vehicles ===
    const existingScores = await prisma.driverScore.count();
    const scoresNeeded = Math.max(0, 8 - existingScores);
    for (let i = 0; i < scoresNeeded; i++) {
      const vehicle = vehicles[i % vehicles.length];
      await prisma.driverScore.create({
        data: {
          vehicleId: vehicle.id,
          harshBraking: Math.floor(Math.random() * 10),
          harshAcceleration: Math.floor(Math.random() * 8),
          overspeedEvents: Math.floor(Math.random() * 5),
          idleTime: Math.random() * 60,
          score: Math.floor(Math.random() * 20) + 75,
          periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          periodEnd: new Date(),
        },
      });
    }

    // === Ensure at least 10 DTC codes exist ===
    const existingDtc = await prisma.dtcCode.count();
    const dtcNeeded = Math.max(0, 10 - existingDtc);
    const dtcSamples = [
      { code: 'P0300', description: 'Random/Multiple Cylinder Misfire Detected', severity: 'HIGH' },
      { code: 'P0420', description: 'Catalyst System Efficiency Below Threshold', severity: 'MEDIUM' },
      { code: 'P0171', description: 'System Too Lean (Bank 1)', severity: 'MEDIUM' },
      { code: 'P0128', description: 'Coolant Thermostat (Coolant Temperature Below Thermostat Regulating Temperature)', severity: 'LOW' },
      { code: 'P0455', description: 'Evaporative Emission System Leak Detected (large leak)', severity: 'MEDIUM' },
      { code: 'P0102', description: 'Mass or Volume Air Flow Circuit Low Input', severity: 'MEDIUM' },
      { code: 'P0135', description: 'O2 Sensor Heater Circuit (Bank 1 Sensor 1)', severity: 'LOW' },
      { code: 'P0401', description: 'Exhaust Gas Recirculation Flow Insufficient Detected', severity: 'MEDIUM' },
      { code: 'P0700', description: 'Transmission Control System Malfunction', severity: 'CRITICAL' },
      { code: 'P0606', description: 'ECM/PCM Processor', severity: 'CRITICAL' },
    ];
    for (let i = 0; i < dtcNeeded; i++) {
      const sample = dtcSamples[i % dtcSamples.length];
      const vehicle = vehicles[i % vehicles.length];
      await prisma.dtcCode.create({
        data: {
          vehicleId: vehicle.id,
          code: sample.code,
          description: sample.description,
          status: i % 3 === 0 ? 'PENDING' : 'CONFIRMED',
          severity: sample.severity,
          active: true,
          detectedAt: new Date(Date.now() - i * 3600 * 1000),
          clearedAt: i % 4 === 0 ? new Date(Date.now() - (i - 1) * 3600 * 1000) : null,
        },
      });
    }

    // === Ensure at least 10 fuel log records ===
    const existingFuelLogs = await prisma.fuelLog.count();
    const fuelNeeded = Math.max(0, 10 - existingFuelLogs);
    for (let i = 0; i < fuelNeeded; i++) {
      const vehicle = vehicles[i % vehicles.length];
      await prisma.fuelLog.create({
        data: {
          vehicleId: vehicle.id,
          liters: Math.floor(Math.random() * 60) + 20,
          cost: Math.floor(Math.random() * 5000) / 100,
          mileage: vehicle.odometer - Math.floor(Math.random() * 5000),
          createdAt: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000),
        },
      });
    }

    // === Ensure at least 6 reports exist ===
    const existingReports = await prisma.report.count();
    const reportsNeeded = Math.max(0, 6 - existingReports);
    const reportTypes = ['MONTHLY_USAGE', 'FUEL_EFFICIENCY', 'MAINTENANCE_SUMMARY', 'DRIVER_SCORE', 'TRIP_SUMMARY', 'DAILY_OVERVIEW'];
    for (let i = 0; i < reportsNeeded; i++) {
      const vehicle = vehicles[i % vehicles.length];
      await prisma.report.create({
        data: {
          vehicleId: vehicle.id,
          reportType: reportTypes[i % reportTypes.length],
          data: {
            title: `${reportTypes[i % reportTypes.length]} for ${vehicle.plateNumber || vehicle.vin}`,
            generatedFor: vehicle.id,
            metrics: {
              distance: Math.floor(Math.random() * 1000) + 50,
              fuelUsed: Math.floor(Math.random() * 200) + 10,
              avgSpeed: Math.floor(Math.random() * 60) + 20,
            },
          },
          generatedAt: new Date(Date.now() - i * 24 * 3600 * 1000),
        },
      });
    }

    // === Ensure at least 12 alerts exist ===
    const existingAlerts = await prisma.alert.count();
    const alertsNeeded = Math.max(0, 12 - existingAlerts);
    const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const alertMessages = [
      'Low fuel level detected',
      'High coolant temperature',
      'Battery voltage low',
      'Maintenance due soon',
      'Harsh braking event',
      'Overspeed event detected',
    ];
    for (let i = 0; i < alertsNeeded; i++) {
      const vehicle = vehicles[i % vehicles.length];
      await prisma.alert.create({
        data: {
          vehicleId: vehicle.id,
          alertType: `ALERT_${i + 1}`,
          message: alertMessages[i % alertMessages.length],
          severity: severities[i % severities.length],
          read: false,
          createdAt: new Date(Date.now() - i * 3600 * 1000),
        },
      });
    }

    // Create sample driver scores
    for (const vehicle of vehicles) {
      await prisma.driverScore.create({
        data: {
          vehicleId: vehicle.id,
          harshBraking: Math.floor(Math.random() * 10),
          harshAcceleration: Math.floor(Math.random() * 8),
          overspeedEvents: Math.floor(Math.random() * 5),
          idleTime: Math.random() * 60,
          score: Math.floor(Math.random() * 30) + 70,
          periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          periodEnd: new Date(),
        },
      });
    }

    logger.info('✅ Seed completed successfully!');
    logger.info(`📊 Created ${vehicles.length} vehicles with associated data`);
    logger.info('🚀 System ready for testing');

    process.exit(0);
  } catch (error) {
    logger.error('❌ Seed failed', { error: error.message, stack: error.stack });
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedDatabase();
