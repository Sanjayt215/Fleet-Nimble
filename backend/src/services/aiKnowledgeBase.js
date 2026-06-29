/**
 * FleetNimble AI Knowledge Base
 * Provides FAQ, documentation, and platform information to the AI
 */

// Simple in-memory cache for knowledge base search results
const searchCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const KNOWLEDGE_BASE = {
  faqs: {
    'How do I connect an OBD device?': `
To connect an OBD device to FleetNimble:

1. Ensure your vehicle has an OBD-II port (usually under the dashboard)
2. Plug in the FleetNimble OBD adapter
3. Enable Bluetooth on your mobile device
4. Open the FleetNimble mobile app
5. Go to Settings > Add Vehicle > Connect OBD Device
6. Select your OBD adapter from the Bluetooth list
7. Pair the device (default PIN is usually 1234 or 0000)
8. Wait for the connection to establish

Troubleshooting:
- If the device doesn't appear, ensure Bluetooth is enabled and the adapter is powered
- Try turning the vehicle ignition to ON position
- Restart the mobile app and try again
- Check if the adapter is compatible with your vehicle (OBD-II standard)
`,
    'How does GPS tracking work?': `
FleetNimble GPS tracking works through:

1. **Built-in GPS**: Some OBD adapters have built-in GPS
2. **Mobile GPS**: The mobile app can use phone GPS when connected
3. **Telematics Devices**: Professional telematics units with GPS

GPS data includes:
- Real-time location (latitude/longitude)
- Speed and heading
- Trip tracking and routes
- Geofence alerts
- Historical location history

Requirements:
- Vehicle must have GPS hardware or mobile app connection
- Data connection (cellular or WiFi)
- GPS enabled in device settings

Troubleshooting:
- Check if GPS is enabled in device settings
- Ensure vehicle has clear view of sky (for satellite GPS)
- Verify data connection is active
- Check GPS signal strength in the dashboard
`,
    'What is VIN and where do I find it?': `
VIN (Vehicle Identification Number) is a unique 17-character code that identifies your vehicle.

Where to find VIN:
- **Dashboard**: Visible through the windshield on the driver's side
- **Driver's door jamb**: Sticker on the door frame
- **Vehicle registration**: Listed on registration documents
- **Insurance documents**: Listed on insurance policy
- **Engine block**: Stamped on the engine

VIN format:
- Characters 1-3: World Manufacturer Identifier (WMI)
- Characters 4-9: Vehicle attributes (model, body, engine)
- Character 10: Model year
- Character 11: Plant code
- Characters 12-17: Serial number

FleetNimble uses VIN to:
- Identify vehicles uniquely
- Decode vehicle specifications
- Provide accurate maintenance schedules
- Enable manufacturer-specific diagnostics
`,
    'How does battery protection work?': `
FleetNimble Battery Protection prevents vehicle battery drain by:

1. **Monitoring**: Continuously monitors battery voltage
2. **Thresholds**: Configurable voltage thresholds (default: 11.8V)
3. **Standby Mode**: Automatically enters standby when voltage is low
4. **Wake-up**: Wakes up periodically to check battery status
5. **Alerts**: Notifies when battery voltage is critical

Features:
- Configurable voltage thresholds
- Automatic sleep/wake cycles
- Historical battery health tracking
- Battery replacement recommendations
- Integration with maintenance schedules

Best Practices:
- Set appropriate thresholds for your climate
- Monitor battery health trends
- Replace batteries proactively
- Consider battery age and usage patterns
`,
    'What is standby mode?': `
Standby Mode is a power-saving feature that reduces OBD device power consumption when the vehicle is not in use.

How it works:
- Detects when vehicle ignition is OFF
- Enters low-power sleep mode after configurable delay
- Periodically wakes up to check battery status
- Automatically wakes up when ignition turns ON
- Can be manually controlled via mobile app

Benefits:
- Extends battery life
- Reduces data usage
- Lowers power consumption
- Prevents battery drain

Configuration:
- Sleep delay: Time before entering standby (default: 10 minutes)
- Wake interval: How often to check status (default: 1 hour)
- Manual override: Force wake/standby from app
`,
    'How do I create a vehicle?': `
To add a vehicle to FleetNimble:

1. Log in to the FleetNimble dashboard
2. Go to Vehicles > Add Vehicle
3. Fill in vehicle details:
   - Make (e.g., Toyota, Ford)
   - Model (e.g., Camry, F-150)
   - Year
   - VIN (required for full features)
   - License plate
   - Odometer reading
4. Click "Save Vehicle"
5. Connect OBD device (if applicable)
6. Verify connection in the dashboard

Required information:
- Make, Model, Year
- VIN (for full diagnostics and maintenance)
- License plate (optional but recommended)

Optional information:
- Vehicle photo
- Custom notes
- Group/category assignment
- Driver assignment
`,
    'How does telemetry work?': `
FleetNimble telemetry collects real-time vehicle data through:

**Data Sources:**
- OBD-II port (engine data)
- GPS (location data)
- Mobile sensors (accelerometer, etc.)
- Telematics devices (professional units)

**Data Collected:**
- Engine RPM
- Vehicle speed
- Coolant temperature
- Fuel level
- Battery voltage
- Engine load
- Throttle position
- Intake air temperature
- Mass air flow
- DTC codes

**Transmission:**
- Bluetooth (mobile app connection)
- Cellular (telematics devices)
- WiFi (when available)

**Processing:**
- Real-time validation
- Data normalization
- Alert generation
- Historical storage
- Analytics and reporting

**Privacy:**
- User data isolation
- Role-based access
- Secure transmission
- GDPR compliant
`,
    'How do reports work?': `
FleetNimble Reports provide insights into fleet performance:

**Available Reports:**
- Fleet Overview
- Vehicle Health
- Fuel Efficiency
- Driver Behavior
- Trip Analysis
- Maintenance Summary
- Alert History
- GPS Tracking
- Custom Reports

**Generating Reports:**
1. Go to Reports in the dashboard
2. Select report type
3. Choose date range
4. Filter by vehicle(s)
5. Click "Generate Report"

**Report Features:**
- Interactive charts and graphs
- Export to PDF, Excel, CSV
- Scheduled reports (email delivery)
- Custom date ranges
- Vehicle filtering
- Comparison views
- Trend analysis

**Data Sources:**
- Telemetry data
- GPS data
- Trip data
- Maintenance records
- Alert history
- Fuel consumption

**Best Practices:**
- Generate reports regularly (weekly/monthly)
- Compare trends over time
- Use filters for specific insights
- Schedule automated reports
- Share with stakeholders
`,
  },

  documentation: {
    platform: `
# FleetNimble Platform Overview

FleetNimble is a comprehensive fleet management platform that provides real-time vehicle monitoring, diagnostics, GPS tracking, and analytics.

## Key Features

### Real-Time Monitoring
- Live telemetry data
- GPS tracking
- Alert notifications
- Vehicle status

### Diagnostics
- OBD-II data reading
- DTC code interpretation
- Engine health monitoring
- Predictive maintenance

### Analytics
- Fleet performance metrics
- Driver behavior analysis
- Fuel efficiency tracking
- Cost analysis

### Maintenance
- Maintenance scheduling
- Service reminders
- Repair history
- Cost tracking

## Pricing

### Free Tier
- Up to 3 vehicles
- Basic monitoring
- Limited reports

### Professional
- Unlimited vehicles
- Full monitoring
- Advanced analytics
- Priority support

### Enterprise
- Custom solutions
- API access
- Dedicated support
- Custom integrations

## Support

- Email: support@fleetnimble.com
- Phone: 1-800-FLEET-NOW
- Documentation: docs.fleetnimble.com
- Community: community.fleetnimble.com
`,
    api: `
# FleetNimble API Documentation

## Authentication

All API requests require a JWT token in the Authorization header:

\`\`\`
Authorization: Bearer <your-jwt-token>
\`\`\`

## Base URL

Production: https://fleet-nimble.onrender.com/api

## Endpoints

### Authentication
- POST /auth/login - User login
- POST /auth/register - User registration
- POST /auth/logout - User logout
- GET /auth/profile - Get user profile

### Vehicles
- GET /vehicles - List vehicles
- POST /vehicles - Create vehicle
- GET /vehicles/:id - Get vehicle details
- PUT /vehicles/:id - Update vehicle
- DELETE /vehicles/:id - Delete vehicle

### Telemetry
- GET /obd/live-data/:vehicleId - Get live telemetry
- POST /obd/ingest - Ingest telemetry data
- GET /obd/history/:vehicleId - Get telemetry history

### GPS
- GET /gps/latest/:vehicleId - Get latest GPS
- GET /gps/history/:vehicleId - Get GPS history
- POST /gps/update - Update GPS location

### Alerts
- GET /alerts - List alerts
- POST /alerts - Create alert
- PUT /alerts/:id/read - Mark alert as read
- DELETE /alerts/:id - Delete alert

### DTC Codes
- GET /dtc/codes/:vehicleId - Get DTC codes
- POST /dtc/codes - Report DTC code
- DELETE /dtc/codes/:id - Clear DTC code

### Maintenance
- GET /maintenance/logs - Get maintenance logs
- POST /maintenance/logs - Create maintenance log
- PUT /maintenance/logs/:id - Update maintenance log

### AI Assistant
- POST /ai/chat - Send message to AI assistant
- GET /ai/chats - Get chat history
- GET /ai/chats/:chatId - Get specific chat
- DELETE /ai/chats/:chatId - Delete chat

## Rate Limiting

- Standard: 100 requests per minute
- AI Chat: 20 requests per minute
- Telemetry: 180 requests per minute

## Error Handling

All errors follow this format:

\`\`\`json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error description"
  }
}
\`\`\`

## Webhooks

Configure webhooks to receive real-time notifications:

- Alert notifications
- Vehicle status changes
- Maintenance reminders
- Geofence events

Contact support for webhook setup.
`,
  },

  troubleshooting: {
    common_issues: `
# Common Troubleshooting

## OBD Device Not Connecting

**Symptoms:**
- Device not found in Bluetooth list
- Connection fails repeatedly
- Data not updating

**Solutions:**
1. Ensure vehicle ignition is ON
2. Check OBD port for debris or damage
3. Try different OBD adapter
4. Restart mobile device
5. Clear Bluetooth cache
6. Update mobile app

## GPS Not Working

**Symptoms:**
- No location data
- Stale GPS data
- Inaccurate location

**Solutions:**
1. Check GPS is enabled in device settings
2. Ensure clear view of sky
3. Verify data connection
4. Restart device
5. Check GPS signal strength

## Battery Drain Issues

**Symptoms:**
- Vehicle battery dies frequently
- Low battery warnings
- OBD device not waking up

**Solutions:**
1. Enable battery protection
2. Adjust standby settings
3. Check battery health
4. Reduce wake interval
5. Consider battery replacement

## Data Not Syncing

**Symptoms:**
- Stale telemetry data
- Missing trip data
- Alerts not appearing

**Solutions:**
1. Check data connection
2. Verify device is paired
3. Restart mobile app
4. Check server status
5. Clear app cache

## App Crashes

**Symptoms:**
- App closes unexpectedly
- Freezes on startup
- Unresponsive UI

**Solutions:**
1. Update to latest app version
2. Clear app cache
3. Reinstall app
4. Check device compatibility
5. Report bug to support
`,
  },
};

