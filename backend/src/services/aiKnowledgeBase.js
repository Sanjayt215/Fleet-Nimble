/**
 * FleetNimble AI Knowledge Base
 * Provides FAQ, documentation, and platform information to the AI
 */

// Simple in-memory cache for knowledge base search results
const searchCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const KNOWLEDGE_BASE = {
  technical_explanations: {
    'What is Engine Load?': `
Engine Load represents the percentage of engine capacity being used at any given moment.

**How it works:**
- Calculated by the ECU (Engine Control Unit) based on throttle position, RPM, and air intake
- 0% means engine is idling
- 100% means engine is at maximum capacity
- Normal driving: 20-70%
- Heavy acceleration: 80-100%

**What it indicates:**
- High load: Engine working hard (acceleration, climbing, towing)
- Low load: Engine cruising or idling
- Abnormal patterns may indicate issues with sensors, fuel system, or air intake

**Normal range:** 10-90% during normal driving
`,
    'What is MAF (Mass Air Flow)?': `
MAF (Mass Air Flow) measures the amount of air entering the engine.

**How it works:**
- Sensor located in the air intake tube
- Measures air mass in grams per second (g/s)
- ECU uses this data to calculate fuel injection

**What it indicates:**
- Higher MAF: More air entering (acceleration, high RPM)
- Lower MAF: Less air entering (idling, cruising)
- Abnormal readings: Dirty air filter, sensor failure, vacuum leak

**Normal range:** 2-50 g/s depending on engine size
`,
    'What is Intake Temperature?': `
Intake Temperature measures the temperature of air entering the engine.

**How it works:**
- Sensor located in the air intake manifold
- Measures air temperature in Celsius or Fahrenheit
- Affects air density and fuel mixture

**What it indicates:**
- Lower temp: Denser air, better performance
- Higher temp: Less dense air, reduced performance
- Abnormal readings: Sensor failure, heat soak, cooling issues

**Normal range:** Ambient temperature to +20°C above ambient
`,
    'What is Battery Voltage?': `
Battery Voltage indicates the electrical system's health.

**How it works:**
- Measured in volts (V)
- 12V is standard for most vehicles
- Charging system should maintain 13.8-14.4V when running

**What it indicates:**
- 12.6V+: Fully charged battery
- 12.0-12.5V: Partially charged
- Below 12.0V: Low charge, may need charging
- Below 11.5V: Critical, battery may fail
- Above 14.5V: Possible alternator overcharging

**Normal range:** 12.4-14.4V
`,
    'What is Coolant Temperature?': `
Coolant Temperature measures engine cooling system temperature.

**How it works:**
- Sensor in coolant flow
- Measured in Celsius or Fahrenheit
- Thermostat regulates temperature

**What it indicates:**
- 80-95°C (176-203°F): Normal operating temperature
- Below 80°C: Engine not warmed up, thermostat stuck open
- Above 105°C: Overheating, check cooling system
- Rapid fluctuations: Possible sensor or thermostat issue

**Normal range:** 80-95°C during normal operation
`,
    'What is Throttle Position?': `
Throttle Position indicates how far the throttle valve is open.

**How it works:**
- Sensor on throttle body
- Measured as percentage (0-100%)
- 0% = closed (idle), 100% = fully open (wide open throttle)

**What it indicates:**
- 0-10%: Idling or cruising
- 10-50%: Normal acceleration
- 50-100%: Heavy acceleration or high load
- Erratic readings: Sensor wear, dirty throttle body

**Normal range:** 0-100% depending on driving conditions
`,
    'What are OBD-II codes?': `
OBD-II (On-Board Diagnostics) codes are standardized error codes.

**Code format:**
- P0xxx: Powertrain (engine, transmission)
- P1xxx: Manufacturer-specific powertrain
- C0xxx: Chassis (brakes, suspension)
- B0xxx: Body (airbags, climate)
- U0xxx: Network/communication

**Common codes:**
- P0300: Random misfire
- P0171: System too lean
- P0420: Catalyst efficiency below threshold
- P0700: Transmission control system malfunction

**What to do:**
- Record the code
- Look up specific meaning
- Address underlying issue
- Clear code after repair
`,
    'What is RPM?': `
RPM (Revolutions Per Minute) measures engine speed.

**How it works:**
- Measured by crankshaft position sensor
- Indicates how fast engine is spinning
- Affects power output and fuel consumption

**What it indicates:**
- 600-1000 RPM: Idling
- 1000-3000 RPM: Normal cruising
- 3000-6000 RPM: Acceleration or high load
- Above 6000 RPM: Redline approaching
- Erratic RPM: Possible sensor or fuel system issue

**Normal range:** 600-6500 RPM (varies by vehicle)
`,
  },
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

  training_guides: {
    getting_started: `
# FleetNimble Getting Started Guide

## Introduction

FleetNimble is a comprehensive fleet management platform that helps you monitor, manage, and optimize your fleet operations.

## Account Setup

1. **Create Account**
   - Visit fleetnimble.com
   - Click "Sign Up"
   - Enter your information
   - Verify email address

2. **Complete Profile**
   - Add company information
   - Set up user roles
   - Configure preferences

## Adding Your First Vehicle

1. **Connect OBD Device**
   - Locate OBD-II port (under dashboard)
   - Plug in FleetNimble adapter
   - Enable Bluetooth on mobile device
   - Pair with adapter (PIN: 1234)

2. **Add Vehicle to Dashboard**
   - Go to Vehicles > Add Vehicle
   - Enter vehicle details (Make, Model, Year, VIN)
   - Select connected OBD device
   - Save and verify connection

3. **Verify Data**
   - Check live telemetry
   - Verify GPS tracking
   - Test alerts

## Basic Navigation

- **Dashboard**: Overview of fleet status
- **Vehicles**: Manage vehicle list
- **Telemetry**: View live data
- **GPS**: Track vehicle locations
- **Alerts**: View notifications
- **Maintenance**: Schedule service
- **Reports**: Generate insights
- **Settings**: Configure preferences

## Next Steps

- Add remaining vehicles
- Set up alerts
- Configure geofences
- Schedule first report
- Invite team members
`,
    advanced_features: `
# FleetNimble Advanced Features Guide

## AI Assistant

The AI Assistant provides intelligent insights and answers questions about your fleet.

**Features:**
- Natural language queries
- Predictive analytics
- Maintenance recommendations
- Performance analysis

**Usage:**
- Click AI Assistant icon
- Ask questions in natural language
- Review AI responses
- Take suggested actions

## Predictive Maintenance

AI predicts component failures before they occur.

**Supported Predictions:**
- Battery failure
- Coolant system failure
- Brake wear
- Tyre replacement
- Engine overheating
- Transmission issues

**Setup:**
- Enable predictive maintenance in settings
- Review predictions daily
- Schedule proactive repairs

## Route Optimization

Optimize routes for efficiency and cost savings.

**Features:**
- Automatic route planning
- Traffic integration
- Fuel efficiency optimization
- Time estimation

**Usage:**
- Create route in dashboard
- Add waypoints
- Optimize route
- Share with drivers

## Driver Scorecards

Track and improve driver performance.

**Metrics:**
- Safety score
- Efficiency score
- Harsh braking
- Harsh acceleration
- Speeding incidents

**Setup:**
- Assign drivers to vehicles
- Enable behavior tracking
- Review scorecards weekly
- Provide feedback

## Custom Reports

Create tailored reports for your needs.

**Report Types:**
- Fleet health
- Fuel efficiency
- Maintenance summary
- Driver behavior
- Cost analysis
- Custom metrics

**Creation:**
- Go to Reports > Create Custom
- Select metrics
- Set date range
- Add filters
- Save and schedule
`,
    best_practices: `
# FleetNimble Best Practices

## Vehicle Management

**Regular Updates:**
- Keep vehicle information current
- Update odometer readings monthly
- Review vehicle status weekly

**OBD Device Care:**
- Check device connection regularly
- Update firmware when available
- Replace batteries annually
- Clean OBD port periodically

## Maintenance

**Preventive Maintenance:**
- Follow manufacturer schedules
- Use AI predictions proactively
- Address critical alerts immediately
- Keep detailed maintenance records

**Cost Management:**
- Track maintenance costs per vehicle
- Compare costs across fleet
- Identify high-cost vehicles
- Optimize maintenance schedules

## Driver Management

**Training:**
- Provide regular driver training
- Share scorecards with drivers
- Address behavior issues promptly
- Reward good performance

**Safety:**
- Monitor safety metrics closely
- Address speeding immediately
- Review harsh braking events
- Implement safety policies

## Data Management

**Regular Reviews:**
- Review dashboard daily
- Check alerts hourly
- Generate reports weekly
- Analyze trends monthly

**Data Quality:**
- Ensure accurate data entry
- Verify GPS tracking
- Check telemetry accuracy
- Report data issues promptly

## Security

**Access Control:**
- Use role-based permissions
- Review user access regularly
- Remove inactive users
- Enable two-factor authentication

**Data Protection:**
- Use strong passwords
- Enable data encryption
- Regular security audits
- Keep software updated
`,
  },

  support_articles: {
    integration_guide: `
# FleetNimble Integration Guide

## API Integration

FleetNimble provides REST APIs for custom integrations.

**Authentication:**
- JWT token required
- Token obtained via login endpoint
- Include in Authorization header

**Rate Limits:**
- Standard: 100 requests/minute
- Enterprise: Custom limits available
- Contact support for increases

## Webhooks

Configure webhooks for real-time notifications.

**Supported Events:**
- Alert triggered
- Vehicle status change
- Maintenance due
- Geofence entry/exit
- Trip completed

**Setup:**
1. Contact support
2. Provide webhook URL
3. Select event types
4. Test configuration
5. Monitor delivery

## Third-Party Integrations

**Supported Platforms:**
- ERP systems
- Accounting software
- Fuel card providers
- Insurance providers
- Dispatch systems

**Integration Process:**
1. Assess requirements
2. Design integration
3. Develop API client
4. Test thoroughly
5. Deploy to production
6. Monitor performance

## Custom Development

For custom development needs:

1. Review API documentation
2. Request API access
3. Use sandbox environment
4. Test thoroughly
5. Request production access
6. Deploy and monitor
`,
    security_guide: `
# FleetNimble Security Guide

## Data Security

**Encryption:**
- All data encrypted in transit
- Data encrypted at rest
- AES-256 encryption
- TLS 1.3 for communications

**Access Control:**
- Role-based permissions
- User authentication
- Session management
- Audit logging

## Account Security

**Best Practices:**
- Use strong passwords
- Enable two-factor authentication
- Review access logs regularly
- Update passwords periodically
- Report suspicious activity

**User Management:**
- Assign appropriate roles
- Remove inactive users
- Review permissions regularly
- Use least privilege principle

## API Security

**Authentication:**
- JWT token authentication
- Token expiration
- Refresh token rotation
- API key management

**Rate Limiting:**
- Request rate limits
- Burst protection
- IP-based restrictions
- User-based limits

## Compliance

**GDPR:**
- Data processing agreements
- Right to be forgotten
- Data portability
- Consent management

**SOC 2:**
- Security controls
- Availability monitoring
- Processing integrity
- Confidentiality
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

  // Search technical explanations
  for (const [question, answer] of Object.entries(KNOWLEDGE_BASE.technical_explanations)) {
    if (question.toLowerCase().includes(lowerQuery) || answer.toLowerCase().includes(lowerQuery)) {
      results.push({
        type: 'technical',
        question,
        answer,
      });
    }
  }

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

  // Search training guides
  for (const [guide, content] of Object.entries(KNOWLEDGE_BASE.training_guides)) {
    if (guide.toLowerCase().includes(lowerQuery) || content.toLowerCase().includes(lowerQuery)) {
      results.push({
        type: 'training_guide',
        guide,
        content,
      });
    }
  }

  // Search support articles
  for (const [article, content] of Object.entries(KNOWLEDGE_BASE.support_articles)) {
    if (article.toLowerCase().includes(lowerQuery) || content.toLowerCase().includes(lowerQuery)) {
      results.push({
        type: 'support_article',
        article,
        content,
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
    training_guides: Object.keys(KNOWLEDGE_BASE.training_guides),
    support_articles: Object.keys(KNOWLEDGE_BASE.support_articles),
  };
}

export default KNOWLEDGE_BASE;
