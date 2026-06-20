# FleetNimble - Telemetry & GPS API Reference

## Quick Reference for Mobile App Developers

---

## Authentication

All endpoints require JWT authentication via Bearer token:
```
Authorization: Bearer <access_token>
```

---

## 1. VIN Decode

Decode a Vehicle Identification Number using NHTSA API.

### Endpoint
```
POST /api/mobile/vehicles/vin-decode
```

### Request Body
```json
{
  "vin": "1HGBH41JXMN109186"
}
```

### Success Response (200 OK)
```json
{
  "success": true,
  "data": {
    "vin": "1HGBH41JXMN109186",
    "make": "HONDA",
    "model": "Accord",
    "year": 1991,
    "manufacturer": "HONDA MOTOR CO., LTD",
    "fuelType": "Gasoline",
    "bodyClass": "Sedan/Saloon",
    "engineModel": "F22A1"
  }
}
```

### Error Response (400 Bad Request)
```json
{
  "success": false,
  "error": {
    "code": "VIN_DECODE_FAILED",
    "message": "Failed to decode VIN"
  }
}
```

---

## 2. Vehicle Setup

Register or update a vehicle with decoded VIN information.

### Endpoint
```
POST /api/mobile/vehicles/setup
```

### Request Body
```json
{
  "vehicleName": "My Honda Accord",
  "registrationNumber": "ABC123",
  "make": "HONDA",
  "model": "Accord",
  "year": 1991,
  "fuelType": "Gasoline",
  "vin": "1HGBH41JXMN109186",
  "manufacturer": "HONDA MOTOR CO., LTD",
  "bodyClass": "Sedan/Saloon",
  "engineModel": "F22A1",
  "obdDeviceName": "ELM327",
  "bluetoothAddress": "00:1A:7D:DA:71:13"
}
```

### Required Fields
- `vehicleName` (string)
- `registrationNumber` (string)

### Optional Fields
- `make`, `model`, `year`, `fuelType`
- `vin`, `manufacturer`, `bodyClass`, `engineModel`
- `obdDeviceName`, `bluetoothAddress`

### Success Response (200 OK)
```json
{
  "success": true,
  "data": {
    "vehicleId": "uuid-1234",
    "vehicleName": "My Honda Accord",
    "registrationNumber": "ABC123",
    "make": "HONDA",
    "model": "Accord",
    "year": 1991,
    "fuelType": "Gasoline",
    "vin": "1HGBH41JXMN109186",
    "manufacturer": "HONDA MOTOR CO., LTD",
    "bodyClass": "Sedan/Saloon",
    "engineModel": "F22A1",
    "obdDeviceId": "uuid-5678"
  }
}
```

---

## 3. Submit Live Telemetry

Send real-time OBD and GPS data from the mobile app.

### Endpoint
```
POST /api/mobile/telemetry/live
```

### Request Body (All fields optional except vehicleId)
```json
{
  "vehicleId": "uuid-1234",
  "mode": "LIVE",
  "rpm": 1500,
  "speed": 45,
  "fuelLevel": 75,
  "coolantTemp": 85,
  "batteryVoltage": 13.8,
  "engineLoad": 35,
  "latitude": 28.6139,
  "longitude": 77.2090,
  "gpsAccuracy": 10,
  "gpsAltitude": 250,
  "gpsHeading": 180,
  "gpsTimestamp": "2026-06-20T10:30:00Z",
  "vin": "1HGBH41JXMN109186",
  "odometer": 50000,
  "timestamp": "2026-06-20T10:30:00Z"
}
```

### Field Descriptions

**Required:**
- `vehicleId` (string): UUID of the vehicle

**OBD Data (optional):**
- `rpm` (number): Engine RPM (0-8000)
- `speed` (number): Vehicle speed in km/h
- `fuelLevel` (number): Fuel level percentage (0-100)
- `coolantTemp` (number): Engine coolant temperature in °C
- `batteryVoltage` (number): Battery voltage in V (typically 12-14.5)
- `engineLoad` (number): Engine load percentage (0-100)
- `odometer` (number): Odometer reading in km

**GPS Data (optional):**
- `latitude` (number): GPS latitude (-90 to 90)
- `longitude` (number): GPS longitude (-180 to 180)
- `gpsAccuracy` (number): GPS accuracy in meters
- `gpsAltitude` (number): Altitude in meters
- `gpsHeading` (number): Heading in degrees (0-360)
- `gpsTimestamp` (string): ISO 8601 timestamp from GPS

**Metadata (optional):**
- `mode` (string): "LIVE" or "DEMO" (default: "LIVE")
- `vin` (string): Vehicle VIN
- `timestamp` (string): ISO 8601 timestamp (defaults to server time)

### Success Response (200 OK)
```json
{
  "success": true,
  "data": {
    "vehicleId": "uuid-1234",
    "saved": true,
    "telemetryId": "uuid-telemetry-789"
  }
}
```

### Error Responses

**404 Not Found** - Vehicle doesn't exist:
```json
{
  "success": false,
  "error": "Vehicle not found"
}
```

