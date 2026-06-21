class AppConfig {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'https://fleet-nimble.onrender.com/api',
  );
  static const String socketUrl = String.fromEnvironment(
    'SOCKET_URL',
    defaultValue: 'https://fleet-nimble.onrender.com',
  );

  /// MQTT broker hostname (no scheme). Emulator → 10.0.2.2; physical device → PC LAN IP.
  static const String mqttBroker = String.fromEnvironment(
    'MQTT_BROKER',
    defaultValue: '10.0.2.2',
  );

  static const int mqttPort = int.fromEnvironment('MQTT_PORT', defaultValue: 1883);
  static const bool mqttUseTls = bool.fromEnvironment('MQTT_USE_TLS', defaultValue: false);

  /// === BACKUP MODE: Fixed Vehicle ID for Testing ===
  /// When true, app skips vehicle setup and uploads OBD data to a fixed vehicle ID.
  /// Allows testing without relying on the new vehicle setup/authentication flow.
  /// PRODUCTION: Set to false
  static const bool useFixedFleetVehicleId = false;

  /// Fixed FleetNimble vehicle UUID for backup/testing mode ONLY.
  /// IMPORTANT: Only used when useFixedFleetVehicleId = true
  /// For testing: SELECT id FROM "Vehicle" LIMIT 1;
  static const String fixedFleetVehicleId = '00000000-0000-0000-0000-000000000125';
}
