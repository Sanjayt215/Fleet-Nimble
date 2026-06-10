class AppConfig {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://10.0.2.2:5000/api',
  );
  static const String socketUrl = String.fromEnvironment(
    'SOCKET_URL',
    defaultValue: 'http://10.0.2.2:5000',
  );

  /// MQTT broker hostname (no scheme). Emulator → 10.0.2.2; physical device → PC LAN IP.
  static const String mqttBroker = String.fromEnvironment(
    'MQTT_BROKER',
    defaultValue: '10.0.2.2',
  );

  static const int mqttPort = int.fromEnvironment('MQTT_PORT', defaultValue: 1883);
  static const bool mqttUseTls = bool.fromEnvironment('MQTT_USE_TLS', defaultValue: false);
}
