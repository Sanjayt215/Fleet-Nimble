import 'dart:convert';
import 'api_service.dart';
import 'offline_cache.dart';
import 'telemetry_publisher.dart';

class SyncService {
  static Future<void> retryPending() async {
    final pending = await OfflineCache.getPending();
    final liveBatch = <String, List<Map<String, dynamic>>>{};

    for (final row in pending) {
      try {
        final payload = jsonDecode(row['payload'] as String) as Map<String, dynamic>;
        final type = row['type'] as String;

        if (type == 'live_data') {
          final vehicleId = payload['vehicleId'] as String;
          final reading = Map<String, dynamic>.from(payload)..remove('vehicleId');
          liveBatch.putIfAbsent(vehicleId, () => []).add(reading);
          await OfflineCache.remove(row['id'] as int);
        } else if (type == 'dtc') {
          await ApiService.instance.postDtc(
            payload['vehicleId'] as String,
            (payload['codes'] as List).cast<String>(),
          );
          await OfflineCache.remove(row['id'] as int);
        }
      } catch (_) {
        break;
      }
    }

    for (final entry in liveBatch.entries) {
      try {
        if (entry.value.length == 1) {
          await TelemetryPublisher.publishLiveData(entry.key, entry.value.first);
        } else {
          await TelemetryPublisher.publishOfflineBatch(entry.key, entry.value);
        }
      } catch (_) {}
    }
  }
}