**403 Forbidden** - Not authorized:
```json
{
  "success": false,
  "error": "Vehicle not authorized for this user"
}
```

### Side Effects

When telemetry is submitted successfully:

1. **Database Updates:**
   - Creates new record in `Telemetry` table
   - Updates `Vehicle` table:
     - `lastTelemetryAt` → current time
     - `telemetryOnline` → true
     - `status` → "MOVING", "IDLING", or "PARKED"
     - `gpsLastLatitude`, `gpsLastLongitude` (if GPS present)
   - Updates `VehicleLiveState` table with latest values

2. **Socket.IO Events Emitted:**
   - `live-telemetry-update` → all connected clients in user room
   - `live-gps-update` → if GPS data present
   - `vehicle-online` → vehicle online status

3. **Vehicle Status Logic:**
   - `MOVING`: speed > 1 km/h
   - `IDLING`: rpm > 200 and speed ≤ 1
   - `PARKED`: rpm ≤ 200

### Recommended Sending Frequency
- **Real-time monitoring**: Every 1-2 seconds
- **Normal tracking**: Every 5 seconds
- **Battery saving**: Every 10-15 seconds

---

## 4. Get Latest Telemetry

Retrieve the most recent telemetry data for a vehicle.

### Endpoint
```
GET /api/mobile/telemetry/latest?vehicleId={vehicleId}
```

### Query Parameters
- `vehicleId` (optional): Filter by specific vehicle
  - If omitted, returns latest telemetry for any of user's vehicles

### Success Response (200 OK)
```json
{
  "success": true,
  "data": {
    "id": "uuid-telemetry-789",
    "vehicleId": "uuid-1234",
    "userId": "uuid-user-456",
    "obdDeviceId": "uuid-obd-999",
    "mode": "LIVE",
    "rpm": 1500,
    "speed": 45,
    "fuelLevel": 75,
    "coolantTemp": 85,
    "batteryVoltage": 13.8,
    "engineLoad": 35,
    "latitude": 28.6139,
    "longitude": 77.2090,
    "gpsAccuracy": 10,
    "gpsAltitude": 250,
    "gpsHeading": 180,
    "gpsTimestamp": "2026-06-20T10:30:00Z",
    "vin": "1HGBH41JXMN109186",
    "odometer": 50000,
    "timestamp": "2026-06-20T10:30:00Z",
    "createdAt": "2026-06-20T10:30:01Z",
    "vehicle": {
      "id": "uuid-1234",
      "vehicleName": "My Honda Accord",
      "status": "MOVING",
      "telemetryOnline": true
    }
  }
}
```

### No Data Response (200 OK)
```json
{
  "success": true,
  "data": null
}
```

---

## 5. Get Telemetry History

Retrieve historical telemetry data for a vehicle.

### Endpoint
```
GET /api/mobile/telemetry/history/{vehicleId}?limit=100
```

### Path Parameters
- `vehicleId` (required): UUID of the vehicle

### Query Parameters
- `limit` (optional): Number of records to return (default: 100, max: 500)

### Success Response (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-latest",
      "vehicleId": "uuid-1234",
      "rpm": 1500,
      "speed": 45,
      "fuelLevel": 75,
      "coolantTemp": 85,
      "latitude": 28.6139,
      "longitude": 77.2090,
      "timestamp": "2026-06-20T10:30:00Z"
    },
    {
      "id": "uuid-previous",
      "vehicleId": "uuid-1234",
      "rpm": 1450,
      "speed": 42,
      "fuelLevel": 75,
      "coolantTemp": 83,
      "latitude": 28.6120,
      "longitude": 77.2080,
      "timestamp": "2026-06-20T10:29:58Z"
    }
  ]
}
```

### Error Response (403 Forbidden)
```json
{
  "success": false,
  "error": "Not authorized"
}
```

---

## 6. Get My Vehicles

Retrieve all vehicles associated with the authenticated user.

### Endpoint
```
GET /api/mobile/vehicles/my
```

### Success Response (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-1234",
      "vehicleName": "My Honda Accord",
      "registrationNumber": "ABC123",
      "make": "HONDA",
      "model": "Accord",
      "year": 1991,
      "vin": "1HGBH41JXMN109186",
      "status": "MOVING",
      "telemetryOnline": true,
      "lastTelemetryAt": "2026-06-20T10:30:00Z",
      "gpsLastLatitude": 28.6139,
      "gpsLastLongitude": 77.2090,
      "gpsLastAt": "2026-06-20T10:30:00Z",
      "obdDeviceId": "uuid-obd-999",
      "createdAt": "2026-06-15T08:00:00Z",
      "latestTelemetry": {
        "rpm": 1500,
        "speed": 45,
        "fuelLevel": 75,
        "coolantTemp": 85,
        "timestamp": "2026-06-20T10:30:00Z"
      }
    }
  ]
}
```

---

## Socket.IO Events

The backend emits real-time events via Socket.IO.

### Connect to Socket.IO
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: {
    token: '<your-jwt-token>'
  }
});

