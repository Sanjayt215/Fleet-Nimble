// Demo fleet with complete details (as per user request)
export const DEMO_FLEET = [
  {
    id: "demo-001",
    category: "CAR",
    vehicleName: "Toyota Innova",
    registrationNumber: "FL-001",
    plateNumber: "FL-001",
    make: "Toyota",
    model: "Innova",
    year: 2020,
    fuelType: "Diesel",
    vin: "VIN-FL-001",
    odometer: 52340,
    driverName: "Rajesh Kumar",
    status: "ONLINE",
    telemetryOnline: true,
    lastTelemetryAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    id: "demo-002",
    category: "CAR",
    vehicleName: "Mahindra XUV500",
    registrationNumber: "FL-002",
    plateNumber: "FL-002",
    make: "Mahindra",
    model: "XUV500",
    year: 2019,
    fuelType: "Diesel",
    vin: "VIN-FL-002",
    odometer: 78900,
    driverName: "Suresh Singh",
    status: "ONLINE",
    telemetryOnline: true,
    lastTelemetryAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
  },
  {
    id: "demo-003",
    category: "CAR",
    vehicleName: "Hyundai Creta",
    registrationNumber: "FL-003",
    plateNumber: "FL-003",
    make: "Hyundai",
    model: "Creta",
    year: 2021,
    fuelType: "Petrol",
    vin: "VIN-FL-003",
    odometer: 23450,
    driverName: "Amit Sharma",
    status: "ONLINE",
    telemetryOnline: true,
    lastTelemetryAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
  },
  {
    id: "demo-004",
    category: "CAR",
    vehicleName: "Maruti Swift",
    registrationNumber: "FL-004",
    plateNumber: "FL-004",
    make: "Maruti Suzuki",
    model: "Swift",
    year: 2022,
    fuelType: "Petrol",
    vin: "VIN-FL-004",
    odometer: 41200,
    driverName: "Priya Patel",
    status: "OFFLINE",
    telemetryOnline: false,
    lastTelemetryAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
];

export const DEMO_STATS = {
  vehicleCount: 4,
  onlineVehicles: 3,
  fleetUtilization: 75,
  activeDtc: 1,
  pendingDtc: 0,
  unreadAlerts: 3,
  maintenanceDue: 2,
  fuelLiters30d: 1250,
  driverEvents7d: 18,
  recentTrips: 32,
};

// Demo fuel logs
export const DEMO_FUEL_LOGS = [
  {
    id: "demo-fuel-1",
    vehicleId: "demo-001",
    liters: 45.5,
    cost: 3200,
    odometer: 51800,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-fuel-2",
    vehicleId: "demo-002",
    liters: 52.0,
    cost: 3650,
    odometer: 78200,
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-fuel-3",
    vehicleId: "demo-003",
    liters: 38.0,
    cost: 2700,
    odometer: 22800,
    createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

// Demo maintenance logs
export const DEMO_MAINTENANCE_LOGS = [
  {
    id: "demo-maintenance-1",
    vehicleId: "demo-001",
    serviceType: "Oil Change",
    dueKm: 60000,
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    completed: false,
  },
  {
    id: "demo-maintenance-2",
    vehicleId: "demo-002",
    serviceType: "Tire Rotation",
    dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    completed: false,
  },
];

// Demo drivers
export const DEMO_DRIVERS = [
  {
    id: "demo-driver-1",
    name: "Rajesh Kumar",
    score: 85,
    harshBraking: 3,
    harshAcceleration: 2,
    idleTime: 120,
    vehicleId: "demo-001",
  },
  {
    id: "demo-driver-2",
    name: "Suresh Singh",
    score: 78,
    harshBraking: 5,
    harshAcceleration: 4,
    idleTime: 180,
    vehicleId: "demo-002",
  },
  {
    id: "demo-driver-3",
    name: "Amit Sharma",
    score: 92,
    harshBraking: 1,
    harshAcceleration: 0,
    idleTime: 60,
    vehicleId: "demo-003",
  },
];

// Demo DTC codes
export const DEMO_DTCS = [
  {
    id: "demo-dtc-1",
    vehicleId: "demo-001",
    code: "P0420",
    description: "Catalyst System Efficiency Below Threshold",
    status: "CONFIRMED",
    severity: "HIGH",
    active: true,
    detectedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
];

// Demo alerts
export const DEMO_ALERTS = [
  {
    id: "demo-alert-1",
    vehicleId: "demo-001",
    severity: "HIGH",
    message: "Check engine light ON (P0420)",
    read: false,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-alert-2",
    vehicleId: "demo-002",
    severity: "MEDIUM",
    message: "Fuel level below 10%",
    read: false,
    createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-alert-3",
    vehicleId: "demo-003",
    severity: "LOW",
    message: "Maintenance due in 500 km",
    read: true,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

// Demo trips
export const DEMO_TRIPS = [
  {
    id: "demo-trip-1",
    vehicleId: "demo-001",
    startLocation: "Delhi",
    endLocation: "Noida",
    distance: 32.5,
    avgSpeed: 45,
    startTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    endTime: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-trip-2",
    vehicleId: "demo-002",
    startLocation: "Gurgaon",
    endLocation: "Faridabad",
    distance: 45.2,
    avgSpeed: 52,
    startTime: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    endTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
];
