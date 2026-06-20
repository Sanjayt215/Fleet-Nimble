import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/app_state.dart';
import '../models/live_data.dart';
import '../services/obd_service.dart';
import '../services/gps_service.dart';
import '../services/offline_cache.dart';
import '../services/sync_service.dart';
import '../services/telemetry_publisher.dart';
import '../utils/config.dart';
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
  final _gps = GpsService();
  Timer? _pollTimer;
  StreamSubscription? _gpsSubscription;
  String? _lastUploadStatus;

  @override
  void initState() {
    super.initState();
    _startPolling();
    _startGps();
  }

  Future<void> _startGps() async {
    final hasPermission = await _gps.ensurePermission();
    if (!hasPermission) return;

    _gpsSubscription = _gps.getPositionStream().listen((position) {
      final current = ref.read(liveDataProvider);
      ref.read(liveDataProvider.notifier).state = current.merge({
        'latitude': position.latitude,
        'longitude': position.longitude,
        'gpsAccuracy': position.accuracy,
        'gpsAltitude': position.altitude,
        'gpsHeading': position.heading,
        'gpsTimestamp': DateTime.now(),
      });
    });
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 2), (_) => _poll());
  }

  Future<void> _poll() async {
    if (!_obd.isConnected) return;
    
    // Determine vehicle ID: use fixed ID if in backup mode, otherwise use selected vehicle
    String? vehicleId;
    if (AppConfig.useFixedFleetVehicleId) {
      vehicleId = AppConfig.fixedFleetVehicleId;
      ref.read(httpStatusProvider.notifier).state = 'CONNECTING...';
    } else {
      final vehicle = ref.read(selectedVehicleProvider);
      if (vehicle == null) return;
      vehicleId = vehicle.id;
    }

    try {
      final parsed = await _obd.pollAllPids();
      LiveData live = ref.read(liveDataProvider).merge(parsed);
      
      // Get vehicle's VIN if available
      if (AppConfig.useFixedFleetVehicleId) {
        // Use fixed VIN or leave null
      } else {
        final vehicle = ref.read(selectedVehicleProvider);
        if (vehicle != null && vehicle.vin != null) {
          live = live.merge({'vin': vehicle.vin});
        }
      }
      
      ref.read(liveDataProvider.notifier).state = live;

      final payload = live.toJson();
      final result = await TelemetryPublisher.publishLiveData(vehicleId, payload);

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
        ref.read(httpStatusProvider.notifier).state = 'OK';
        ref.read(lastUploadTimeProvider.notifier).state = DateTime.now();
        await SyncService.retryPending();
      } else {
        await OfflineCache.queue('live_data', {'vehicleId': vehicleId, ...payload});
        if (mounted) setState(() => _lastUploadStatus = 'Queued offline');
        ref.read(httpStatusProvider.notifier).state = 'FAILED';
      }
    } catch (e) {
      ref.read(httpStatusProvider.notifier).state = 'FAILED';
    }
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _gpsSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final live = ref.watch(liveDataProvider);
    final connected = ref.watch(connectedObdProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Live Gauges'),
            if (AppConfig.useFixedFleetVehicleId)
              Text(
                'Fixed Vehicle ID Mode',
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.orange,
                ),
              ),
          ],
        ),
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
                  if (live.latitude != null && live.longitude != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('GPS Position', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                              const SizedBox(height: 8),
                              Text('Lat: ${live.latitude!.toStringAsFixed(5)}, Lng: ${live.longitude!.toStringAsFixed(5)}'),
                              if (live.gpsAccuracy != null) Text('Accuracy: ${live.gpsAccuracy!.toStringAsFixed(1)}m'),
                              if (live.gpsHeading != null) Text('Heading: ${live.gpsHeading!.toStringAsFixed(1)}°'),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
    );
  }
}
