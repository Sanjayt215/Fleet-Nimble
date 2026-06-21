import 'dart:async';
import 'package:shared_preferences/shared_preferences.dart';
import 'api_service.dart';
import 'mqtt_service.dart';
import 'socket_service.dart';
import '../utils/config.dart';

class PublishResult {
  final bool httpOk;
  final bool mqttOk;
  final bool socketOk;
  final String? error;

  const PublishResult({
    required this.httpOk,
    required this.mqttOk,
    this.socketOk = false,
    this.error,
  });

  bool get anySuccess => httpOk || mqttOk;
}

/// Dual-write: MQTT (cloud) + HTTP (legacy) + Socket.IO (realtime fallback).
class TelemetryPublisher {
  static DateTime? _lastUploadTime;
  static String? _lastError;
  
  static DateTime? get lastUploadTime => _lastUploadTime;
  static String? get lastError => _lastError;

  /// Get active vehicle ID from storage
  static Future<String?> getActiveVehicleId() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('activeVehicleId');
  }

  /// Publish live OBD data using dynamic vehicle ID
  static Future<PublishResult> publishLiveData(
    String? vehicleId,
    Map<String, dynamic> payload,
  ) async {
    // If no vehicleId provided, try to get from storage
    vehicleId ??= await getActiveVehicleId();
    
    if (vehicleId == null) {
      print('❌ Cannot publish telemetry: No active vehicle ID');
      _lastError = 'Vehicle setup required before live upload';
      return PublishResult(
        httpOk: false,
        mqttOk: false,
        error: 'Vehicle setup required before live upload',
      );
    }

    return _publishLiveTelemetry(vehicleId, payload);
  }

  /// Publish live telemetry using the structured /mobile/telemetry/live endpoint.
  static Future<PublishResult> _publishLiveTelemetry(
    String vehicleId,
    Map<String, dynamic> payload,
  ) async {
    bool httpOk = false;
    bool mqttOk = false;
    bool socketOk = false;
    String? error;

    // Try MQTT if enabled
    if (await MqttTelemetryConfig.isEnabled()) {
      try {
        await MqttTelemetryService.instance.initialize();
        mqttOk = await MqttTelemetryService.instance.publishObd(payload);
      } catch (e) {
        print('⚠️ MQTT publish failed: $e');
      }
    }

    // Always try HTTP
    try {
      print('📤 Publishing telemetry: vehicleId=$vehicleId');
      
      await ApiService.instance.postLiveTelemetry(
        vehicleId: vehicleId,
        mode: 'LIVE',
        rpm: _toDouble(payload['rpm']),
        speed: _toDouble(payload['speed']),
        fuelLevel: _toDouble(payload['fuelLevel']) ?? _toDouble(payload['fuel']),
        coolantTemp: _toDouble(payload['coolantTemp']) ?? _toDouble(payload['coolant']),
        batteryVoltage: _toDouble(payload['batteryVoltage']) ?? _toDouble(payload['voltage']),
        engineLoad: _toDouble(payload['engineLoad']) ?? _toDouble(payload['load']),
        maf: _toDouble(payload['maf']),
        throttle: _toDouble(payload['throttle']) ?? _toDouble(payload['throttlePosition']),
        intakeTemp: _toDouble(payload['intakeTemp']) ?? _toDouble(payload['intake']),
        latitude: _toDouble(payload['latitude']),
        longitude: _toDouble(payload['longitude']),
        gpsAccuracy: _toDouble(payload['gpsAccuracy']),
        gpsAltitude: _toDouble(payload['gpsAltitude']),
        gpsHeading: _toDouble(payload['gpsHeading']),
        gpsTimestamp: payload['gpsTimestamp'] != null
          ? DateTime.parse(payload['gpsTimestamp'].toString())
          : null,
        vin: payload['vin'] as String?,
        odometer: _toDouble(payload['odometer']),
        timestamp: DateTime.now(),
      );
      
      httpOk = true;
      _lastUploadTime = DateTime.now();
      _lastError = null;
      print('✅ Telemetry published successfully');
      
      // Try Socket.IO for real-time updates
      try {
        SocketService.instance.emitLiveData(vehicleId, payload);
        socketOk = true;
      } catch (e) {
        print('⚠️ Socket.IO emit failed: $e');
      }
    } catch (e) {
      error = e.toString();
      _lastError = error;
      print('❌ HTTP telemetry publish failed: $e');
    }

    return PublishResult(
      httpOk: httpOk, 
      mqttOk: mqttOk, 
      socketOk: socketOk,
      error: error,
    );
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
      try {
        await MqttTelemetryService.instance.initialize();
        mqttOk = await MqttTelemetryService.instance.publishObdBatch(readings);
      } catch (e) {
        print('⚠️ MQTT batch publish failed: $e');
      }
    }

    var httpOk = false;
    try {
      // Publish each reading individually
      for (final reading in readings) {
        try {
          await ApiService.instance.postLiveTelemetry(
            vehicleId: vehicleId,
            mode: 'LIVE',
            rpm: _toDouble(reading['rpm']),
            speed: _toDouble(reading['speed']),
            fuelLevel: _toDouble(reading['fuelLevel']) ?? _toDouble(reading['fuel']),
            coolantTemp: _toDouble(reading['coolantTemp']) ?? _toDouble(reading['coolant']),
            batteryVoltage: _toDouble(reading['batteryVoltage']) ?? _toDouble(reading['voltage']),
            engineLoad: _toDouble(reading['engineLoad']) ?? _toDouble(reading['load']),
            maf: _toDouble(reading['maf']),
            throttle: _toDouble(reading['throttle']),
            intakeTemp: _toDouble(reading['intakeTemp']),
            latitude: _toDouble(reading['latitude']),
            longitude: _toDouble(reading['longitude']),
            gpsAccuracy: _toDouble(reading['gpsAccuracy']),
            gpsAltitude: _toDouble(reading['gpsAltitude']),
            gpsHeading: _toDouble(reading['gpsHeading']),
            gpsTimestamp: reading['gpsTimestamp'] != null
              ? DateTime.parse(reading['gpsTimestamp'].toString())
              : null,
            vin: reading['vin'] as String?,
            odometer: _toDouble(reading['odometer']),
            timestamp: reading['timestamp'] != null 
              ? DateTime.parse(reading['timestamp'].toString())
              : DateTime.now(),
          );
          httpOk = true;
        } catch (e) {
          print('⚠️ Batch item publish failed: $e');
          // Continue with next reading
        }
      }
    } catch (e) {
      print('❌ Batch publish failed: $e');
    }

    return mqttOk || httpOk;
  }
}