socket.on('connect', () => {
  console.log('Connected to Socket.IO');
  socket.emit('join:user'); // Join user-specific room
});
```

### Event: live-telemetry-update

Emitted when new telemetry is received from any vehicle.

**Event Data:**
```javascript
{
  vehicleId: 'uuid-1234',
  mode: 'LIVE',
  rpm: 1500,
  speed: 45,
  fuelLevel: 75,
  coolantTemp: 85,
  batteryVoltage: 13.8,
  engineLoad: 35,
  latitude: 28.6139,
  longitude: 77.2090,
  timestamp: '2026-06-20T10:30:00Z',
  vehicle: {
    id: 'uuid-1234',
    status: 'MOVING',
    telemetryOnline: true
  }
}
```

**Listen for event:**
```javascript
socket.on('live-telemetry-update', (data) => {
  console.log('Live telemetry:', data);
  // Update UI with new values
});
```

### Event: live-gps-update

Emitted when GPS data is present in telemetry.

**Event Data:**
```javascript
{
  vehicleId: 'uuid-1234',
  latitude: 28.6139,
  longitude: 77.2090,
  gpsAccuracy: 10,
  gpsAltitude: 250,
  gpsHeading: 180,
  speed: 45,
  timestamp: '2026-06-20T10:30:00Z'
}
```

**Listen for event:**
```javascript
socket.on('live-gps-update', (data) => {
  console.log('GPS update:', data);
  // Update map marker position
});
```

### Event: vehicle-online

Emitted when vehicle status changes (online/offline).

**Event Data:**
```javascript
{
  vehicleId: 'uuid-1234',
  status: 'MOVING', // or 'IDLING', 'PARKED'
  online: true
}
```

**Listen for event:**
```javascript
socket.on('vehicle-online', (data) => {
  console.log('Vehicle status:', data);
  // Update online/offline indicator
});
```

### Event: vehicle-registered

Emitted when a new vehicle is registered.

**Event Data:**
```javascript
{
  vehicle: {
    id: 'uuid-1234',
    vehicleName: 'My Honda Accord',
    registrationNumber: 'ABC123',
    obdDeviceId: 'uuid-obd-999'
  },
  obdDevice: {
    id: 'uuid-obd-999',
    deviceName: 'ELM327'
  }
}
```

---

## Data Validation Rules

### Numbers (nulls not allowed, invalid values converted to null)
- All numeric fields validated via `sanitizeNumber()`
- `NaN` and `Infinity` converted to `null`
- Empty strings converted to `null`

### Coordinates
- Latitude: -90 to 90
- Longitude: -180 to 180

### Timestamps
- ISO 8601 format preferred
- Stored as UTC in database
- Defaults to server time if not provided

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_PAYLOAD` | 400 | Missing required fields |
| `VIN_DECODE_FAILED` | 400 | VIN decode error from NHTSA |
| `UNAUTHORIZED` | 401 | Authentication failed |
| `Not authorized` | 403 | User doesn't own this vehicle |
| `Vehicle not found` | 404 | Vehicle doesn't exist or deleted |
| `VEHICLE_SETUP_FAILED` | 500 | Database error during setup |

---

## Rate Limits

- **Telemetry submission**: No strict limit, but recommended max 1 request/second per vehicle
- **VIN decode**: 5 requests/minute (NHTSA API limit)
- **Other endpoints**: 100 requests/minute per user

---

## Best Practices

### 1. Efficient Telemetry Sending
```javascript
// Send only when values change significantly
let lastRpm = 0;
if (Math.abs(currentRpm - lastRpm) > 50) {
  sendTelemetry({ rpm: currentRpm });
  lastRpm = currentRpm;
}
```

### 2. Batch GPS History
```javascript
// Don't query history on every update
// Use Socket.IO for real-time, fetch history once
```

### 3. Handle Offline Mode
```javascript
// Queue telemetry when offline
if (isOnline) {
  sendQueuedTelemetry();
} else {
  queueTelemetry(data);
}
```

### 4. Always include timestamp
```javascript
{
  timestamp: new Date().toISOString(),
  // ... other fields
}
```

---

## Sample Mobile App Integration

```javascript
// 1. Decode VIN
const vinData = await fetch('/api/mobile/vehicles/vin-decode', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ vin: scannedVin })
});

// 2. Setup Vehicle
const vehicle = await fetch('/api/mobile/vehicles/setup', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    vehicleName: 'My Car',
    registrationNumber: 'ABC123',
    ...vinData.data
  })
});

// 3. Start sending telemetry
setInterval(async () => {
  const obdData = await readOBD();
  const gpsData = await getGPSLocation();
  
  await fetch('/api/mobile/telemetry/live', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      vehicleId: vehicle.data.vehicleId,
      mode: 'LIVE',
      ...obdData,
      ...gpsData,
      timestamp: new Date().toISOString()
    })
  });
}, 2000); // Every 2 seconds
```

---

## Support

For issues or questions:
- Check TESTING_GUIDE.md for troubleshooting
- Review backend logs for errors
- Verify authentication token is valid
- Confirm vehicle exists and belongs to user

**Happy coding!** 🚗💨
