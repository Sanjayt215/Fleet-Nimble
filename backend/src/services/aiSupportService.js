/**
 * AI Support Service
 * Provides step-by-step support for platform questions
 */

const SUPPORT_GUIDES = {
  'how to connect obd': {
    topic: 'Connect OBD Device',
    steps: [
      'Ensure your vehicle has an OBD-II port (usually under the dashboard on the driver side)',
      'Plug in the FleetNimble OBD adapter into the OBD-II port',
      'Enable Bluetooth on your mobile device',
      'Open the FleetNimble mobile app',
      'Navigate to Settings > Add Vehicle > Connect OBD Device',
      'Select your OBD adapter from the available Bluetooth devices list',
      'Enter the pairing PIN (default is usually 1234 or 0000)',
      'Wait for the connection to establish and verify the device appears as connected',
    ],
    troubleshooting: [
      'If device doesn\'t appear: Ensure Bluetooth is enabled and adapter is powered (ignition ON)',
      'If pairing fails: Try turning vehicle ignition to ON position and retry',
      'If connection drops: Check adapter compatibility with your vehicle (OBD-II standard)',
    ],
  },
  'how to decode vin': {
    topic: 'Decode VIN',
    steps: [
      'Locate your VIN on the dashboard (visible through windshield), driver door jamb, or registration documents',
      'Open the FleetNimble app and navigate to Add Vehicle',
      'Enter the 17-character VIN in the VIN field',
      'The system will automatically decode the VIN and populate vehicle details',
      'Verify the decoded information matches your vehicle',
      'Save the vehicle to add it to your fleet',
    ],
    troubleshooting: [
      'If decode fails: Ensure VIN is exactly 17 characters with no spaces',
      'If information is incorrect: Check VIN for typos or contact support',
      'If vehicle not recognized: Your vehicle may not be in the manufacturer database',
    ],
  },
  'how to fix bluetooth': {
    topic: 'Fix Bluetooth Connection',
    steps: [
      'Ensure Bluetooth is enabled on your mobile device',
      'Turn off Bluetooth and turn it back on after 10 seconds',
      'Restart the FleetNimble mobile app',
      'Forget the OBD device from Bluetooth settings and re-pair',
      'Ensure the OBD adapter is powered (vehicle ignition ON)',
      'Move closer to the vehicle to ensure signal strength',
      'Try pairing with a different mobile device to isolate the issue',
    ],
    troubleshooting: [
      'If still not connecting: The OBD adapter may be defective or incompatible',
      'If connects but drops: Check for interference from other Bluetooth devices',
      'If adapter not found: Verify adapter is powered and in pairing mode',
    ],
  },
  'how to read live rpm': {
    topic: 'Read Live RPM',
    steps: [
      'Ensure OBD device is connected and vehicle ignition is ON',
      'Open the FleetNimble app and navigate to Live Diagnostics',
      'Select the vehicle you want to monitor',
      'The RPM gauge will display real-time engine speed',
      'You can also view other parameters like speed, coolant temp, and fuel level',
    ],
    troubleshooting: [
      'If RPM shows 0: Ensure vehicle engine is running, not just ignition ON',
      'If RPM not updating: Check OBD connection and vehicle compatibility',
      'If values seem incorrect: Verify OBD adapter is properly seated in port',
    ],
  },
  'why is telemetry offline': {
    topic: 'Telemetry Offline',
    steps: [
      'Check if the OBD device is connected to the vehicle',
      'Verify vehicle ignition is ON or engine is running',
      'Check if the mobile app has an active internet connection',
      'Verify the OBD device is paired via Bluetooth',
      'Check if the vehicle is in battery protection standby mode',
      'Review the vehicle status in the FleetNimble dashboard',
    ],
    troubleshooting: [
      'If device not connected: Reconnect OBD device and ensure Bluetooth pairing',
      'If no internet: Check mobile data or WiFi connection',
      'If in standby mode: Start the vehicle to exit standby',
      'If still offline: Contact support for device diagnostics',
    ],
  },
  'why is gps unavailable': {
    topic: 'GPS Unavailable',
    steps: [
      'Check if your OBD adapter has built-in GPS',
      'If using mobile GPS, ensure location services are enabled on your device',
      'Verify the vehicle has a clear view of the sky (not in garage or underground)',
      'Check if the mobile app has location permissions granted',
      'Ensure the vehicle has been driven recently to acquire GPS signal',
      'Check GPS signal strength in the dashboard',
    ],
    troubleshooting: [
      'If no GPS hardware: Consider upgrading to a GPS-enabled OBD adapter',
      'If using mobile GPS: Keep the app open while driving for accurate tracking',
      'If signal weak: Drive to an open area away from buildings and trees',
      'If still unavailable: Check device settings and contact support',
    ],
  },
  'why is vin decode failing': {
    topic: 'VIN Decode Failure',
    steps: [
      'Verify the VIN is exactly 17 characters long',
      'Check for any typos or incorrect characters in the VIN',
      'Ensure you\'re using the correct VIN for the vehicle',
      'Try decoding the VIN on a different VIN decoder website to verify',
      'Check if the vehicle is a recent model that may not be in the database yet',
    ],
    troubleshooting: [
      'If VIN is correct but decode fails: The vehicle may not be in the manufacturer database',
      'If information is wrong: Contact support with vehicle details for manual entry',
      'If VIN format is unusual: Some imported vehicles may have non-standard VINs',
    ],
  },
  'how to schedule maintenance': {
    topic: 'Schedule Maintenance',
    steps: [
      'Open the FleetNimble app and navigate to Maintenance',
      'Select the vehicle you want to schedule maintenance for',
      'Click "Add Maintenance" or "Schedule Service"',
      'Select the maintenance type (oil change, brake service, etc.)',
      'Set the due date and priority level',
      'Add any notes or parts needed',
      'Save the maintenance schedule',
    ],
    troubleshooting: [
      'If maintenance not appearing: Refresh the maintenance page',
      'If reminders not working: Check app notification settings',
      'If date is wrong: Verify your device timezone settings',
    ],
  },
};

/**
 * Get support guide for a topic
 */
export function getSupportGuide(topic) {
  const lowerTopic = topic.toLowerCase();
  
  for (const [key, guide] of Object.entries(SUPPORT_GUIDES)) {
    if (lowerTopic.includes(key) || lowerTopic.includes(guide.topic.toLowerCase())) {
      return guide;
    }
  }
  
  // Default generic support
  return {
    topic: 'General Support',
    steps: [
      'Check the FleetNimble documentation for detailed guides',
      'Ensure your device and vehicle meet the system requirements',
      'Verify all connections are secure and powered',
      'Contact FleetNimble support for personalized assistance',
    ],
    troubleshooting: [
      'If issue persists: Check our knowledge base for similar issues',
      'If urgent: Contact support via email or phone',
    ],
  };
}

/**
 * Get support response in structured format
 */
export function getSupportResponse(topic) {
  const guide = getSupportGuide(topic);
  
  return {
    topic: guide.topic,
    steps: guide.steps,
    troubleshooting: guide.troubleshooting || [],
  };
}

/**
 * Check if a message is a support question
 */
export function isSupportQuestion(message) {
  const supportKeywords = [
    'how to',
    'how do i',
    'why is',
    'why does',
    'how can',
    'troubleshoot',
    'fix',
    'not working',
    'error',
    'issue',
    'problem',
    'connect',
    'pair',
    'setup',
    'configure',
    'guide',
    'help',
  ];
  
  const lowerMessage = message.toLowerCase();
  return supportKeywords.some(keyword => lowerMessage.includes(keyword));
}
