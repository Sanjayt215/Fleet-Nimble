/**
 * FleetNimble Product Knowledge Base
 * Contains detailed product knowledge for answering user questions without database access
 */

export const fleetNimbleKnowledge = {
  // Dashboard
  dashboard: {
    overview: `**FleetNimble Dashboard**

The Dashboard is your fleet command center showing real-time fleet health.

**What you see:**
- Total vehicles count
- Online/Offline/Standby status
- Critical alerts count
- Active DTC codes
- Maintenance due count
- Fleet health score
- Top risky vehicles
- Recent activity

**Navigation:** Dashboard is the first page after login.

**Quick Actions:**
- Click any vehicle to see details
- Click "Add Vehicle" to add new vehicle
- Click "View All Alerts" for alerts page
- Click "Generate Report" for reports`,
  },

  // Vehicles Page
  vehicles: {
    overview: `**Vehicles Page**

View and manage all your fleet vehicles.

**What you see:**
- Vehicle list with names and plates
- Online status indicator (green = online, red = offline)
- Last seen timestamp
- Health score
- Quick actions (details, diagnostics, GPS)

**Navigation:** Dashboard > Vehicles

**Actions:**
- Click vehicle name to see details
- Click "Live Diagnostics" for real-time data
- Click "GPS" for location tracking
- Click "Add Vehicle" to add new vehicle`,
  },

  // Add Vehicle Flow
  addVehicle: {
    steps: `**How to Add a New Vehicle**

1. Go to Vehicles page
2. Click "Add Vehicle" button
3. Fill in vehicle details:
   - Vehicle Name (e.g., Honda Amaze)
   - Make (e.g., Honda)
   - Model (e.g., Amaze)
   - Year
   - Registration Number / Plate
   - VIN (optional but recommended)
   - OBD Device ID (if available)
4. Click "Save"

**After adding:**
- Vehicle appears in your fleet list
- Connect OBD device to start receiving data
- Vehicle shows as OFFLINE until OBD connected`,
  },

  // GPS Tracking
  gps: {
    overview: `**GPS Tracking in FleetNimble**

Track your vehicles in real-time on the map.

**What you see:**
- Vehicle locations on map
- Live position updates
- Route history
- Geofence zones
- Speed indicators

**Navigation:** Vehicles > Select Vehicle > GPS

**Features:**
- Click vehicle to see details
- Zoom in/out for better view
- Enable/disable vehicle tracking
- Set geofence alerts
- View route history

**If GPS not showing:**
- Check OBD device connected
- Check vehicle ignition ON
- Check mobile app telemetry upload active`,
  },

  // Live Diagnostics
  liveDiagnostics: {
    overview: `**Live Diagnostics**

Live Diagnostics helps you monitor real-time vehicle health.

**What you see:**
- RPM
- Speed
- Coolant Temperature
- Battery Voltage
- Fuel Level
- Engine Load
- Throttle Position
- Intake Temperature
- DTC Codes
- Ignition State
- OBD Connection Status

**Purpose:**
Detect issues early before breakdowns happen. Monitor engine health, fuel efficiency, and electrical systems in real-time.

**Navigation:** Vehicles > Select Vehicle > Live Diagnostics

**If values not updating:**
- Check OBD device connected
- Check vehicle ignition ON
- Check mobile app telemetry upload active
- Check vehicle status ONLINE`,
  },

  // OBD Device Connection
  obdConnection: {
    steps: `**How to Connect OBD Device**

1. **Get OBD Device:**
   - Purchase FleetNimble compatible OBD-II device
   - Ensure device supports your vehicle

2. **Install in Vehicle:**
   - Locate OBD-II port (usually under dashboard near steering wheel)
   - Plug in OBD device
   - Device should power on automatically

3. **Pair with Mobile App:**
   - Open FleetNimble mobile app
   - Go to Settings > OBD Devices
   - Turn on Bluetooth
   - Select your OBD device from list
   - Enter pairing code if required (usually 1234 or 0000)

4. **Link to Vehicle:**
   - In web dashboard, go to Vehicles
   - Select your vehicle
   - Enter OBD Device ID from mobile app
   - Save

5. **Start Telemetry:**
   - Turn on vehicle ignition
   - Mobile app will start uploading data
   - Check Live Diagnostics in dashboard to confirm

**Troubleshooting:**
- Device not found: Check Bluetooth enabled
- No data: Check ignition ON, device paired
- Slow updates: Check mobile data connection`,
  },

  // VIN Decoding
  vinDecoding: {
    overview: `**VIN Decoding in FleetNimble**

VIN (Vehicle Identification Number) is automatically decoded to show vehicle details.

**What VIN provides:**
- Make and Model
- Year
- Engine type
- Transmission type
- Country of manufacture
- Safety features

**Where to find VIN:**
- Dashboard (driver's side, visible through windshield)
- Vehicle registration document
- Insurance papers
- Engine bay
- Door frame (driver's side)

**How to add VIN:**
1. Go to Vehicles > Select Vehicle
2. Click "Edit"
3. Enter 17-character VIN
4. Save

**If VIN decode fails:**
- Check VIN is exactly 17 characters
- Check no typos (I, O, Q not used in VIN)
- Some older vehicles may not decode fully`,
  },

  // Alerts
  alerts: {
    overview: `**Alerts in FleetNimble**

Receive real-time notifications for vehicle issues.

**Alert Types:**
- Battery Low (voltage below 12V)
- Engine Overheating (coolant temp high)
- Fuel Low (level below 10%)
- High RPM (engine over-revving)
- DTC Code (diagnostic trouble code)
- Vehicle Offline (not reporting data)
- GPS Not Updating (location stale)

**Navigation:** Dashboard > Alerts

**Alert Severity:**
- 🔴 Critical (immediate attention needed)
- 🟡 Warning (monitor closely)
- 🔵 Info (informational)

**Actions:**
- Click alert to see details
- Create work order directly from alert
- Acknowledge alert to mark as read
- Set up alert preferences in Settings`,
  },

  // Maintenance
  maintenance: {
    overview: `**Maintenance in FleetNimble**

Track and manage vehicle maintenance schedules.

**What you see:**
- Upcoming maintenance items
- Past maintenance history
- Service due dates
- Cost tracking
- Maintenance reminders

**Navigation:** Vehicles > Select Vehicle > Maintenance

**Maintenance Types:**
- Oil Change
- Tire Rotation
- Brake Service
- Battery Replacement
- Air Filter
- Spark Plugs
- Custom services

**Actions:**
- Add maintenance record
- Schedule future maintenance
- Set reminders
- Track costs
- Generate maintenance report`,
  },

  // Fuel Analytics
  fuel: {
    overview: `**Fuel Analytics in FleetNimble**

Track fuel consumption and efficiency across your fleet.

**What you see:**
- Fuel level per vehicle
- Fuel consumption rate
- Refueling history
- Cost per km
- Efficiency trends
- Low fuel alerts

**Navigation:** Vehicles > Select Vehicle > Fuel

**Metrics:**
- Current fuel level (%)
- Average fuel consumption (L/100km)
- Total fuel cost
- Distance since last refuel
- Fuel efficiency score

**Actions:**
- Log refueling events
- Set low fuel alerts
- Compare vehicle efficiency
- Generate fuel report`,
  },

  // Battery Protection
  battery: {
    overview: `**Battery Protection in FleetNimble**

Protect vehicle batteries from drain and extend battery life.

**Features:**
- Battery voltage monitoring
- Low voltage alerts
- Battery health tracking
- Disconnect protection
- Charging status

**Navigation:** Vehicles > Select Vehicle > Battery

**Alerts:**
- Battery Low (< 12V)
- Battery Critical (< 11V)
- Battery Not Charging

**Protection:**
- Automatic disconnect when voltage critical
- Prevents battery drain when vehicle parked
- Extends battery life by 30-50%

**Recommendations:**
- Replace battery if voltage consistently below 12V
- Check alternator if battery not charging
- Keep battery terminals clean`,
  },

  // Engine Standby
  engineStandby: {
    overview: `**Engine ON/OFF Standby in FleetNimble**

Reduce fuel consumption and emissions by managing engine idle time.

**Features:**
- Idle time tracking
- Automatic engine shutdown suggestion
- Fuel savings calculation
- Environmental impact reporting

**Navigation:** Vehicles > Select Vehicle > Engine State

**How it works:**
- Monitors vehicle idle time
- Suggests engine shutdown after 5 minutes idle
- Tracks fuel saved from reduced idling
- Reports CO2 emission reduction

**Benefits:**
- Reduced fuel costs
- Lower emissions
- Extended engine life
- Compliance with anti-idling regulations`,
  },

  // DTC Codes
  dtc: {
    overview: `**DTC Codes in FleetNimble**

Diagnostic Trouble Codes (DTC) indicate vehicle issues detected by OBD system.

**What you see:**
- Active DTC codes
- Code descriptions
- Severity levels
- Clear history
- Code frequency

**Navigation:** Vehicles > Select Vehicle > DTC

**Code Format:**
- P = Powertrain (engine, transmission)
- B = Body (airbags, climate)
- C = Chassis (brakes, suspension)
- U = Network (communication)

**Example Codes:**
- P0300: Random misfire
- P0420: Catalyst efficiency low
- P0171: System too lean
- P0301: Cylinder 1 misfire

**Actions:**
- View code details
- Clear codes (after repair)
- Create work order
- Track code frequency`,
  },

  // Reports
  reports: {
    overview: `**Reports in FleetNimble**

Generate comprehensive reports for fleet analysis.

**Report Types:**
- Fleet Health Report
- Fuel Consumption Report
- Maintenance Report
- GPS/Route Report
- Executive Summary
- Custom Report

**Navigation:** Dashboard > Reports

**How to generate:**
1. Go to Reports page
2. Select report type
3. Choose date range
4. Select vehicles (or all)
5. Click "Generate Report"

**Report Features:**
- Export to PDF
- Export to Excel
- Schedule recurring reports
- Email reports automatically
- Custom report templates`,
  },

  // Work Orders
  workOrders: {
    overview: `**Work Orders in FleetNimble**

Manage repairs and maintenance tasks for your fleet.

**What you see:**
- Active work orders
- Work order history
- Assigned technicians
- Status tracking
- Cost tracking

**Navigation:** Dashboard > Work Orders

**How to create:**
1. Go to Work Orders page
2. Click "Create Work Order"
3. Select vehicle
4. Enter issue description
5. Set priority (High/Medium/Low)
6. Assign technician (optional)
7. Estimate cost (optional)
8. Click "Create"

**Status:**
- Pending
- In Progress
- Completed
- Cancelled

**Actions:**
- Update status
- Add notes
- Upload photos
- Track costs
- Close work order`,
  },

  // Drivers
  drivers: {
    overview: `**Drivers in FleetNimble**

Manage driver assignments and performance.

**What you see:**
- Driver list
- Assigned vehicles
- Driver performance
- Trip history
- Safety scores

**Navigation:** Dashboard > Drivers

**How to add driver:**
1. Go to Drivers page
2. Click "Add Driver"
3. Enter driver details:
   - Name
   - Phone
   - License number
   - License expiry
4. Assign vehicle (optional)
5. Save

**Actions:**
- Assign/unassign vehicles
- Track driver trips
- View driver performance
- Manage driver documents`,
  },

  // Settings
  settings: {
    overview: `**Settings in FleetNimble**

Configure your FleetNimble account and preferences.

**Settings Sections:**
- Account Settings (profile, password)
- Alert Preferences (what alerts to receive)
- Notification Settings (email, SMS, push)
- OBD Device Management
- Vehicle Groups
- User Management (for teams)
- Subscription/Billing

**Navigation:** Dashboard > Settings (gear icon)

**Common Settings:**
- Change password
- Set alert thresholds
- Configure notifications
- Manage OBD devices
- Add team members
- View subscription plan`,
  },

  // Mobile App Connection
  mobileApp: {
    overview: `**FleetNimble Mobile App**

Connect mobile app for real-time telemetry upload.

**App Features:**
- OBD device pairing
- Real-time data upload
- GPS tracking
- Push notifications
- Offline mode

**How to connect:**
1. Download FleetNimble app from App Store/Play Store
2. Login with your account
3. Enable Bluetooth
4. Pair OBD device
5. Start vehicle ignition
6. App automatically uploads data

**Data Upload:**
- Requires mobile data or WiFi
- Uploads every 10 seconds when vehicle running
- Stores data offline if no connection
- Syncs when connection restored`,
  },

  // Troubleshooting
  troubleshooting: {
    rpmNotUpdating: `**Why RPM Not Updating?**

**Check these:**
1. OBD device connected to vehicle
2. Vehicle ignition ON (engine running)
3. Mobile app paired with OBD device
4. Mobile app telemetry upload active
5. Vehicle status shows ONLINE
6. Check Live Diagnostics page

**Common fixes:**
- Restart mobile app
- Turn ignition OFF then ON
- Check OBD device power light
- Re-pair OBD device in mobile app
- Check mobile data connection`,

    gpsNotShowing: `**Why GPS Not Showing?**

**Check these:**
1. OBD device connected
2. Vehicle ignition ON
3. Mobile app telemetry upload active
4. GPS enabled in mobile app
5. Location permissions granted

**Common fixes:**
- Enable location services in phone
- Check GPS signal strength
- Restart mobile app
- Check mobile data connection
- Verify OBD device supports GPS`,

    vinDecodeFailed: `**Why VIN Decode Failed?**

**Check these:**
1. VIN is exactly 17 characters
2. No typos (I, O, Q not valid in VIN)
3. VIN from official source (registration, dashboard)
4. Vehicle is supported (1996+ for US, 2000+ for most regions)

**Common fixes:**
- Double-check VIN characters
- Use VIN from vehicle dashboard
- Some older vehicles may not decode fully
- Contact support if VIN is correct but still fails`,

    vehicleOffline: `**Why Vehicle Offline?**

**Check these:**
1. OBD device connected to vehicle
2. Vehicle ignition ON
3. Mobile app telemetry upload active
4. Mobile data connection available
5. Last seen timestamp

**Common fixes:**
- Turn on vehicle ignition
- Check OBD device power
- Restart mobile app
- Check mobile data connection
- Verify OBD device paired`,
  },
};

