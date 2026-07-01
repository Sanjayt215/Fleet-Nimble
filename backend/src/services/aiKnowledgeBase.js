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
    'How do I manage drivers?': `
FleetNimble Driver Management helps track and optimize driver performance:

**Adding Drivers:**
1. Go to Drivers > Add Driver
2. Enter driver information:
   - Name
   - License number
   - Contact information
   - Assigned vehicle(s)
3. Save driver profile

**Driver Features:**
- Driver scorecards
- Behavior tracking
- Trip assignment
- Performance metrics
- Safety monitoring

**Driver Metrics:**
- Harsh braking events
- Harsh acceleration events
- Speeding incidents
- Idle time
- Fuel efficiency
- Safety score

**Best Practices:**
- Assign drivers to specific vehicles
- Review scorecards weekly
- Provide feedback on performance
- Reward safe driving behavior
- Address issues promptly
`,
    'How do I use the Dashboard?': `
The FleetNimble Dashboard provides a real-time overview of your fleet:

**Dashboard Sections:**
- Fleet Summary: Total vehicles, online/offline status
- Critical Alerts: High-priority notifications
- Maintenance Due: Upcoming service requirements
- Recent Activity: Latest events and updates
- Performance Metrics: Key fleet KPIs

**Customizing Dashboard:**
1. Click "Customize Dashboard"
2. Drag and drop widgets
3. Resize widgets as needed
4. Save layout

**Dashboard Widgets:**
- Vehicle status cards
- Alert counters
- Maintenance schedule
- Fuel efficiency charts
- GPS map view
- Driver scorecards

**Best Practices:**
- Check dashboard daily
- Set up custom views for different roles
- Use filters to focus on specific vehicles
- Monitor critical alerts immediately
`,
    'How do I manage user roles and permissions?': `
FleetNimble uses role-based access control (RBAC) for security:

**Available Roles:**
- **Admin**: Full access to all features and settings
- **Manager**: Access to fleet management, reports, and driver management
- **Driver**: Limited to assigned vehicle data and trip logging
- **Viewer**: Read-only access to fleet data

**Managing Roles:**
1. Go to Settings > User Management
2. Select user
3. Choose appropriate role
4. Save changes

**Permission Levels:**
- View vehicles
- Edit vehicles
- Delete vehicles
- View reports
- Generate reports
- Manage drivers
- Manage alerts
- System settings

**Best Practices:**
- Assign minimum required permissions
- Review access regularly
- Remove access for inactive users
- Use Manager role for supervisors
- Use Viewer role for stakeholders
`,
    'How do I configure Settings?': `
FleetNimble Settings allow you to customize the platform:

**Settings Categories:**
- Account Settings: Profile, company info, billing
- Fleet Settings: Vehicle defaults, maintenance schedules
- Alert Settings: Notification preferences, thresholds
- GPS Settings: Geofences, tracking intervals
- Integration Settings: API keys, webhooks
- Security Settings: 2FA, password policies

**Common Settings:**
- Alert thresholds (battery voltage, coolant temp)
- Maintenance intervals
- GPS update frequency
- Notification preferences
- Report scheduling

**Best Practices:**
- Review settings monthly
- Test alert thresholds
- Keep contact information updated
- Enable 2FA for security
- Configure backup notifications
`,
    'How do I use the mobile app?': `
The FleetNimble mobile app provides on-the-go fleet management:

**Mobile App Features:**
- Real-time vehicle tracking
- Live telemetry viewing
- Alert notifications
- Trip logging
- OBD device management
- GPS navigation

**Getting Started:**
1. Download app from App Store or Google Play
2. Log in with your FleetNimble account
3. Grant necessary permissions (location, Bluetooth)
4. Connect OBD device via Bluetooth
5. View your fleet data

**Mobile-Specific Features:**
- Push notifications for alerts
- Background GPS tracking
- Bluetooth OBD connection
- Offline mode (limited)
- Quick actions menu

**Best Practices:**
- Keep app updated
- Enable notifications
- Allow location access
- Connect to WiFi for large data syncs
- Use offline mode when needed
`,
    'How does VIN decoding work?': `
FleetNimble VIN decoding automatically identifies vehicle specifications:

**VIN Decoding Process:**
1. Enter 17-character VIN when adding vehicle
2. System queries VIN database
3. Vehicle specifications are populated automatically
4. Maintenance schedules are set based on manufacturer data

**Decoded Information:**
- Make, Model, Year
- Engine type and size
- Transmission type
- Fuel type
- Body style
- Manufacturing plant
- Model year

**Decoding Sources:**
- Manufacturer databases
- Third-party VIN services
- FleetNimble database

**Troubleshooting:**
- Ensure VIN is exactly 17 characters
- Check for typos
- Verify vehicle is in database
- Try manual entry if decoding fails
`,
    'Where can I see live telemetry?': `
Live telemetry provides real-time vehicle data:

**Accessing Live Telemetry:**
1. Go to Vehicles > select vehicle
2. Click "Live Diagnostics" tab
3. View real-time data

**Available Metrics:**
- Engine RPM
- Vehicle speed
- Coolant temperature
- Fuel level
- Battery voltage
- Engine load
- Throttle position
- Intake air temperature
- Mass air flow (MAF)

**Requirements:**
- OBD device connected
- Vehicle ignition ON
- Data connection active
- Mobile app paired or telematics device active

**Refresh Rate:**
- Real-time updates every 1-5 seconds
- Depends on connection type
- Configurable in settings
`,
    'How does engine standby work?': `
Engine Standby Mode monitors and manages engine state:

**How It Works:**
- Detects ignition ON/OFF state
- Tracks engine runtime
- Monitors engine hours
- Provides engine health insights

**Standby States:**
- **ENGINE_ON**: Engine running, vehicle operational
- **ENGINE_OFF**: Engine stopped, vehicle parked
- **STANDBY**: Low-power monitoring mode
- **UNKNOWN**: State not detected

**Benefits:**
- Prevents unauthorized engine use
- Tracks engine hours for maintenance
- Monitors idle time
- Provides engine health data

**Configuration:**
- Set standby delay
- Configure idle thresholds
- Enable/disable standby mode
- Set notification preferences
`,
    'How do I use GPS Tracking?': `
GPS Tracking provides real-time vehicle location:

**Accessing GPS:**
1. Go to GPS Tracking in dashboard
2. View all vehicles on map
3. Click vehicle for details

**GPS Features:**
- Real-time location
- Historical routes
- Geofence alerts
- Speed tracking
- Trip replay
- Location sharing

**Map Views:**
- Satellite view
- Street view
- Terrain view
- Custom markers

**Geofencing:**
- Create virtual boundaries
- Get entry/exit alerts
- Monitor zone compliance
- Set time-based rules

**Best Practices:**
- Set up geofences for key locations
- Review GPS history regularly
- Use geofence alerts for security
- Monitor route efficiency
`,
    'How do I manage alerts?': `
FleetNimble Alerts notify you of important fleet events:

**Alert Types:**
- Critical: Immediate attention required
- High: Urgent attention needed
- Medium: Attention recommended
- Low: Informational

**Alert Categories:**
- Battery voltage
- Coolant temperature
- Engine issues
- Fuel level
- GPS events
- Maintenance due
- DTC codes
- Geofence events

**Managing Alerts:**
1. Go to Alerts in dashboard
2. Filter by severity or type
3. Click alert for details
4. Mark as read or dismiss
5. Take recommended action

**Notification Channels:**
- In-app notifications
- Email alerts
- SMS alerts (if enabled)
- Push notifications (mobile)

**Best Practices:**
- Review critical alerts immediately
- Set appropriate thresholds
- Configure notification preferences
- Keep contact information updated
- Use alert history for analysis
`,
    'How do I manage fuel?': `
FleetNimble Fuel Management tracks fuel consumption and efficiency:

**Fuel Tracking:**
- Automatic fuel level monitoring
- Manual fuel log entries
- Fuel cost tracking
- Efficiency calculations
- Refuel reminders

**Accessing Fuel Data:**
1. Go to Vehicles > select vehicle
2. Click "Fuel" tab
3. View fuel history and efficiency

**Fuel Metrics:**
- Current fuel level (%)
- Fuel consumption (L/100km or MPG)
- Fuel cost per km/mile
- Refuel history
- Efficiency trends

**Best Practices:**
- Log refuels accurately
- Monitor efficiency trends
- Set low fuel alerts
- Compare vehicles
- Identify inefficient vehicles
`,
    'How do I manage maintenance?': `
FleetNimble Maintenance Management keeps your fleet in top condition:

**Maintenance Types:**
- Preventive maintenance
- Corrective maintenance
- Predictive maintenance (AI-powered)
- Scheduled service

**Creating Maintenance Logs:**
1. Go to Maintenance > Add Log
2. Select vehicle
3. Enter service type
4. Set due date or mileage
5. Add notes and cost
6. Save

**Maintenance Features:**
- Service reminders
- Maintenance history
- Cost tracking
- Vendor management
- Work order integration

**Best Practices:**
- Follow manufacturer schedules
- Use AI predictions proactively
- Track all maintenance costs
- Keep detailed records
- Schedule preventive maintenance
`,
    'How do I use the AI Assistant?': `
The FleetNimble AI Assistant answers questions about your fleet:

**Accessing AI Assistant:**
1. Click AI Assistant icon in dashboard
2. Type your question in natural language
3. Review AI response
4. Take suggested actions

**What You Can Ask:**
- Fleet health summary
- Vehicle-specific questions
- Maintenance status
- Alert information
- GPS location queries
- DTC code explanations
- Fuel efficiency
- Driver performance
- Platform help

**AI Features:**
- Natural language processing
- Context-aware responses
- Follow-up question support
- Suggested actions
- Real-time data integration

**Best Practices:**
- Be specific in your questions
- Use vehicle names when possible
- Review suggested actions
- Provide feedback on responses
- Use for quick insights
`,
    'How do I access Admin features?': `
Admin features provide full system control:

**Admin Capabilities:**
- User management
- Role assignment
- Company settings
- Billing management
- System configuration
- Audit logs
- API management

**Accessing Admin:**
1. Go to Settings > Admin
2. Requires Admin role
3. Navigate to desired section

**Admin Tasks:**
- Add/remove users
- Assign roles
- Configure company settings
- Manage subscriptions
- View audit logs
- Configure integrations
- Set up webhooks

**Best Practices:**
- Review audit logs regularly
- Use least privilege principle
- Monitor user access
- Keep software updated
- Test configuration changes
`,
    'How do I troubleshoot common issues?': `
Common FleetNimble issues and solutions:

**Vehicle Not Showing Data:**
- Check OBD device connection
- Verify ignition is ON
- Ensure data connection is active
- Restart mobile app
- Check device battery

**GPS Not Updating:**
- Enable GPS in device settings
- Ensure clear view of sky
- Check data connection
- Verify GPS is enabled in app
- Restart device

**Alerts Not Received:**
- Check notification settings
- Verify contact information
- Check alert thresholds
- Ensure app notifications are enabled
- Test alert system

**Data Sync Issues:**
- Check internet connection
- Verify server status
- Clear app cache
- Update app to latest version
- Re-authenticate if needed

**Performance Issues:**
- Check device specifications
- Close other apps
- Update app
- Clear cache
- Contact support if persistent
`,
    'How does live diagnostics work?': `
Live Diagnostics provides real-time vehicle health monitoring:

**Accessing Live Diagnostics:**
1. Go to Vehicles > select vehicle
2. Click "Live Diagnostics" tab
3. View real-time data

**Diagnostic Data:**
- Engine parameters (RPM, load, temp)
- Fuel system (level, pressure)
- Electrical system (voltage, charging)
- Emissions data
- Transmission status
- Brake system status

**Diagnostic Features:**
- Real-time gauges
- Graph displays
- Threshold alerts
- Historical comparison
- DTC code display

**Requirements:**
- OBD-II compatible vehicle
- Connected OBD device
- Ignition ON
- Data connection

**Best Practices:**
- Monitor parameters regularly
- Set appropriate thresholds
- Review trends over time
- Address issues promptly
- Use for preventive maintenance
`,
    'How do I generate reports?': `
Generate comprehensive fleet reports:

**Report Types:**
- Fleet Overview
- Vehicle Health
- Fuel Efficiency
- Driver Behavior
- Maintenance Summary
- Alert History
- GPS Tracking
- Custom Reports

**Generating Reports:**
1. Go to Reports
2. Select report type
3. Choose date range
4. Filter by vehicle(s)
5. Click "Generate"

**Report Options:**
- Export formats (PDF, Excel, CSV)
- Scheduled reports
- Email delivery
- Custom filters
- Comparison views

**Best Practices:**
- Generate reports weekly/monthly
- Compare trends over time
- Use for decision making
- Share with stakeholders
- Schedule automated reports
`,
    'How do I add a driver?': `
Add drivers to your fleet for tracking and management:

**Adding a Driver:**
1. Go to Drivers > Add Driver
2. Enter driver information:
   - Full name
   - License number
   - Phone number
   - Email address
3. Assign vehicle(s)
4. Set role (if applicable)
5. Save driver profile

**Driver Features:**
- Scorecard tracking
- Behavior monitoring
- Trip assignment
- Performance metrics
- Safety alerts

**Best Practices:**
- Assign drivers to specific vehicles
- Keep license information current
- Review driver performance regularly
- Provide feedback on behavior
- Use scorecards for coaching
`,
    'How do I schedule maintenance?': `
Schedule preventive maintenance for your fleet:

**Creating Maintenance Schedule:**
1. Go to Maintenance > Schedule
2. Select vehicle
3. Choose maintenance type:
   - Oil change
   - Tire rotation
   - Brake inspection
   - Fluid check
   - Custom service
4. Set due date or mileage
5. Add notes
6. Save schedule

**Maintenance Reminders:**
- Automatic notifications
- Email alerts
- In-app reminders
- Custom lead time

**Best Practices:**
- Follow manufacturer schedules
- Set reminders in advance
- Track maintenance costs
- Keep detailed records
- Use AI predictions
`,
    'How do I check DTC codes?': `
Check and manage DTC (Diagnostic Trouble Codes):

**Viewing DTC Codes:**
1. Go to Vehicles > select vehicle
2. Click "Diagnostics" tab
3. View active DTC codes

**DTC Information:**
- Code number (e.g., P0300)
- Description
- Severity level
- Detection date
- Status (active/cleared)

**Managing DTC Codes:**
- View code details
- Get explanation
- Check severity
- Clear codes (after repair)
- View code history

**Common DTC Codes:**
- P0300: Random misfire
- P0171: System too lean
- P0420: Catalyst efficiency
- P0700: Transmission malfunction

**Best Practices:**
- Address critical codes immediately
- Clear codes only after repair
- Keep code history for analysis
- Use for preventive maintenance
`,
    'How do I create a new vehicle?': `
Add a new vehicle to your fleet:

**Adding a Vehicle:**
1. Go to Vehicles > Add Vehicle
2. Enter vehicle details:
   - Make (e.g., Toyota)
   - Model (e.g., Camry)
   - Year
   - VIN (17-character code)
   - License plate
   - Odometer reading
3. Upload photo (optional)
4. Add notes (optional)
5. Save vehicle

**VIN Benefits:**
- Automatic specification decoding
- Manufacturer maintenance schedules
- Accurate parts identification
- Enhanced diagnostics

**After Adding:**
- Connect OBD device
- Verify data connection
- Check live telemetry
- Set up alerts
- Schedule maintenance

**Best Practices:**
- Always include VIN if available
- Keep odometer current
- Add vehicle photo
- Set appropriate alerts
- Connect OBD device
`,
    'How do I connect the OBD device?': `
Connect FleetNimble OBD device to your vehicle:

**Connection Steps:**
1. Locate OBD-II port (under dashboard, driver's side)
2. Plug in FleetNimble OBD adapter
3. Turn vehicle ignition to ON
4. Enable Bluetooth on mobile device
5. Open FleetNimble mobile app
6. Go to Settings > Add Vehicle > Connect OBD
7. Select device from Bluetooth list
8. Pair device (PIN: 1234 or 0000)
9. Wait for connection confirmation

**Troubleshooting:**
- Device not found: Check Bluetooth, ensure ignition ON
- Connection fails: Restart app, try again
- Check OBD port for debris
- Verify device is powered
- Try different OBD adapter

**Best Practices:**
- Ensure vehicle is OBD-II compatible
- Keep device charged
- Check connection regularly
- Update device firmware
- Use in vehicles with good reception
`,
    'Where can I see live data?': `
View live vehicle data in real-time:

**Accessing Live Data:**
1. Go to Vehicles > select vehicle
2. Click "Live Diagnostics" tab
3. View real-time metrics

**Live Data Includes:**
- Engine RPM
- Vehicle speed
- Coolant temperature
- Fuel level
- Battery voltage
- Engine load
- Throttle position
- GPS location
- Ignition status

**Requirements:**
- OBD device connected
- Vehicle ignition ON
- Data connection active
- Mobile app or telematics device

**Refresh Rate:**
- Updates every 1-5 seconds
- Depends on connection type
- Configurable in settings

**Best Practices:**
- Monitor during operation
- Check for abnormal values
- Use for diagnostics
- Set up alerts for thresholds
- Review historical trends
`,
    'Why is RPM not updating?': `
RPM not updating - common causes and solutions:

**Common Causes:**
- OBD device not connected
- Vehicle ignition OFF
- Bluetooth connection lost
- Data connection issue
- Sensor malfunction
- App not refreshing

**Solutions:**
1. Check OBD device connection
2. Ensure ignition is ON
3. Verify Bluetooth is connected
4. Check data connection (WiFi/cellular)
5. Restart mobile app
6. Check vehicle RPM sensor

**Testing:**
- Rev engine to see if RPM changes
- Check other parameters (speed, temp)
- Try different OBD adapter
- Verify vehicle is OBD-II compatible

**If Issue Persists:**
- Check vehicle manual for sensor location
- Consult mechanic for sensor testing
- Try different vehicle
- Contact FleetNimble support
`,
    'Why is GPS not showing?': `
GPS not displaying - troubleshooting steps:

**Common Causes:**
- GPS disabled in device settings
- No clear view of sky
- Data connection issue
- GPS hardware not available
- App permission denied
- Device in airplane mode

**Solutions:**
1. Enable GPS in device settings
2. Ensure clear view of sky (no buildings/trees)
3. Check data connection
4. Grant location permission to app
5. Disable airplane mode
6. Restart device

**GPS Sources:**
- Built-in GPS (OBD adapter)
- Mobile device GPS
- Telematics device GPS

**Testing:**
- Open maps app to verify GPS works
- Check GPS signal strength in settings
- Try outdoor location
- Test with different device

**If Issue Persists:**
- Check GPS hardware
- Verify telematics device
- Contact support
`,
    'Why did VIN decode fail?': `
VIN decoding failure - causes and solutions:

**Common Causes:**
- Invalid VIN format (not 17 characters)
- Typo in VIN
- VIN not in database
- Network connection issue
- Database service down

**Solutions:**
1. Verify VIN is exactly 17 characters
2. Check for typos (O vs 0, I vs 1)
3. Ensure VIN is from supported region
4. Check internet connection
5. Try manual entry

**VIN Format:**
- Characters 1-3: Manufacturer
- Characters 4-9: Vehicle attributes
- Character 10: Model year
- Characters 12-17: Serial number

**If Decoding Fails:**
- Enter vehicle details manually
- Contact manufacturer for specifications
- Try again later (service may be down)
- Use VIN decoder tool online

**Best Practices:**
- Always verify VIN from vehicle
- Check VIN on registration documents
- Use VIN from dashboard (visible through windshield)
`,
    'How do I check battery status?': `
Check vehicle battery status and health:

**Viewing Battery Status:**
1. Go to Vehicles > select vehicle
2. Click "Live Diagnostics" tab
3. View battery voltage

**Battery Metrics:**
- Current voltage (V)
- Voltage trend
- Battery protection mode
- Last charge status
- Battery health estimate

**Voltage Ranges:**
- 12.6V+: Fully charged
- 12.0-12.5V: Partially charged
- Below 12.0V: Low charge
- Below 11.5V: Critical

**Battery Protection:**
- Automatic standby at low voltage
- Configurable thresholds
- Wake-up monitoring
- Health tracking

**Best Practices:**
- Monitor voltage regularly
- Set low voltage alerts
- Enable battery protection
- Replace batteries proactively
- Check charging system
`,
    'How do I check fuel status?': `
Check vehicle fuel level and efficiency:

**Viewing Fuel Status:**
1. Go to Vehicles > select vehicle
2. Click "Fuel" tab
3. View fuel data

**Fuel Metrics:**
- Current fuel level (%)
- Estimated range
- Fuel consumption (L/100km)
- Fuel cost per km
- Refuel history
- Efficiency trends

**Fuel Tracking:**
- Automatic level monitoring
- Manual refuel logging
- Cost tracking
- Efficiency calculations

**Best Practices:**
- Log refuels accurately
- Monitor efficiency trends
- Set low fuel alerts
- Compare vehicles
- Identify inefficient vehicles
- Plan refueling routes
`,
    'How do I view maintenance history?': `
View vehicle maintenance records:

**Accessing Maintenance History:**
1. Go to Vehicles > select vehicle
2. Click "Maintenance" tab
3. View maintenance logs

**Maintenance Information:**
- Service type
- Date performed
- Cost
- Notes
- Performed by
- Parts used

**Filtering History:**
- By date range
- By service type
- By cost
- By vendor

**Export Options:**
- PDF report
- Excel spreadsheet
- CSV export

**Best Practices:**
- Keep detailed records
- Track all costs
- Review history regularly
- Use for warranty claims
- Plan future maintenance
`,
    'How do I view GPS history?': `
View historical GPS location data:

**Accessing GPS History:**
1. Go to GPS Tracking
2. Select vehicle
3. Choose date range
4. View route history

**GPS History Features:**
- Route replay
- Speed analysis
- Stop detection
- Geofence events
- Trip timeline

**Date Range Options:**
- Today
- Yesterday
- Last 7 days
- Last 30 days
- Custom range

**Export Options:**
- Route export (GPX/KML)
- Report generation
- Data export (CSV)

**Best Practices:**
- Review routes regularly
- Analyze efficiency
- Monitor compliance
- Use for planning
- Check geofence events
`,
    'How do I view DTC history?': `
View historical DTC code records:

**Accessing DTC History:**
1. Go to Vehicles > select vehicle
2. Click "Diagnostics" tab
3. View DTC history

**DTC History Information:**
- Code number
- Description
- Detection date
- Cleared date
- Severity
- Status

**Filtering Options:**
- By date range
- By severity
- By status (active/cleared)
- By code type

**Analysis:**
- Recurring codes
- Code frequency
- Severity trends
- Resolution tracking

**Best Practices:**
- Track recurring codes
- Monitor severity trends
- Document resolutions
- Use for preventive maintenance
- Analyze patterns
`,
    'How do I view trips this week?': `
View trip data for the current week:

**Accessing Trip Data:**
1. Go to Vehicles > select vehicle
2. Click "Trips" tab
3. Filter by "This Week"

**Trip Information:**
- Start/end time
- Start/end location
- Distance traveled
- Duration
- Average speed
- Fuel used
- Driver (if assigned)

**Trip Analysis:**
- Total distance
- Total fuel used
- Average efficiency
- Trip frequency
- Route patterns

**Export Options:**
- Trip report
- Route export
- Data export

**Best Practices:**
- Review trips weekly
- Analyze efficiency
- Monitor driver behavior
- Plan routes
- Identify patterns
`,
    'How do I compare vehicles?': `
Compare multiple vehicles side-by-side:

**Vehicle Comparison:**
1. Go to Vehicles
2. Select multiple vehicles (checkboxes)
3. Click "Compare"
4. View comparison

**Comparison Metrics:**
- Fuel efficiency
- Maintenance costs
- Driver scores
- Alert frequency
- DTC codes
- Mileage
- Age

**Visualization:**
- Bar charts
- Line graphs
- Tables
- Heat maps

**Best Practices:**
- Compare similar vehicles
- Use for fleet decisions
- Identify outliers
- Optimize fleet composition
- Track performance trends
`,
    'How do I create a work order?': `
Create work orders for vehicle repairs and maintenance:

**Creating Work Order:**
1. Go to Maintenance > Work Orders
2. Click "Create Work Order"
3. Select vehicle
4. Enter description
5. Set priority (Low/Medium/High/Critical)
6. Assign to technician
7. Set due date
8. Save work order

**Work Order Features:**
- Status tracking (Open/In Progress/Completed)
- Priority levels
- Assignment management
- Cost tracking
- Notes and attachments
- Completion confirmation

**Best Practices:**
- Be specific in descriptions
- Set appropriate priorities
- Assign to qualified technicians
- Track completion status
- Document costs
- Review regularly
`,
    'How do I generate an executive report?': `
Generate executive-level fleet reports:

**Executive Report Contents:**
- Fleet overview summary
- Key performance indicators
- Cost analysis
- Risk assessment
- Recommendations
- Trends and insights

**Generating Report:**
1. Go to Reports > Executive
2. Select date range
3. Choose metrics to include
4. Select format (PDF/Presentation)
5. Click "Generate"

**Customization:**
- Include/exclude sections
- Add company branding
- Select KPIs
- Add commentary
- Choose visualization style

**Best Practices:**
- Generate monthly/quarterly
- Include actionable insights
- Use for stakeholder meetings
- Track trends over time
- Share with leadership
`,
    'How do I view offline vehicles?': `
View vehicles that are currently offline:

**Accessing Offline Vehicles:**
1. Go to Vehicles
2. Filter by status: "Offline"
3. View offline vehicle list

**Offline Vehicle Information:**
- Vehicle name and plate
- Last online timestamp
- Last known location
- Time offline
- Possible reasons

**Common Offline Reasons:**
- OBD device disconnected
- Vehicle ignition OFF
- Data connection lost
- Device battery dead
- Out of coverage area

**Actions:**
- Send notification
- Check device status
- Investigate issue
- Schedule maintenance

**Best Practices:**
- Monitor offline vehicles daily
- Investigate prolonged offline status
- Set up offline alerts
- Track offline patterns
`,
    'Which vehicle should I repair first?': `
AI-powered repair priority recommendations:

**Repair Priority Factors:**
- Critical alerts
- Safety concerns
- DTC code severity
- Maintenance overdue
- Vehicle importance
- Cost of inaction

**Viewing Repair Priority:**
1. Go to AI Assistant
2. Ask: "Which vehicle should I repair first?"
3. Review AI recommendations
4. Check suggested actions

**Priority Levels:**
- **Critical**: Immediate repair required
- **High**: Repair within 24-48 hours
- **Medium**: Repair within week
- **Low**: Schedule when convenient

**Best Practices:**
- Address critical issues immediately
- Consider vehicle usage
- Factor in repair costs
- Plan repairs efficiently
- Use AI predictions proactively
`,
    'Which vehicle is likely to fail next?': `
AI-powered failure prediction:

**Failure Prediction Factors:**
- Historical failure patterns
- Current sensor data
- Maintenance history
- Age and mileage
- Environmental factors
- Usage patterns

**Viewing Predictions:**
1. Go to AI Assistant
2. Ask: "Which vehicle is likely to fail next?"
3. Review AI predictions
4. Check confidence levels

**Predicted Failures:**
- Battery failure
- Coolant system failure
- Brake wear
- Tire replacement
- Engine overheating
- Transmission issues

**Best Practices:**
- Review predictions daily
- Address high-risk vehicles
- Schedule preventive maintenance
- Monitor predicted components
- Track prediction accuracy
`,
    'How do I show vehicles offline for more than 3 days?': `
Filter vehicles by offline duration:

**Filtering by Offline Duration:**
1. Go to Vehicles
2. Click "Advanced Filters"
3. Set "Offline for more than X days"
4. Enter "3"
5. Apply filter

**Offline Duration Information:**
- Vehicle name
- Days offline
- Last online date
- Last known location
- Possible reasons

**Actions:**
- Contact driver
- Check device status
- Schedule investigation
- Update vehicle status

**Best Practices:**
- Monitor offline duration
- Set up alerts for extended offline
- Investigate patterns
- Update vehicle status when back online
`,
    'Which vehicles have battery low and maintenance due?': `
Filter vehicles by multiple conditions:

**Multi-Condition Filtering:**
1. Go to Vehicles
2. Click "Advanced Filters"
3. Add condition: "Battery voltage < 12V"
4. Add condition: "Maintenance due"
5. Apply filters

**Viewing Results:**
- Vehicle list matching all conditions
- Battery voltage levels
- Maintenance due dates
- Priority assessment

**Actions:**
- Address battery issues first
- Schedule maintenance
- Assign priority
- Create work orders

**Best Practices:**
- Use multi-condition filters for complex queries
- Address critical conditions first
- Document actions taken
- Monitor resolution
`,
    'How do I show Honda Amaze?': `
View specific vehicle details:

**Finding a Vehicle:**
1. Go to Vehicles
2. Search by name: "Honda Amaze"
3. Click vehicle to view details

**Vehicle Details Include:**
- Basic information (make, model, year)
- Specifications
- Current status
- Live telemetry
- Maintenance history
- Alert history
- GPS location

**Alternative Methods:**
- Use AI Assistant: "Show Honda Amaze"
- Filter by make/model
- Search by license plate
- Search by VIN

**Best Practices:**
- Use descriptive vehicle names
- Keep vehicle information current
- Check status regularly
- Monitor alerts
`,
    'What about its battery?': `
Follow-up question about previously mentioned vehicle:

**Context Understanding:**
The AI Assistant remembers the last vehicle you asked about and can answer follow-up questions using pronouns like "it", "its", "this", "that".

**Example Conversation:**
- User: "Show Honda Amaze"
- AI: Shows Honda Amaze details
- User: "What about its battery?"
- AI: Shows Honda Amaze battery status

**Supported Pronouns:**
- "it" / "its"
- "this" / "that"
- "the vehicle"

**Best Practices:**
- Use pronouns for natural conversation
- AI maintains context during session
- Context resets when starting new chat
- Be specific if context is unclear
`,
    'Compare it with Mazda 3': `
Compare two vehicles:

**Vehicle Comparison:**
1. Ask AI: "Compare Honda Amaze with Mazda 3"
2. AI provides side-by-side comparison
3. Review comparison metrics

**Comparison Metrics:**
- Fuel efficiency
- Maintenance costs
- Age and mileage
- Alert frequency
- DTC codes
- Performance data

**Visualization:**
- Table format
- Highlighted differences
- Recommendations
- Suggested actions

**Best Practices:**
- Compare similar vehicle types
- Use for fleet decisions
- Consider total cost of ownership
- Factor in usage patterns
- Review recommendations
`,
    'How do I generate a report?': `
Generate various types of fleet reports:

**Report Types:**
- Fleet Overview
- Vehicle Health
- Fuel Efficiency
- Driver Behavior
- Maintenance Summary
- Alert History
- GPS Tracking
- Custom Reports

**Generating Reports:**
1. Go to Reports
2. Select report type
3. Choose date range
4. Filter by vehicle(s)
5. Click "Generate"

**Report Options:**
- Export formats (PDF, Excel, CSV)
- Scheduled reports
- Email delivery
- Custom filters
- Comparison views

**Best Practices:**
- Generate reports regularly
- Compare trends over time
- Use for decision making
- Share with stakeholders
- Schedule automated reports
`,
    'How do I schedule maintenance?': `
Schedule preventive maintenance:

**Creating Maintenance Schedule:**
1. Go to Maintenance > Schedule
2. Select vehicle
3. Choose maintenance type
4. Set due date or mileage
5. Add notes
6. Save schedule

**Maintenance Types:**
- Oil change
- Tire rotation
- Brake inspection
- Fluid check
- Battery check
- Custom service

**Reminders:**
- Automatic notifications
- Email alerts
- In-app reminders
- Custom lead time

**Best Practices:**
- Follow manufacturer schedules
- Set reminders in advance
- Track maintenance costs
- Keep detailed records
- Use AI predictions
`,
    'How do I add a driver?': `
Add a driver to your fleet:

**Adding a Driver:**
1. Go to Drivers > Add Driver
2. Enter driver information:
   - Full name
   - License number
   - Phone number
   - Email address
3. Assign vehicle(s)
4. Set role
5. Save driver profile

**Driver Features:**
- Scorecard tracking
- Behavior monitoring
- Trip assignment
- Performance metrics
- Safety alerts

**Best Practices:**
- Assign drivers to specific vehicles
- Keep license information current
- Review driver performance regularly
- Provide feedback on behavior
- Use scorecards for coaching
`,
    'How do I check DTC codes?': `
Check and manage DTC codes:

**Viewing DTC Codes:**
1. Go to Vehicles > select vehicle
2. Click "Diagnostics" tab
3. View active DTC codes

**DTC Information:**
- Code number
- Description
- Severity level
- Detection date
- Status

**Managing DTC Codes:**
- View code details
- Get explanation
- Check severity
- Clear codes (after repair)
- View code history

**Common DTC Codes:**
- P0300: Random misfire
- P0171: System too lean
- P0420: Catalyst efficiency
- P0700: Transmission malfunction

**Best Practices:**
- Address critical codes immediately
- Clear codes only after repair
- Keep code history for analysis
- Use for preventive maintenance
`,
    'How do I create a work order for Honda Amaze?': `
Create a work order for a specific vehicle:

**Creating Work Order:**
1. Ask AI: "Create work order for Honda Amaze"
2. AI confirms vehicle
3. Provide issue description
4. Set priority
5. Confirm creation

**Work Order Details:**
- Vehicle: Honda Amaze
- Description: (you provide)
- Priority: (you select)
- Assigned to: (you select)
- Due date: (you select)

**Confirmation Flow:**
- AI asks for confirmation
- You confirm with "Yes"
- Work order is created
- AI provides confirmation

**Best Practices:**
- Be specific in description
- Set appropriate priority
- Assign to qualified technician
- Confirm before creation
- Track completion status
`,
    'How do I confirm work order creation?': `
Confirm work order creation:

**Confirmation Process:**
1. AI asks: "Create work order for Honda Amaze - Battery inspection. Confirm?"
2. You respond: "Yes"
3. AI creates work order
4. AI provides confirmation with work order ID

**Confirmation Responses:**
- "Yes" - Create work order
- "No" - Cancel
- "Change description" - Modify details

**After Confirmation:**
- Work order is created in system
- Assigned technician is notified
- Work order appears in maintenance list
- You can track status

**Best Practices:**
- Review details before confirming
- Be specific in descriptions
- Set appropriate priority
- Track completion status
- Document resolution
`,
    'How do I show Honda Amaze battery history?': `
View historical battery data for a vehicle:

**Accessing Battery History:**
1. Ask AI: "Show Honda Amaze battery history"
2. AI retrieves historical data
3. View battery voltage trends

**Battery History Includes:**
- Voltage readings over time
- Voltage trends
- Low voltage events
- Battery protection events
- Charging status

**Date Range Options:**
- Today
- Yesterday
- Last 7 days
- Last 30 days
- Custom range

**Analysis:**
- Voltage trends
- Degradation patterns
- Charging behavior
- Protection mode activation

**Best Practices:**
- Monitor battery health regularly
- Review trends over time
- Address degradation early
- Use for replacement planning
- Track protection events
`,
    'How do I explain P0700?': `
Get explanation for specific DTC code:

**P0700 Code Explanation:**
- **Code**: P0700
- **Description**: Transmission Control System Malfunction
- **Severity**: High
- **System**: Transmission

**What It Means:**
- The transmission control system has detected a malfunction
- Generic code indicating a transmission issue
- Specific codes may provide more detail

**Possible Causes:**
- Transmission fluid low or dirty
- Transmission sensor failure
- Wiring issues
- TCM (Transmission Control Module) failure
- Internal transmission problem

**Recommended Actions:**
- Check transmission fluid level
- Scan for additional transmission codes
- Inspect wiring and connectors
- Consult transmission specialist
- Avoid driving if severe

**Best Practices:**
- Address transmission issues promptly
- Check for additional codes
- Document symptoms
- Consult professional mechanic
- Avoid further damage
`,
    'How do I show vehicles needing maintenance?': `
View vehicles with maintenance due:

**Accessing Maintenance Due:**
1. Go to Maintenance
2. Filter by status: "Due" or "Overdue"
3. View vehicle list

**Maintenance Information:**
- Vehicle name
- Maintenance type
- Due date or mileage
- Priority level
- Days/mileage overdue

**Sorting Options:**
- By due date
- By priority
- By vehicle
- By maintenance type

**Actions:**
- Schedule maintenance
- Create work order
- Mark as completed
- Update due date

**Best Practices:**
- Review maintenance due weekly
- Address overdue items first
- Schedule preventive maintenance
- Track maintenance costs
- Use AI predictions
`,
    'How do I show critical alerts?': `
View critical alerts requiring immediate attention:

**Accessing Critical Alerts:**
1. Go to Alerts
2. Filter by severity: "Critical"
3. View critical alert list

**Critical Alert Types:**
- Battery voltage critical
- Engine overheating
- Coolant temperature high
- Fuel level critical
- DTC codes critical
- Safety-related alerts

**Alert Information:**
- Vehicle name
- Alert type
- Severity
- Timestamp
- Current value
- Threshold

**Actions:**
- Acknowledge alert
- View vehicle details
- Create work order
- Contact driver
- Take immediate action

**Best Practices:**
- Monitor critical alerts immediately
- Set up push notifications
- Address issues promptly
- Document actions taken
- Review alert patterns
`,
    'How do I show vehicle details?': `
View comprehensive vehicle information:

**Accessing Vehicle Details:**
1. Go to Vehicles
2. Select vehicle
3. View all details

**Vehicle Information:**
- Basic info (make, model, year, VIN)
- Specifications
- Current status
- Live telemetry
- Maintenance history
- Alert history
- GPS location
- DTC codes
- Trip history

**Tabs Available:**
- Overview
- Live Diagnostics
- Maintenance
- Alerts
- GPS
- Trips
- History

**Best Practices:**
- Review vehicle details regularly
- Monitor status changes
- Check alerts promptly
- Track maintenance
- Analyze trends
`,
    'How do I show offline vehicles?': `
View vehicles currently offline:

**Accessing Offline Vehicles:**
1. Go to Vehicles
2. Filter by status: "Offline"
3. View offline vehicle list

**Offline Vehicle Information:**
- Vehicle name
- Last online timestamp
- Last known location
- Time offline
- Possible reasons

**Common Offline Reasons:**
- OBD device disconnected
- Vehicle ignition OFF
- Data connection lost
- Device battery dead
- Out of coverage area

**Actions:**
- Send notification
- Check device status
- Investigate issue
- Schedule maintenance

**Best Practices:**
- Monitor offline vehicles daily
- Investigate prolonged offline status
- Set up offline alerts
- Track offline patterns
`,
    'How do I show standby vehicles?': `
View vehicles in standby mode:

**Accessing Standby Vehicles:**
1. Go to Vehicles
2. Filter by status: "Standby"
3. View standby vehicle list

**Standby Vehicle Information:**
- Vehicle name
- Standby duration
- Last engine off time
- Battery status
- Reason for standby

**Standby Mode:**
- Low-power monitoring
- Battery protection active
- Periodic wake-up checks
- Reduced data transmission

**Actions:**
- Wake up vehicle
- Check battery status
- Review standby patterns
- Adjust standby settings

**Best Practices:**
- Monitor standby duration
- Check battery health
- Review standby patterns
- Configure appropriate thresholds
- Optimize standby settings
`,
    'How do I show fuel history?': `
View historical fuel data:

**Accessing Fuel History:**
1. Go to Vehicles > select vehicle
2. Click "Fuel" tab
3. View fuel history

**Fuel History Includes:**
- Fuel level over time
- Refuel events
- Fuel consumption trends
- Cost tracking
- Efficiency calculations

**Date Range Options:**
- Today
- Yesterday
- Last 7 days
- Last 30 days
- Custom range

**Analysis:**
- Consumption trends
- Efficiency patterns
- Cost analysis
- Refuel patterns

**Best Practices:**
- Log refuels accurately
- Monitor efficiency trends
- Analyze consumption patterns
- Track costs
- Identify inefficiencies
`,
    'How do I show telemetry history?': `
View historical telemetry data:

**Accessing Telemetry History:**
1. Go to Vehicles > select vehicle
2. Click "History" tab
3. View telemetry history

**Telemetry History Includes:**
- RPM over time
- Speed trends
- Temperature history
- Fuel level history
- Battery voltage history
- Engine load trends

**Date Range Options:**
- Today
- Yesterday
- Last 7 days
- Last 30 days
- Custom range

**Analysis:**
- Performance trends
- Anomaly detection
- Pattern recognition
- Comparison with norms

**Best Practices:**
- Review trends regularly
- Identify anomalies
- Compare with norms
- Use for preventive maintenance
- Track performance
`,
    'How do I show maintenance history?': `
View historical maintenance records:

**Accessing Maintenance History:**
1. Go to Vehicles > select vehicle
2. Click "Maintenance" tab
3. View maintenance history

**Maintenance History Includes:**
- Service type
- Date performed
- Cost
- Notes
- Performed by
- Parts used

**Filtering Options:**
- By date range
- By service type
- By cost
- By vendor

**Export Options:**
- PDF report
- Excel spreadsheet
- CSV export

**Best Practices:**
- Keep detailed records
- Track all costs
- Review history regularly
- Use for warranty claims
- Plan future maintenance
`,
    'How do I show alert history?': `
View historical alert records:

**Accessing Alert History:**
1. Go to Vehicles > select vehicle
2. Click "Alerts" tab
3. View alert history

**Alert History Includes:**
- Alert type
- Severity
- Timestamp
- Value
- Threshold
- Status

**Filtering Options:**
- By date range
- By severity
- By alert type
- By status

**Analysis:**
- Alert frequency
- Severity trends
- Recurring alerts
- Pattern recognition

**Best Practices:**
- Review alert history regularly
- Identify recurring issues
- Address patterns
- Monitor severity trends
- Document resolutions
`,
    'How do I show GPS history?': `
View historical GPS location data:

**Accessing GPS History:**
1. Go to GPS Tracking
2. Select vehicle
3. Choose date range
4. View route history

**GPS History Features:**
- Route replay
- Speed analysis
- Stop detection
- Geofence events
- Trip timeline

**Date Range Options:**
- Today
- Yesterday
- Last 7 days
- Last 30 days
- Custom range

**Export Options:**
- Route export (GPX/KML)
- Report generation
- Data export (CSV)

**Best Practices:**
- Review routes regularly
- Analyze efficiency
- Monitor compliance
- Use for planning
- Check geofence events
`,
    'How do I show DTC history?': `
View historical DTC code records:

**Accessing DTC History:**
1. Go to Vehicles > select vehicle
2. Click "Diagnostics" tab
3. View DTC history

**DTC History Information:**
- Code number
- Description
- Detection date
- Cleared date
- Severity
- Status

**Filtering Options:**
- By date range
- By severity
- By status (active/cleared)
- By code type

**Analysis:**
- Recurring codes
- Code frequency
- Severity trends
- Resolution tracking

**Best Practices:**
- Track recurring codes
- Monitor severity trends
- Document resolutions
- Use for preventive maintenance
- Analyze patterns
`,
    'How do I show trips this week?': `
View trip data for the current week:

**Accessing Trip Data:**
1. Go to Vehicles > select vehicle
2. Click "Trips" tab
3. Filter by "This Week"

**Trip Information:**
- Start/end time
- Start/end location
- Distance traveled
- Duration
- Average speed
- Fuel used
- Driver (if assigned)

**Trip Analysis:**
- Total distance
- Total fuel used
- Average efficiency
- Trip frequency
- Route patterns

**Export Options:**
- Trip report
- Route export
- Data export

**Best Practices:**
- Review trips weekly
- Analyze efficiency
- Monitor driver behavior
- Plan routes
- Identify patterns
`,
    'How do I show vehicle comparison?': `
Compare multiple vehicles side-by-side:

**Vehicle Comparison:**
1. Go to Vehicles
2. Select multiple vehicles (checkboxes)
3. Click "Compare"
4. View comparison

**Comparison Metrics:**
- Fuel efficiency
- Maintenance costs
- Driver scores
- Alert frequency
- DTC codes
- Mileage
- Age

**Visualization:**
- Bar charts
- Line graphs
- Tables
- Heat maps

**Best Practices:**
- Compare similar vehicles
- Use for fleet decisions
- Identify outliers
- Optimize fleet composition
- Track performance trends
`,
    'How do I show repair priority?': `
View AI-powered repair priority recommendations:

**Repair Priority Factors:**
- Critical alerts
- Safety concerns
- DTC code severity
- Maintenance overdue
- Vehicle importance
- Cost of inaction

**Viewing Repair Priority:**
1. Go to AI Assistant
2. Ask: "Which vehicle should I repair first?"
3. Review AI recommendations
4. Check suggested actions

**Priority Levels:**
- **Critical**: Immediate repair required
- **High**: Repair within 24-48 hours
- **Medium**: Repair within week
- **Low**: Schedule when convenient

**Best Practices:**
- Address critical issues immediately
- Consider vehicle usage
- Factor in repair costs
- Plan repairs efficiently
- Use AI predictions proactively
`,
    'How do I show failure prediction?': `
View AI-powered failure predictions:

**Failure Prediction Factors:**
- Historical failure patterns
- Current sensor data
- Maintenance history
- Age and mileage
- Environmental factors
- Usage patterns

**Viewing Predictions:**
1. Go to AI Assistant
2. Ask: "Which vehicle is likely to fail next?"
3. Review AI predictions
4. Check confidence levels

**Predicted Failures:**
- Battery failure
- Coolant system failure
- Brake wear
- Tire replacement
- Engine overheating
- Transmission issues

**Best Practices:**
- Review predictions daily
- Address high-risk vehicles
- Schedule preventive maintenance
- Monitor predicted components
- Track prediction accuracy
`,
    'How do I show customer support?': `
Get help and support:

**Support Channels:**
- Email: support@fleetnimble.com
- Phone: 1-800-FLEET-NOW
- Documentation: docs.fleetnimble.com
- Community: community.fleetnimble.com

**Common Support Topics:**
- Account issues
- Technical problems
- Billing questions
- Feature requests
- Bug reports

**Getting Support:**
1. Check documentation first
2. Search knowledge base
3. Contact support via email
4. Call for urgent issues
5. Submit bug report

**Best Practices:**
- Provide detailed information
- Include screenshots
- Describe steps to reproduce
- Check documentation first
- Be specific about issues
`,
    'How do I show website help?': `
Get help using the FleetNimble website:

**Website Help Resources:**
- Documentation: docs.fleetnimble.com
- Getting Started Guide
- Video Tutorials
- FAQ Section
- Knowledge Base

**Common Website Topics:**
- Navigation
- Dashboard usage
- Vehicle management
- Report generation
- Settings configuration

**Getting Help:**
1. Browse documentation
2. Search knowledge base
3. Watch video tutorials
4. Read FAQs
5. Contact support

**Best Practices:**
- Bookmark documentation
- Watch tutorials for new features
- Check FAQs first
- Use search function
- Provide feedback
`,
    'How do I show OBD help?': `
Get help with OBD device connection and usage:

**OBD Help Topics:**
- Device connection
- Bluetooth pairing
- Troubleshooting
- Compatibility
- Firmware updates

**Common OBD Issues:**
- Device not found
- Connection fails
- Data not updating
- Bluetooth issues
- Device not compatible

**Getting OBD Help:**
1. Check OBD documentation
2. Review troubleshooting guide
3. Check compatibility list
4. Contact support
5. Try different device

**Best Practices:**
- Ensure vehicle is OBD-II compatible
- Check Bluetooth settings
- Keep device charged
- Update firmware
- Use supported devices
`,
    'How do I show VIN help?': `
Get help with VIN decoding and usage:

**VIN Help Topics:**
- VIN format
- VIN location
- Decoding process
- Troubleshooting
- Manual entry

**Common VIN Issues:**
- Invalid format
- Typo in VIN
- Decoding fails
- VIN not in database
- Missing characters

**Getting VIN Help:**
1. Check VIN documentation
2. Verify VIN format
3. Check vehicle for VIN
4. Use manual entry
5. Contact support

**Best Practices:**
- Verify VIN from vehicle
- Check all characters
- Use VIN from dashboard
- Check registration documents
- Try manual entry
`,
    'How do I show report generation?': `
Generate various types of fleet reports:

**Report Types:**
- Fleet Overview
- Vehicle Health
- Fuel Efficiency
- Driver Behavior
- Maintenance Summary
- Alert History
- GPS Tracking
- Custom Reports
- Executive Summary

**Generating Reports:**
1. Go to Reports
2. Select report type
3. Choose date range
4. Filter by vehicle(s)
5. Click "Generate"

**Report Options:**
- Export formats (PDF, Excel, CSV)
- Scheduled reports
- Email delivery
- Custom filters
- Comparison views
- Branding options

**Best Practices:**
- Generate reports regularly
- Compare trends over time
- Use for decision making
- Share with stakeholders
- Schedule automated reports
- Customize for audience
`,
    'How do I show general AI?': `
General AI Assistant capabilities:

**What AI Can Do:**
- Answer fleet questions
- Provide recommendations
- Analyze data
- Generate insights
- Help with troubleshooting
- Explain technical concepts

**AI Features:**
- Natural language processing
- Context awareness
- Follow-up questions
- Suggested actions
- Real-time data integration
- Knowledge base access

**What to Ask:**
- Fleet health summary
- Vehicle-specific questions
- Maintenance status
- Alert information
- GPS location
- DTC explanations
- Platform help
- Technical explanations

**Best Practices:**
- Be specific in questions
- Use vehicle names
- Review suggestions
- Provide feedback
- Use for quick insights
- Ask follow-up questions
`,
    'How do I show live diagnostics?': `
View real-time vehicle diagnostics:

**Accessing Live Diagnostics:**
1. Go to Vehicles > select vehicle
2. Click "Live Diagnostics" tab
3. View real-time data

**Diagnostic Data:**
- Engine parameters (RPM, load, temp)
- Fuel system (level, pressure)
- Electrical system (voltage, charging)
- Emissions data
- Transmission status
- Brake system status

**Diagnostic Features:**
- Real-time gauges
- Graph displays
- Threshold alerts
- Historical comparison
- DTC code display

**Requirements:**
- OBD-II compatible vehicle
- Connected OBD device
- Ignition ON
- Data connection

**Best Practices:**
- Monitor parameters regularly
- Set appropriate thresholds
- Review trends over time
- Address issues promptly
- Use for preventive maintenance
`,
    'How do I show vehicle history?': `
View comprehensive vehicle history:

**Accessing Vehicle History:**
1. Go to Vehicles > select vehicle
2. Click "History" tab
3. View all historical data

**History Includes:**
- Telemetry history
- Alert history
- Maintenance history
- DTC history
- Fuel history
- GPS history
- Trip history

**Date Range Options:**
- Today
- Yesterday
- Last 7 days
- Last 30 days
- Custom range

**Analysis:**
- Performance trends
- Anomaly detection
- Pattern recognition
- Cost analysis
- Efficiency tracking

**Best Practices:**
- Review history regularly
- Identify patterns
- Track costs
- Monitor performance
- Use for planning
`,
    'How do I show telemetry history?': `
View historical telemetry data:

**Accessing Telemetry History:**
1. Go to Vehicles > select vehicle
2. Click "History" tab
3. Select "Telemetry"
4. View telemetry history

**Telemetry History Includes:**
- RPM over time
- Speed trends
- Temperature history
- Fuel level history
- Battery voltage history
- Engine load trends

**Date Range Options:**
- Today
- Yesterday
- Last 7 days
- Last 30 days
- Custom range

**Analysis:**
- Performance trends
- Anomaly detection
- Pattern recognition
- Comparison with norms

**Best Practices:**
- Review trends regularly
- Identify anomalies
- Compare with norms
- Use for preventive maintenance
- Track performance
`,
    'How do I show alert history?': `
View historical alert records:

**Accessing Alert History:**
1. Go to Vehicles > select vehicle
2. Click "Alerts" tab
3. View alert history

**Alert History Includes:**
- Alert type
- Severity
- Timestamp
- Value
- Threshold
- Status

**Filtering Options:**
- By date range
- By severity
- By alert type
- By status

**Analysis:**
- Alert frequency
- Severity trends
- Recurring alerts
- Pattern recognition

**Best Practices:**
- Review alert history regularly
- Identify recurring issues
- Address patterns
- Monitor severity trends
- Document resolutions
`,
    'How do I show maintenance history?': `
View historical maintenance records:

**Accessing Maintenance History:**
1. Go to Vehicles > select vehicle
2. Click "Maintenance" tab
3. View maintenance history

**Maintenance History Includes:**
- Service type
- Date performed
- Cost
- Notes
- Performed by
- Parts used

**Filtering Options:**
- By date range
- By service type
- By cost
- By vendor

**Export Options:**
- PDF report
- Excel spreadsheet
- CSV export

**Best Practices:**
- Keep detailed records
- Track all costs
- Review history regularly
- Use for warranty claims
- Plan future maintenance
`,
    'How do I show DTC history?': `
View historical DTC code records:

**Accessing DTC History:**
1. Go to Vehicles > select vehicle
2. Click "Diagnostics" tab
3. View DTC history

**DTC History Information:**
- Code number
- Description
- Detection date
- Cleared date
- Severity
- Status

**Filtering Options:**
- By date range
- By severity
- By status (active/cleared)
- By code type

**Analysis:**
- Recurring codes
- Code frequency
- Severity trends
- Resolution tracking

**Best Practices:**
- Track recurring codes
- Monitor severity trends
- Document resolutions
- Use for preventive maintenance
- Analyze patterns
`,
    'How do I show fuel history?': `
View historical fuel data:

**Accessing Fuel History:**
1. Go to Vehicles > select vehicle
2. Click "Fuel" tab
3. View fuel history

**Fuel History Includes:**
- Fuel level over time
- Refuel events
- Fuel consumption trends
- Cost tracking
- Efficiency calculations

**Date Range Options:**
- Today
- Yesterday
- Last 7 days
- Last 30 days
- Custom range

**Analysis:**
- Consumption trends
- Efficiency patterns
- Cost analysis
- Refuel patterns

**Best Practices:**
- Log refuels accurately
- Monitor efficiency trends
- Analyze consumption patterns
- Track costs
- Identify inefficiencies
`,
    'How do I show GPS history?': `
View historical GPS location data:

**Accessing GPS History:**
1. Go to GPS Tracking
2. Select vehicle
3. Choose date range
4. View route history

**GPS History Features:**
- Route replay
- Speed analysis
- Stop detection
- Geofence events
- Trip timeline

**Date Range Options:**
- Today
- Yesterday
- Last 7 days
- Last 30 days
- Custom range

**Export Options:**
- Route export (GPX/KML)
- Report generation
- Data export (CSV)

**Best Practices:**
- Review routes regularly
- Analyze efficiency
- Monitor compliance
- Use for planning
- Check geofence events
`,
    'How do I show battery status?': `
Check vehicle battery status and health:

**Viewing Battery Status:**
1. Go to Vehicles > select vehicle
2. Click "Live Diagnostics" tab
3. View battery voltage

**Battery Metrics:**
- Current voltage (V)
- Voltage trend
- Battery protection mode
- Last charge status
- Battery health estimate

**Voltage Ranges:**
- 12.6V+: Fully charged
- 12.0-12.5V: Partially charged
- Below 12.0V: Low charge
- Below 11.5V: Critical

**Battery Protection:**
- Automatic standby at low voltage
- Configurable thresholds
- Wake-up monitoring
- Health tracking

**Best Practices:**
- Monitor voltage regularly
- Set low voltage alerts
- Enable battery protection
- Replace batteries proactively
- Check charging system
`,
    'How do I show fuel status?': `
Check vehicle fuel level and efficiency:

**Viewing Fuel Status:**
1. Go to Vehicles > select vehicle
2. Click "Fuel" tab
3. View fuel data

**Fuel Metrics:**
- Current fuel level (%)
- Estimated range
- Fuel consumption (L/100km)
- Fuel cost per km
- Refuel history
- Efficiency trends

**Fuel Tracking:**
- Automatic level monitoring
- Manual refuel logging
- Cost tracking
- Efficiency calculations

**Best Practices:**
- Log refuels accurately
- Monitor efficiency trends
- Set low fuel alerts
- Compare vehicles
- Identify inefficient vehicles
- Plan refueling routes
`,
    'How do I show GPS location?': `
View current vehicle GPS location:

**Accessing GPS Location:**
1. Go to GPS Tracking
2. Select vehicle
3. View current location on map

**GPS Information:**
- Current coordinates (latitude/longitude)
- Address (if available)
- Last update time
- Speed
- Heading
- Accuracy

**Map Features:**
- Satellite view
- Street view
- Terrain view
- Zoom controls
- Vehicle markers

**Requirements:**
- GPS hardware available
- Data connection active
- GPS enabled in settings

**Best Practices:**
- Check location regularly
- Verify GPS accuracy
- Monitor update frequency
- Use for route planning
- Check coverage areas
`,
    'How do I show live data?': `
View real-time vehicle data:

**Accessing Live Data:**
1. Go to Vehicles > select vehicle
2. Click "Live Diagnostics" tab
3. View real-time metrics

**Live Data Includes:**
- Engine RPM
- Vehicle speed
- Coolant temperature
- Fuel level
- Battery voltage
- Engine load
- Throttle position
- GPS location
- Ignition status

**Requirements:**
- OBD device connected
- Vehicle ignition ON
- Data connection active
- Mobile app or telematics device

**Refresh Rate:**
- Updates every 1-5 seconds
- Depends on connection type
- Configurable in settings

**Best Practices:**
- Monitor during operation
- Check for abnormal values
- Use for diagnostics
- Set up alerts for thresholds
- Review historical trends
`,
    'How do I show vehicle comparison?': `
Compare multiple vehicles side-by-side:

**Vehicle Comparison:**
1. Go to Vehicles
2. Select multiple vehicles (checkboxes)
3. Click "Compare"
4. View comparison

**Comparison Metrics:**
- Fuel efficiency
- Maintenance costs
- Driver scores
- Alert frequency
- DTC codes
- Mileage
- Age

**Visualization:**
- Bar charts
- Line graphs
- Tables
- Heat maps

**Best Practices:**
- Compare similar vehicles
- Use for fleet decisions
- Identify outliers
- Optimize fleet composition
- Track performance trends
`,
    'How do I show repair priority?': `
View AI-powered repair priority recommendations:

**Repair Priority Factors:**
- Critical alerts
- Safety concerns
- DTC code severity
- Maintenance overdue
- Vehicle importance
- Cost of inaction

**Viewing Repair Priority:**
1. Go to AI Assistant
2. Ask: "Which vehicle should I repair first?"
3. Review AI recommendations
4. Check suggested actions

**Priority Levels:**
- **Critical**: Immediate repair required
- **High**: Repair within 24-48 hours
- **Medium**: Repair within week
- **Low**: Schedule when convenient

**Best Practices:**
- Address critical issues immediately
- Consider vehicle usage
- Factor in repair costs
- Plan repairs efficiently
- Use AI predictions proactively
`,
    'How do I show failure prediction?': `
View AI-powered failure predictions:

**Failure Prediction Factors:**
- Historical failure patterns
- Current sensor data
- Maintenance history
- Age and mileage
- Environmental factors
- Usage patterns

**Viewing Predictions:**
1. Go to AI Assistant
2. Ask: "Which vehicle is likely to fail next?"
3. Review AI predictions
4. Check confidence levels

**Predicted Failures:**
- Battery failure
- Coolant system failure
- Brake wear
- Tire replacement
- Engine overheating
- Transmission issues

**Best Practices:**
- Review predictions daily
- Address high-risk vehicles
- Schedule preventive maintenance
- Monitor predicted components
- Track prediction accuracy
`,
    'How do I show customer support?': `
Get help and support:

**Support Channels:**
- Email: support@fleetnimble.com
- Phone: 1-800-FLEET-NOW
- Documentation: docs.fleetnimble.com
- Community: community.fleetnimble.com

**Common Support Topics:**
- Account issues
- Technical problems
- Billing questions
- Feature requests
- Bug reports

**Getting Support:**
1. Check documentation first
2. Search knowledge base
3. Contact support via email
4. Call for urgent issues
5. Submit bug report

**Best Practices:**
- Provide detailed information
- Include screenshots
- Describe steps to reproduce
- Check documentation first
- Be specific about issues
`,
    'How do I show website help?': `
Get help using the FleetNimble website:

**Website Help Resources:**
- Documentation: docs.fleetnimble.com
- Getting Started Guide
- Video Tutorials
- FAQ Section
- Knowledge Base

**Common Website Topics:**
- Navigation
- Dashboard usage
- Vehicle management
- Report generation
- Settings configuration

**Getting Help:**
1. Browse documentation
2. Search knowledge base
3. Watch video tutorials
4. Read FAQs
5. Contact support

**Best Practices:**
- Bookmark documentation
- Watch tutorials for new features
- Check FAQs first
- Use search function
- Provide feedback
`,
    'How do I show OBD help?': `
Get help with OBD device connection and usage:

**OBD Help Topics:**
- Device connection
- Bluetooth pairing
- Troubleshooting
- Compatibility
- Firmware updates

**Common OBD Issues:**
- Device not found
- Connection fails
- Data not updating
- Bluetooth issues
- Device not compatible

**Getting OBD Help:**
1. Check OBD documentation
2. Review troubleshooting guide
3. Check compatibility list
4. Contact support
5. Try different device

**Best Practices:**
- Ensure vehicle is OBD-II compatible
- Check Bluetooth settings
- Keep device charged
- Update firmware
- Use supported devices
`,
    'How do I show VIN help?': `
Get help with VIN decoding and usage:

**VIN Help Topics:**
- VIN format
- VIN location
- Decoding process
- Troubleshooting
- Manual entry

**Common VIN Issues:**
- Invalid format
- Typo in VIN
- Decoding fails
- VIN not in database
- Missing characters

**Getting VIN Help:**
1. Check VIN documentation
2. Verify VIN format
3. Check vehicle for VIN
4. Use manual entry
5. Contact support

**Best Practices:**
- Verify VIN from vehicle
- Check all characters
- Use VIN from dashboard
- Check registration documents
- Try manual entry
`,
    'How do I show report generation?': `
Generate various types of fleet reports:

**Report Types:**
- Fleet Overview
- Vehicle Health
- Fuel Efficiency
- Driver Behavior
- Maintenance Summary
- Alert History
- GPS Tracking
- Custom Reports
- Executive Summary

**Generating Reports:**
1. Go to Reports
2. Select report type
3. Choose date range
4. Filter by vehicle(s)
5. Click "Generate"

**Report Options:**
- Export formats (PDF, Excel, CSV)
- Scheduled reports
- Email delivery
- Custom filters
- Comparison views
- Branding options

**Best Practices:**
- Generate reports regularly
- Compare trends over time
- Use for decision making
- Share with stakeholders
- Schedule automated reports
- Customize for audience
`,
    'How do I show general AI?': `
General AI Assistant capabilities:

**What AI Can Do:**
- Answer fleet questions
- Provide recommendations
- Analyze data
- Generate insights
- Help with troubleshooting
- Explain technical concepts

**AI Features:**
- Natural language processing
- Context awareness
- Follow-up questions
- Suggested actions
- Real-time data integration
- Knowledge base access

**What to Ask:**
- Fleet health summary
- Vehicle-specific questions
- Maintenance status
- Alert information
- GPS location
- DTC explanations
- Platform help
- Technical explanations

**Best Practices:**
- Be specific in questions
- Use vehicle names
- Review suggestions
- Provide feedback
- Use for quick insights
- Ask follow-up questions
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
