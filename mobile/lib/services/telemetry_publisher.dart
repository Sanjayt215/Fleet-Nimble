import 'api_service.dart';
import 'mqtt_service.dart';
import 'socket_service.dart';
import '../utils/config.dart';

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
  /// Publish live OBD data. If useFixedFleetVehicleId is true, uses postLiveTelemetry.
  /// Otherwise uses the legacy postLiveData endpoint.
  static Future<PublishResult> publishLiveData(
    String vehicleId,
    Map<String, dynamic> payload,
  ) async {
    // In backup mode, use the /mobile/telemetry/live endpoint for structured telemetry
    if (AppConfig.useFixedFleetVehicleId) {
      return _publishLiveTelemetry(vehicleId, payload);
    }
    
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

  /// Publish live telemetry using the structured /mobile/telemetry/live endpoint (backup mode).
  /// This converts OBD data map to the telemetry format expected by the backend.
  static Future<PublishResult> _publishLiveTelemetry(
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
      // Convert OBD map to telemetry POST format
      await ApiService.instance.postLiveTelemetry(
        vehicleId: vehicleId,
        mode: 'LIVE',
        rpm: _toDouble(payload['rpm']),
        speed: _toDouble(payload['speed']),
        fuelLevel: _toDouble(payload['fuelLevel']),
        coolantTemp: _toDouble(payload['coolantTemp']),
        batteryVoltage: _toDouble(payload['batteryVoltage']),
        engineLoad: _toDouble(payload['engineLoad']),
        latitude: _toDouble(payload['latitude']),
        longitude: _toDouble(payload['longitude']),
        odometer: _toDouble(payload['odometer']),
        timestamp: DateTime.now(),
      );
      httpOk = true;
      try {
        SocketService.instance.emitLiveData(vehicleId, payload);
        socketOk = true;
      } catch (_) {}
    } catch (e) {
      // Log but don't crash
    }

    return PublishResult(httpOk: httpOk, mqttOk: mqttOk, socketOk: socketOk);
  }

  static double? _toDouble(dynamic value) {
    if (value == null) return null;
    if (value is double) return value;
    if (value is int) return value.toDouble();
    if (value is String) return double.tryParse(value);
    return null;
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
      if (AppConfig.useFixedFleetVehicleId) {
        // In backup mode, publish each reading via postLiveTelemetry
        for (final reading in readings) {
          try {
            await ApiService.instance.postLiveTelemetry(
              vehicleId: vehicleId,
              mode: 'LIVE',
              rpm: _toDouble(reading['rpm']),
              speed: _toDouble(reading['speed']),
              fuelLevel: _toDouble(reading['fuelLevel']),
              coolantTemp: _toDouble(reading['coolantTemp']),
              batteryVoltage: _toDouble(reading['batteryVoltage']),
              engineLoad: _toDouble(reading['engineLoad']),
              latitude: _toDouble(reading['latitude']),
              longitude: _toDouble(reading['longitude']),
              odometer: _toDouble(reading['odometer']),
              timestamp: reading['timestamp'] != null 
                ? DateTime.parse(reading['timestamp'].toString())
                : DateTime.now(),
            );
            httpOk = true;
          } catch (_) {
            // Continue with next reading
          }
        }
      } else {
        // Legacy: use batch endpoint
        await ApiService.instance.postLiveDataBatch(vehicleId, readings);
        httpOk = true;
      }
    } catch (_) {}

    return mqttOk || httpOk;
  }
}
