const KNOWLEDGE_BASE = [
  {
    keywords: ['dashboard', 'overview', 'main page', 'home', 'analytics dashboard', 'fleet dashboard'],
    answer: 'The FleetNimble Dashboard gives you a real-time overview of your entire fleet. From the Dashboard, you can see vehicle status (online/offline), active alerts, fuel levels, GPS positions, live diagnostics data, and key performance metrics. Navigate to it from the left sidebar under "Dashboard". Vehicle cards are color-coded: green for online, red for offline, yellow for idling.',
  },
  {
    keywords: ['vehicle', 'vehicles', 'fleet list', 'vehicle list', 'my vehicles', 'all vehicles'],
    answer: 'The Vehicles page lists all vehicles in your fleet. Each vehicle card shows the name, VIN, plate number, status, last GPS position, and key live metrics. Click on any vehicle to see its full detail page with live diagnostics, GPS tracking, trips, maintenance history, DTC codes, and more. Go to Vehicles from the sidebar.',
  },
  {
    keywords: ['driver', 'drivers', 'driver management', 'driver list', 'my drivers'],
    answer: 'The Drivers page lets you manage driver profiles linked to vehicles. You can view driver scores, behavior events (harsh braking, acceleration, speeding), and assign drivers to vehicles. Driver scorecards help identify safe vs risky driving patterns. Access Drivers from the sidebar.',
  },
  {
    keywords: ['gps', 'gps tracking', 'tracking', 'live tracking', 'location', 'where is my vehicle', 'real time location', 'map'],
    answer: 'GPS Tracking shows all your vehicles on a live map with real-time positions. Each vehicle shows speed, heading, ignition status, and last update time. You can filter by vehicle, view historical playbacks, and set up geofence alerts. Go to GPS Tracking from the sidebar. Each vehicle card on the Dashboard also shows its last known location.',
  },
  {
    keywords: ['live diagnostics', 'diagnostics', 'obd', 'live data', 'real time data', 'rpm', 'speed', 'engine data'],
    answer: 'Live Diagnostics shows real-time OBD-II data for a selected vehicle. You can see RPM, speed, coolant temperature, battery voltage, fuel level, engine load, throttle position, intake temperature, MAF, ignition status, and DTC status. Navigate to Vehicles, select a vehicle, then click "Live Diagnostics" or go to the Diagnostics page from the sidebar.',
  },
  {
    keywords: ['rpm', 'engine rpm', 'revolutions per minute'],
    answer: 'You can see live RPM from Vehicles -> Select a Vehicle -> Live Diagnostics. The RPM gauge updates in real time when the vehicle is online. RPM data is also available in the telemetry stream and trip logs.',
  },
  {
    keywords: ['speed', 'vehicle speed', 'how fast'],
    answer: 'Live speed is shown on the GPS Tracking page and the Live Diagnostics page. Speed is displayed in km/h and updates in real time when the vehicle is moving. Trip logs also record average and max speed per trip.',
  },
  {
    keywords: ['obd', 'obd device', 'obd2', 'connect obd', 'pair obd', 'bluetooth obd', 'elm327', 'obd connection'],
    answer: 'To connect an OBD-II device, go to Vehicles, select your vehicle, and click "Connect OBD". FleetNimble supports ELM327 Bluetooth OBD adapters and the FleetNimble OBD Gateway. Pair the device via Bluetooth first, then select it in the app. Once connected, you will see live diagnostics data, DTC codes, and telemetry. The connection status is shown on the vehicle detail page.',
  },
  {
    keywords: ['maintenance', 'service', 'repair', 'maintenance schedule', 'oil change', 'service reminder'],
    answer: 'The Maintenance page shows all maintenance schedules and service history for your fleet. You can set up recurring maintenance tasks (oil changes, tire rotations, brake inspections), track due dates and mileage, and mark services as completed. Each vehicle has its own maintenance log. Go to Maintenance from the sidebar.',
  },
  {
    keywords: ['alert', 'alerts', 'notifications', 'warnings', 'vehicle alerts'],
    answer: 'The Alerts page shows all active and historical alerts for your fleet. Alerts include speeding events, geofence breaches, engine faults, maintenance due, driver behavior events, and DTC codes. Each alert shows severity (low/medium/high/critical), timestamp, and the related vehicle. You can mark alerts as read. Access Alerts from the sidebar.',
  },
  {
    keywords: ['report', 'reports', 'fleet report', 'analytics report', 'download report'],
    answer: 'The Reports page lets you generate and download fleet analytics reports. Available reports include fuel consumption analysis, trip summaries, maintenance history, driver performance, DTC fault reports, and fleet utilization. Reports can be exported as PDF or CSV. Go to Reports from the sidebar.',
  },
  {
    keywords: ['fuel', 'fuel analytics', 'fuel consumption', 'fuel efficiency', 'fuel tracking', 'diesel', 'petrol'],
    answer: 'Fuel Analytics shows fuel consumption trends, efficiency metrics, and cost analysis for your fleet. You can view fuel usage per vehicle, compare efficiency across vehicles, track fuel costs over time, and identify anomalies. Fuel data comes from OBD telemetry and manual fuel log entries. Access Fuel from the sidebar under Vehicles or via Reports for detailed analytics.',
  },
  {
    keywords: ['digital twin', 'twin', 'virtual model', 'simulation'],
    answer: 'The Digital Twin feature creates a virtual representation of each vehicle that mirrors its real-time state. It combines telemetry data, GPS position, diagnostics, and historical patterns to provide a comprehensive digital model. Access Digital Twin from the vehicle detail page or the dedicated Twin section in the sidebar.',
  },
  {
    keywords: ['ai assistant', 'ai', 'assistant', 'chat', 'ask ai', 'fleet ai'],
    answer: 'The AI Assistant is FleetNimble\'s intelligent chat interface. You can ask it questions about your fleet, request analysis, generate reports, check vehicle status, or get maintenance recommendations. The AI has access to your fleet data in real time. Access AI Assistant from the sidebar.',
  },
  {
    keywords: ['ai receptionist', 'receptionist', 'voice agent', 'call', 'phone'],
    answer: 'The AI Receptionist is a voice-first agent that handles customer calls, books demonstrations, schedules appointments, and creates support tickets. It speaks naturally with callers, collects details one at a time, answers FleetNimble product questions, and confirms before taking any action. Go to AI Receptionist from the sidebar to start a voice conversation.',
  },
  {
    keywords: ['dashcam', 'camera', 'hardware', 'dash cam', 'dash camera', 'dashboard camera'],
    answer: 'FleetNimble supports dashcam hardware integration for video recording and driver safety. Dashcam footage can be linked to driving events, trips, and alerts. Contact our sales team for compatible hardware recommendations and pricing. You can reach us through the AI Receptionist or by scheduling a demo.',
  },
  {
    keywords: ['pricing', 'price', 'cost', 'plan', 'subscription', 'package', 'how much', 'rates'],
    answer: 'FleetNimble offers flexible pricing plans based on fleet size and feature requirements. We have plans for small fleets (under 10 vehicles), medium fleets (10-50 vehicles), and enterprise fleets (50+ vehicles). Each plan includes GPS tracking, live diagnostics, maintenance management, alerts, and analytics. Custom enterprise plans include API access, white-label options, and dedicated support. Please schedule a demo through our AI Receptionist and our sales team will provide a tailored quote.',
  },
  {
    keywords: ['demo', 'schedule demo', 'book demo', 'product demo', 'walkthrough', 'see it in action'],
    answer: 'I can help you schedule a demo of FleetNimble! Just let me know your name, company name, fleet size, and preferred date and time. I will book a personalized walkthrough with our product team so you can see FleetNimble in action. Go ahead and share your details and I will set it up.',
  },
  {
    keywords: ['support', 'customer support', 'help', 'technical support', 'contact support'],
    answer: 'I can create a support ticket for any issue you are experiencing. Please describe the problem, provide your contact information, and let me know the urgency. Our support team will follow up. You can also reach support by scheduling a call through the AI Receptionist.',
  },
  {
    keywords: ['technical issue', 'bug', 'error', 'problem', 'not working', 'crash', 'glitch'],
    answer: 'I am sorry you are experiencing a technical issue. Please describe what is happening, which vehicle or feature is affected, and how urgent this is. I will create a support ticket for our technical team to investigate and resolve.',
  },
  {
    keywords: ['onboarding', 'getting started', 'setup', 'new user', 'begin', 'first time'],
    answer: 'Welcome to FleetNimble! To get started, first connect your OBD devices to your vehicles (Vehicles -> Select Vehicle -> Connect OBD). Then explore GPS Tracking to see your fleet on the map, Diagnostics for live vehicle data, and the Dashboard for your fleet overview. Our AI Assistant can answer questions as you explore. If you need a guided walkthrough, I can schedule an onboarding session with our team.',
  },
  {
    keywords: ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'],
    answer: '',
  },
];

export function queryKnowledgeBase(userMessage) {
  const lower = userMessage.toLowerCase().trim();
  if (!lower || lower.length < 2) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const entry of KNOWLEDGE_BASE) {
    let score = 0;
    for (const keyword of entry.keywords) {
      if (lower.includes(keyword)) {
        score += keyword.length;
      }
      const words = keyword.split(' ');
      if (words.length > 1) {
        const matchedWords = words.filter(w => {
          const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return new RegExp(`\\b${escaped}\\b`, 'i').test(lower);
        });
        score += (matchedWords.length / words.length) * keyword.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  if (bestMatch && bestScore > 2) {
    return bestMatch.answer || null;
  }

  return null;
}

export function getKnowledgeTopics() {
  return KNOWLEDGE_BASE.map(e => e.keywords[0]);
}
