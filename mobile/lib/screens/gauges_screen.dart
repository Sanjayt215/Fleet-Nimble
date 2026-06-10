import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/app_state.dart';
import '../services/obd_service.dart';
import '../services/offline_cache.dart';
import '../services/sync_service.dart';
import '../services/telemetry_publisher.dart';
import '../widgets/rpm_gauge.dart';
import '../widgets/fuel_gauge.dart';
import '../widgets/temp_gauge.dart';
import '../widgets/live_card.dart';

class GaugesScreen extends ConsumerStatefulWidget {
  const GaugesScreen({super.key});

  @override
  ConsumerState<GaugesScreen> createState() => _GaugesScreenState();
}

class _GaugesScreenState extends ConsumerState<GaugesScreen> {
  final _obd = ObdService();
  Timer? _pollTimer;
  String? _lastUploadStatus;

  @override
  void initState() {
    super.initState();
    _startPolling();
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 2), (_) => _poll());
  }

  Future<void> _poll() async {
    if (!_obd.isConnected) return;
    final vehicle = ref.read(selectedVehicleProvider);
    if (vehicle == null) return;

    try {
      final parsed = await _obd.pollAllPids();
      final live = ref.read(liveDataProvider).merge(parsed);
      ref.read(liveDataProvider.notifier).state = live;

      final payload = live.toJson();
      final result = await TelemetryPublisher.publishLiveData(vehicle.id, payload);

      if (result.anySuccess) {
        if (mounted) {
          setState(() {
            if (result.mqttOk && result.httpOk) {
              _lastUploadStatus = 'Cloud MQTT + HTTP';
            } else if (result.mqttOk) {
              _lastUploadStatus = 'Cloud MQTT';
            } else {
              _lastUploadStatus = 'HTTP';
            }
          });
        }
        await SyncService.retryPending();
      } else {
        await OfflineCache.queue('live_data', {'vehicleId': vehicle.id, ...payload});
        if (mounted) setState(() => _lastUploadStatus = 'Queued offline');
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final live = ref.watch(liveDataProvider);
    final connected = ref.watch(connectedObdProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Live Gauges'),
        actions: [
          if (_lastUploadStatus != null)
            Center(
              child: Padding(
                padding: const EdgeInsets.only(right: 12),
                child: Text(
                  _lastUploadStatus!,
                  style: TextStyle(
                    fontSize: 12,
                    color: _lastUploadStatus!.contains('Queued')
                        ? Colors.orange
                        : Colors.greenAccent,
                  ),
                ),
              ),
            ),
        ],
      ),
      body: !connected
          ? const Center(child: Text('Connect OBD device first'))
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      RpmGauge(value: live.rpm),
                      FuelGauge(percent: live.fuelLevel),
                      TempGauge(celsius: live.coolantTemp),
                    ],
                  ),
                  const SizedBox(height: 16),
                  GridView.count(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisCount: 2,
                    childAspectRatio: 1.4,
                    children: [
                      LiveCard(label: 'Speed', value: '${live.speed?.toInt() ?? '—'}', unit: 'km/h', icon: Icons.speed),
                      LiveCard(label: 'Load', value: '${live.engineLoad?.toInt() ?? '—'}', unit: '%', icon: Icons.engineering),
                      LiveCard(label: 'Throttle', value: '${live.throttle?.toInt() ?? '—'}', unit: '%', icon: Icons.tune),
                      LiveCard(label: 'Battery', value: live.batteryVoltage?.toStringAsFixed(1) ?? '—', unit: 'V', icon: Icons.battery_charging_full),
                    ],
                  ),
                ],
              ),
            ),
    );
  }
}
