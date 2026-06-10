import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:uuid/uuid.dart';
import 'package:mqtt_client/mqtt_client.dart';
import 'package:mqtt_client/mqtt_server_client.dart';
import 'package:shared_preferences/shared_preferences.dart';

class MqttTelemetryConfig {
  final String broker;
  final int port;
  final bool useTls;
  final String deviceUid;
  final String deviceSecret;
  final String tenantId;
  final String vehicleId;

  const MqttTelemetryConfig({
    required this.broker,
    required this.port,
    required this.useTls,
    required this.deviceUid,
    required this.deviceSecret,
    required this.tenantId,
    required this.vehicleId,
  });

  String get obdTopic => 'fleet/$tenantId/$vehicleId/telemetry/obd';
  String get heartbeatTopic => 'fleet/$tenantId/$vehicleId/heartbeat';
  String get clientId => 'fleet-$deviceUid';

  static Future<bool> isEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool('mqtt_enabled') ?? false;
  }

  static Future<MqttTelemetryConfig?> loadFromPrefs() async {
    final prefs = await SharedPreferences.getInstance();
    if (!(prefs.getBool('mqtt_enabled') ?? false)) return null;

    final broker = prefs.getString('mqtt_broker');
    final deviceUid = prefs.getString('mqtt_device_uid');
    final deviceSecret = prefs.getString('mqtt_device_secret');
    final tenantId = prefs.getString('mqtt_tenant_id');
    final vehicleId = prefs.getString('mqtt_vehicle_id');
    if (broker == null ||
        deviceUid == null ||
        deviceSecret == null ||
        tenantId == null ||
        vehicleId == null) {
      return null;
    }

    return MqttTelemetryConfig(
      broker: broker,
      port: prefs.getInt('mqtt_port') ?? (prefs.getBool('mqtt_use_tls') ?? false ? 8883 : 1883),
      useTls: prefs.getBool('mqtt_use_tls') ?? false,
      deviceUid: deviceUid,
      deviceSecret: deviceSecret,
      tenantId: tenantId,
      vehicleId: vehicleId,
    );
  }

  static Future<void> saveToPrefs({
    required bool enabled,
    required String broker,
    required int port,
    required bool useTls,
    required String deviceUid,
    required String deviceSecret,
    required String tenantId,
    required String vehicleId,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('mqtt_enabled', enabled);
    await prefs.setString('mqtt_broker', broker);
    await prefs.setInt('mqtt_port', port);
    await prefs.setBool('mqtt_use_tls', useTls);
    await prefs.setString('mqtt_device_uid', deviceUid);
    await prefs.setString('mqtt_device_secret', deviceSecret);
    await prefs.setString('mqtt_tenant_id', tenantId);
    await prefs.setString('mqtt_vehicle_id', vehicleId);
  }

  static Future<void> clearCredentials() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('mqtt_device_uid');
    await prefs.remove('mqtt_device_secret');
    await prefs.remove('mqtt_tenant_id');
    await prefs.remove('mqtt_vehicle_id');
  }
}

/// Production MQTT telematics publisher with auto-reconnect and heartbeat.
class MqttTelemetryService {
  MqttTelemetryService._();
  static final MqttTelemetryService instance = MqttTelemetryService._();

  MqttServerClient? _client;
  MqttTelemetryConfig? _config;
  Timer? _heartbeatTimer;
  int _sequence = 0;
  int _reconnectAttempt = 0;

  bool get isConnected => _client?.connectionStatus?.state == MqttConnectionState.connected;
  bool get isConfigured => _config != null;
  MqttTelemetryConfig? get config => _config;

  Future<bool> initialize() async {
    final config = await MqttTelemetryConfig.loadFromPrefs();
    if (config == null) {
      await disconnect();
      return false;
    }
    return connect(config);
  }

