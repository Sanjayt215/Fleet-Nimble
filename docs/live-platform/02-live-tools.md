# Live AI Tools

## Tool Definitions

All live data tools are defined in `receptionistLiveTools.service.js` as arrays compatible with both OpenAI function calling and Gemini functionDeclarations.

### get_fleet_summary

Returns an overall fleet health summary.

**Parameters**: None

**Response**:
```json
{
  "totalVehicles": 25,
  "onlineVehicles": 18,
  "offlineVehicles": 5,
  "standbyVehicles": 2,
  "criticalAlerts": 1,
  "maintenanceDue": 4,
  "activeDTCs": 3,
  "healthScore": 72,
  "riskLevel": "Moderate"
}
```

**Example questions**:
- "How many vehicles are in my fleet?"
- "What's the fleet health score?"
- "How many vehicles are online right now?"
- "Are there any critical alerts?"

### get_vehicle_status

Returns detailed status for a specific vehicle.

**Parameters**: `identifier` (string) — Vehicle ID or plate number

**Response**:
```json
{
  "id": "uuid",
  "name": "Ford Transit 2023",
  "plateNumber": "ABC123",
  "status": "active",
  "telemetryOnline": true,
  "liveState": {
    "vehicleStatus": "ON",
    "rpm": 1850,
    "speed": 65,
    "fuelLevel": 72,
    "coolantTemp": 88,
    "batteryVoltage": 12.6
  },
  "gpsLocation": {
    "lat": 40.7128,
    "lng": -74.006,
    "speed": 65,
    "heading": 180
  },
  "activeAlerts": 2,
  "activeDTCs": 0
}
```

**Example questions**:
- "What's the status of vehicle ABC123?"
- "Show me vehicle details for my Ford Transit"
- "Where is truck 7 right now?"
- "Is my delivery van online?"

### get_driver_information

Returns driver behavior data and scores for a vehicle.

**Parameters**: `vehicleId` (string, required)

**Response**:
```json
{
  "vehicle": "Ford Transit 2023",
  "plateNumber": "ABC123",
  "totalBehaviorEvents": 15,
  "recentEvents": [
    { "type": "HARSH_BRAKE", "severity": "MODERATE", "timestamp": "2026-07-19T10:30:00Z", "speed": 45 }
  ],
  "averageScore": 85,
  "driverScores": [ ... ]
}
```

**Example questions**:
- "How is the driver of ABC123 performing?"
- "Show me driver behavior events"
- "What's the driver score for my van?"

### get_live_diagnostics

Returns real-time OBD-II diagnostics for a vehicle.

**Parameters**: `vehicleId` (string, required)

**Response**:
```json
{
  "vehicleId": "uuid",
  "telemetry": {
    "rpm": 2200,
    "speed": 70,
    "coolantTemp": 90,
    "fuelLevel": 55,
    "batteryVoltage": 12.4,
    "engineLoad": 45
  },
  "activeDTCs": [
    { "code": "P0420", "description": "Catalyst System Efficiency Below Threshold", "severity": "HIGH" }
  ],
  "dtcCount": 1
}
```

**Example questions**:
- "What are the live diagnostics for vehicle ABC?"
- "Are there any check engine codes?"
- "Show me the live OBD data for truck 5"

### get_maintenance_schedule

Returns maintenance tasks that are due or upcoming.

**Parameters**: `vehicleId` (string, optional)

**Response**:
```json
{
  "totalDue": 8,
  "overdue": 2,
  "dueThisMonth": 3,
  "items": [
    { "task": "Oil Change", "vehicle": "Ford Transit 2023", "dueDate": "2026-07-25", "priority": "HIGH" }
  ]
}
```

**Example questions**:
- "What maintenance is due?"
- "How many maintenance tasks are overdue?"
- "Show me the service schedule for my fleet"

### get_alert_summary

Returns active alerts across the fleet or for a specific vehicle.

**Parameters**: `vehicleId` (string, optional)

**Response**:
```json
{
  "total": 12,
  "bySeverity": { "CRITICAL": 1, "HIGH": 3, "MEDIUM": 5, "LOW": 3 },
  "recentAlerts": [ ... ]
}
```

**Example questions**:
- "How many critical alerts do I have?"
- "Show me all active alerts"
- "Any issues with my fleet right now?"

### get_customer_information

Looks up customer data from the CRM.

**Parameters**: `phone`, `email`, `name`, or `customerId` (at least one required)

**Response**:
```json
{
  "found": true,
  "customer": {
    "name": "John Smith",
    "companyName": "Acme Logistics",
    "fleetSize": 25,
    "status": "LEAD",
    "leadScore": 40,
    "totalCalls": 3
  },
  "recentNotes": [ ... ],
  "recentAppointments": [ ... ],
  "recentTickets": [ ... ]
}
```

**Example questions**:
- "Show me customer details for John"
- "Look up ACME Logistics"
- "What's the status of our lead with +1234567890?"

### get_company_information

Returns company/tenant details.

**Parameters**: None

**Response**:
```json
{
  "name": "Acme Logistics Inc.",
  "industry": "Transportation",
  "totalVehicles": 25,
  "totalUsers": 8,
  "timezone": "America/New_York"
}
```

**Example questions**:
- "Tell me about my company"
- "How many users are on my account?"
- "What industry is my company in?"

### get_demo_schedule

Returns upcoming demos and appointments.

**Parameters**: None

**Response**:
```json
{
  "totalUpcoming": 5,
  "appointments": [
    { "callerName": "Jane Doe", "purpose": "Product Demo", "date": "2026-07-20T14:00:00Z", "status": "SCHEDULED" }
  ]
}
```

**Example questions**:
- "What demos are scheduled this week?"
- "Show me my upcoming appointments"
- "Do I have any demos tomorrow?"

### get_support_ticket_status

Returns support ticket summary or a specific ticket.

**Parameters**: `ticketId` (string, optional)

**Response**:
```json
{
  "total": 10,
  "open": 3,
  "closed": 7,
  "byUrgency": { "CRITICAL": 0, "HIGH": 1, "MEDIUM": 1, "LOW": 1 },
  "tickets": [ ... ]
}
```

**Example questions**:
- "How many support tickets are open?"
- "Show me my critical support tickets"
- "What's the status of ticket XYZ?"

### get_dashboard_statistics

Returns a comprehensive dashboard overview combining all data sources.

**Parameters**: None

**Response**:
```json
{
  "fleet": { ... },
  "alerts": { ... },
  "maintenance": { ... },
  "demos": { ... },
  "supportTickets": { ... }
}
```

**Example questions**:
- "Give me the full dashboard overview"
- "What does my fleet dashboard look like?"

### get_recent_activity

Returns recent fleet activity (trips, alerts, appointments).

**Parameters**: `limit` (number, optional, default 10, max 50)

**Response**:
```json
{
  "total": 10,
  "activities": [
    { "type": "trip", "summary": "ABC123 trip: 45.2 km", "timestamp": "2026-07-19T09:00:00Z" },
    { "type": "alert", "summary": "Fuel low on XYZ789", "timestamp": "2026-07-19T08:30:00Z" }
  ]
}
```

**Example questions**:
- "What's been happening with my fleet?"
- "Show me recent activity"
- "Any recent trips or alerts?"