/**
 * Search knowledge base for relevant information (with caching)
 */
export function searchKnowledgeBase(query) {
  const lowerQuery = query.toLowerCase();
  const cacheKey = lowerQuery;

  // Check cache
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.results;
  }

  const results = [];

  // Search FAQs
  for (const [question, answer] of Object.entries(KNOWLEDGE_BASE.faqs)) {
    if (question.toLowerCase().includes(lowerQuery) || answer.toLowerCase().includes(lowerQuery)) {
      results.push({
        type: 'faq',
        question,
        answer,
      });
    }
  }

  // Search documentation
  for (const [section, content] of Object.entries(KNOWLEDGE_BASE.documentation)) {
    if (section.toLowerCase().includes(lowerQuery) || content.toLowerCase().includes(lowerQuery)) {
      results.push({
        type: 'documentation',
        section,
        content,
      });
    }
  }

  // Search troubleshooting
  for (const [issue, solution] of Object.entries(KNOWLEDGE_BASE.troubleshooting)) {
    if (issue.toLowerCase().includes(lowerQuery) || solution.toLowerCase().includes(lowerQuery)) {
      results.push({
        type: 'troubleshooting',
        issue,
        solution,
      });
    }
  }

  // Cache results
  searchCache.set(cacheKey, {
    results,
    timestamp: Date.now(),
  });

  // Clean up old cache entries periodically
  if (searchCache.size > 100) {
    const now = Date.now();
    for (const [key, value] of searchCache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        searchCache.delete(key);
      }
    }
  }

  return results;
}

/**
 * Get knowledge base context for AI
 */
export function getKnowledgeBaseContext() {
  return {
    faqs: Object.keys(KNOWLEDGE_BASE.faqs),
    documentation: Object.keys(KNOWLEDGE_BASE.documentation),
    troubleshooting: Object.keys(KNOWLEDGE_BASE.troubleshooting),
  };
}

export default KNOWLEDGE_BASE;
