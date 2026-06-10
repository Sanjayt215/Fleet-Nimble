import 'api_service.dart';
import 'mqtt_service.dart';
import 'socket_service.dart';

class PublishResult {
  final bool httpOk;
  final bool mqttOk;
  final bool socketOk;

  const PublishResult({
    required this.httpOk,
    required this.mqttOk,
    this.socketOk = false,
  });

  bool get anySuccess => httpOk || mqttOk;
}

/// Dual-write: MQTT (cloud) + HTTP (legacy) + Socket.IO (realtime fallback).
class TelemetryPublisher {
  static Future<PublishResult> publishLiveData(
    String vehicleId,
    Map<String, dynamic> payload,
  ) async {
    bool httpOk = false;
    bool mqttOk = false;
    bool socketOk = false;

    if (await MqttTelemetryConfig.isEnabled()) {
      await MqttTelemetryService.instance.initialize();
      mqttOk = await MqttTelemetryService.instance.publishObd(payload);
    }

    try {
      await ApiService.instance.postLiveData(vehicleId, payload);
      httpOk = true;
      try {
        SocketService.instance.emitLiveData(vehicleId, payload);
        socketOk = true;
      } catch (_) {}
    } catch (_) {}

    return PublishResult(httpOk: httpOk, mqttOk: mqttOk, socketOk: socketOk);
  }

  static Future<bool> publishOfflineBatch(
    String vehicleId,
    List<Map<String, dynamic>> readings,
  ) async {
    if (readings.isEmpty) return false;

    var mqttOk = false;
    if (await MqttTelemetryConfig.isEnabled()) {
      await MqttTelemetryService.instance.initialize();
      mqttOk = await MqttTelemetryService.instance.publishObdBatch(readings);
    }

    var httpOk = false;
    try {
      await ApiService.instance.postLiveDataBatch(vehicleId, readings);
      httpOk = true;
    } catch (_) {}

    return mqttOk || httpOk;
  }
}