  Future<bool> connect(MqttTelemetryConfig config) async {
    _config = config;
    await disconnect(notify: false);

    final client = MqttServerClient.withPort(config.broker, config.clientId, config.port);
    client.logging(on: false);
    client.keepAlivePeriod = 30;
    client.autoReconnect = true;
    client.onAutoReconnect = _onAutoReconnect;
    client.onConnected = _onConnected;
    client.onDisconnected = _onDisconnected;
    client.pongCallback = _pong;

    final connMessage = MqttConnectMessage()
        .withClientIdentifier(config.clientId)
        .startClean()
        .withWillQos(MqttQos.atLeastOnce);

    connMessage.authenticateAs(config.deviceUid, config.deviceSecret);
    client.connectionMessage = connMessage;

    if (config.useTls) {
      client.secure = true;
      client.securityContext = SecurityContext.defaultContext;
      client.onBadCertificate = (_) => true;
    }

    _client = client;

    try {
      await client.connect();
      if (client.connectionStatus?.state != MqttConnectionState.connected) {
        return false;
      }
      _reconnectAttempt = 0;
      _startHeartbeat();
      return true;
    } catch (_) {
      return false;
    }
  }

  void _onConnected() {
    _reconnectAttempt = 0;
    _publishHeartbeat();
  }

  void _onAutoReconnect() {
    _reconnectAttempt += 1;
  }

  void _onDisconnected() {
    _heartbeatTimer?.cancel();
  }

  void _pong() {}

  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 30), (_) => _publishHeartbeat());
  }

  Future<void> _publishHeartbeat() async {
    if (!isConnected || _config == null) return;
    final payload = jsonEncode({
      'deviceId': _config!.deviceUid,
      'timestamp': DateTime.now().toUtc().toIso8601String(),
      'firmwareVersion': 'fleetnimble-mobile-1.0.0',
    });
    _publish(_config!.heartbeatTopic, payload);
  }

  String _nextMessageId() => const Uuid().v4();

  bool _publish(String topic, String payload, {MqttQos qos = MqttQos.atLeastOnce}) {
    final client = _client;
    if (client == null || !isConnected) return false;
    final builder = MqttClientPayloadBuilder();
    builder.addString(payload);
    client.publishMessage(topic, qos, builder.payload!);
    return true;
  }

  Future<bool> publishObd(Map<String, dynamic> reading) async {
    if (_config == null) return false;
    if (!isConnected) {
      final ok = await connect(_config!);
      if (!ok) return false;
    }

    _sequence += 1;
    final payload = jsonEncode({
      'messageId': _nextMessageId(),
      'sequence': _sequence,
      'deviceId': _config!.deviceUid,
      'timestamp': DateTime.now().toUtc().toIso8601String(),
      'source': 'mqtt',
      ...reading,
    });

    return _publish(_config!.obdTopic, payload);
  }

  Future<bool> publishObdBatch(List<Map<String, dynamic>> readings) async {
    if (_config == null || readings.isEmpty) return false;
    if (!isConnected) {
      final ok = await connect(_config!);
      if (!ok) return false;
    }

    final payload = jsonEncode({
      'messageId': _nextMessageId(),
      'deviceId': _config!.deviceUid,
      'timestamp': DateTime.now().toUtc().toIso8601String(),
      'source': 'mqtt-batch',
      'readings': readings,
    });

    return _publish(_config!.obdTopic, payload);
  }

  Future<void> disconnect({bool notify = true}) async {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
    final client = _client;
    _client = null;
    if (client != null) {
      try {
        client.disconnect();
      } catch (_) {}
    }
    if (notify) _config = null;
  }

  Map<String, dynamic> getStatus() => {
        'configured': _config != null,
        'connected': isConnected,
        'broker': _config?.broker,
        'port': _config?.port,
        'tenantId': _config?.tenantId,
        'vehicleId': _config?.vehicleId,
        'deviceUid': _config?.deviceUid,
        'reconnectAttempt': _reconnectAttempt,
      };
}