/**
 * Get product knowledge for a specific topic
 */
export function getProductKnowledge(topic) {
  return fleetNimbleKnowledge[topic] || null;
}

/**
 * Search product knowledge for a query
 */
export function searchProductKnowledge(query) {
  const lowerQuery = query.toLowerCase();
  const results = [];

  for (const [key, value] of Object.entries(fleetNimbleKnowledge)) {
    const content = JSON.stringify(value).toLowerCase();
    if (content.includes(lowerQuery)) {
      results.push({ topic: key, content: value });
    }
  }

  return results;
}

/**
 * Get navigation answer for a specific question
 */
export function getNavigationAnswer(question) {
  const lowerQuestion = question.toLowerCase();

  if (lowerQuestion.includes('live speed') || lowerQuestion.includes('live rpm') || lowerQuestion.includes('live diagnostics')) {
    return `To view live speed and RPM:

1. Open FleetNimble Dashboard
2. Go to Vehicles
3. Select the vehicle
4. Open Live Diagnostics
5. You can see:
   - Speed
   - RPM
   - Fuel Level
   - Battery Voltage
   - Coolant Temperature
   - Engine Load
   - Throttle Position

If values are not updating, check:
- OBD device connected
- Vehicle ignition ON
- Mobile app telemetry upload active
- Vehicle status ONLINE`;
  }

  if (lowerQuestion.includes('add vehicle')) {
    return `How to add a new vehicle:

1. Go to Vehicles page
2. Click "Add Vehicle" button
3. Fill in vehicle details:
   - Vehicle Name (e.g., Honda Amaze)
   - Make (e.g., Honda)
   - Model (e.g., Amaze)
   - Year
   - Registration Number / Plate
   - VIN (optional but recommended)
   - OBD Device ID (if available)
4. Click "Save"

After adding, connect OBD device to start receiving data.`;
  }

  if (lowerQuestion.includes('new vehicle') || lowerQuestion.includes('create vehicle')) {
    return `How to add a new vehicle:

1. Go to Vehicles page
2. Click "Add Vehicle" button
3. Fill in vehicle details:
   - Vehicle Name (e.g., Honda Amaze)
   - Make (e.g., Honda)
   - Model (e.g., Amaze)
   - Year
   - Registration Number / Plate
   - VIN (optional but recommended)
   - OBD Device ID (if available)
4. Click "Save"

After adding, connect OBD device to start receiving data.`;
  }

  if (lowerQuestion.includes('connect obd') || lowerQuestion.includes('obd device')) {
    return `How to connect OBD device:

1. Get FleetNimble compatible OBD-II device
2. Plug device into vehicle's OBD-II port (under dashboard near steering wheel)
3. Open FleetNimble mobile app
4. Go to Settings > OBD Devices
5. Turn on Bluetooth
6. Select your OBD device from list
7. Enter pairing code if required (usually 1234 or 0000)
8. In web dashboard, go to Vehicles > Select Vehicle
9. Enter OBD Device ID from mobile app
10. Save

Turn on vehicle ignition to start telemetry upload.`;
  }

  if (lowerQuestion.includes('gps') || lowerQuestion.includes('location')) {
    return `To view GPS location:

1. Open FleetNimble Dashboard
2. Go to Vehicles
3. Select the vehicle
4. Click "GPS" tab
5. You can see:
   - Current location on map
   - Route history
   - Speed indicators
   - Geofence zones

If GPS not showing:
- Check OBD device connected
- Check vehicle ignition ON
- Check mobile app telemetry upload active
- Enable location services in phone`;
  }

  if (lowerQuestion.includes('dtc') || lowerQuestion.includes('diagnostic code')) {
    return `To view DTC codes:

1. Open FleetNimble Dashboard
2. Go to Vehicles
3. Select the vehicle
4. Click "DTC" tab
5. You can see:
   - Active DTC codes
   - Code descriptions
   - Severity levels
   - Clear history

Actions:
- Click code to see details
- Clear codes (after repair)
- Create work order directly`;
  }

  if (lowerQuestion.includes('work order') || lowerQuestion.includes('repair order')) {
    return `To view Work Orders:

1. Open FleetNimble Dashboard
2. Go to Work Orders page
3. You can see:
   - Active work orders
   - Work order history
   - Status tracking

To create a new work order:
1. Click "Create Work Order"
2. Select vehicle
3. Enter issue description
4. Set priority
5. Save

**Navigation:** Dashboard > Work Orders`;
  }

  if (lowerQuestion.includes('fuel') || lowerQuestion.includes('fuel consumption') || lowerQuestion.includes('fuel efficiency')) {
    return `To view Fuel Analytics:

1. Open FleetNimble Dashboard
2. Go to Vehicles
3. Select the vehicle
4. Click "Fuel" tab

You can see:
- Current fuel level
- Fuel consumption rate (L/100km)
- Refueling history
- Total fuel cost
- Efficiency trends

**Navigation:** Vehicles > Select Vehicle > Fuel`;
  }

  if (lowerQuestion.includes('battery') && (lowerQuestion.includes('health') || lowerQuestion.includes('status') || lowerQuestion.includes('protection') || lowerQuestion.includes('voltage'))) {
    return `To view Battery Status:

1. Open FleetNimble Dashboard
2. Go to Vehicles
3. Select the vehicle
4. Click "Battery" tab

You can see:
- Current battery voltage
- Battery health status
- Low voltage alerts
- Charging status

**Navigation:** Vehicles > Select Vehicle > Battery`;
  }

  if (lowerQuestion.includes('maintenance') || lowerQuestion.includes('service') || lowerQuestion.includes('repair')) {
    return `To view Maintenance:

1. Open FleetNimble Dashboard
2. Go to Vehicles
3. Select the vehicle
4. Click "Maintenance" tab

You can see:
- Upcoming maintenance
- Past maintenance history
- Service due dates
- Cost tracking

**Navigation:** Vehicles > Select Vehicle > Maintenance`;
  }

  if (lowerQuestion.includes('report') && (lowerQuestion.includes('generate') || lowerQuestion.includes('create') || lowerQuestion.includes('how'))) {
    return `To generate reports:

1. Go to Reports page (Dashboard > Reports)
2. Select report type:
   - Fleet Health Report
   - Fuel Consumption Report
   - Maintenance Report
   - GPS/Route Report
3. Choose date range
4. Select vehicles
5. Click "Generate Report"

**Features:**
- Export to PDF or Excel
- Schedule recurring reports
- Email reports automatically`;
  }

  if (lowerQuestion.includes('driver') || lowerQuestion.includes('driver management')) {
    return `To manage Drivers:

1. Go to Drivers page (Dashboard > Drivers)
2. You can see all drivers and their assigned vehicles
3. Click "Add Driver" to add a new driver

**Features:**
- Assign vehicles to drivers
- Track driver trips
- View driver performance
- Manage driver documents`;
  }

  if (lowerQuestion.includes('settings') && (lowerQuestion.includes('change') || lowerQuestion.includes('configure') || lowerQuestion.includes('where') || lowerQuestion.includes('find'))) {
    return `To access Settings:

1. Click the gear icon in the top navigation
2. You can configure:
   - Account Settings (profile, password)
   - Alert Preferences
   - Notification Settings (email, SMS, push)
   - OBD Device Management
   - Vehicle Groups
   - User Management (team)
   - Subscription/Billing

**Navigation:** Dashboard > Settings (gear icon)`;
  }

  if (lowerQuestion.includes('mobile app') || lowerQuestion.includes('app') && (lowerQuestion.includes('download') || lowerQuestion.includes('connect'))) {
    return `**FleetNimble Mobile App**

To connect the mobile app:
1. Download from App Store (iOS) or Play Store (Android)
2. Login with your account
3. Enable Bluetooth
4. Pair OBD device
5. Start vehicle ignition
6. App automatically uploads telemetry data

**Requirements:**
- Mobile data or WiFi connection
- Bluetooth enabled
- Location permissions for GPS tracking`;
  }

  if (lowerQuestion.includes('telemetry') || lowerQuestion.includes('data upload') || lowerQuestion.includes('no data')) {
    return `**Telemetry Data Upload**

If telemetry data is not updating:

Check these:
1. OBD device connected to vehicle
2. Vehicle ignition ON
3. Mobile app paired with OBD device
4. Mobile data or WiFi connection active
5. Vehicle status shows ONLINE

Common fixes:
- Restart mobile app
- Turn ignition OFF then ON
- Re-pair OBD device
- Check mobile data connection`;
  }

  if (lowerQuestion.includes('where') || lowerQuestion.includes('how to find') || lowerQuestion.includes('navigate') || lowerQuestion.includes('go to')) {
    return `**FleetNimble Navigation Guide**

Here's how to find key pages:

- **Dashboard:** First page after login — shows fleet health overview
- **Vehicles:** Dashboard > Vehicles — manage all fleet vehicles
- **Alerts:** Dashboard > Alerts — view all alerts
- **Work Orders:** Dashboard > Work Orders — manage repairs
- **Reports:** Dashboard > Reports — generate reports
- **Drivers:** Dashboard > Drivers — manage drivers
- **Settings:** Click the gear icon — configure preferences
- **Live Diagnostics:** Vehicles > Select Vehicle > Live Diagnostics
- **GPS Tracking:** Vehicles > Select Vehicle > GPS
- **Maintenance:** Vehicles > Select Vehicle > Maintenance
- **DTC Codes:** Vehicles > Select Vehicle > DTC
- **Fuel:** Vehicles > Select Vehicle > Fuel
- **Battery:** Vehicles > Select Vehicle > Battery

Type a specific feature name for more details!`;
  }

  return null;
}
