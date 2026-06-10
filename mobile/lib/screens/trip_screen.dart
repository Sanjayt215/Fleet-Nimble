import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/app_state.dart';
import '../services/api_service.dart';
import '../services/gps_service.dart';
import '../services/socket_service.dart';

class TripScreen extends ConsumerStatefulWidget {
  const TripScreen({super.key});

  @override
  ConsumerState<TripScreen> createState() => _TripScreenState();
}

class _TripScreenState extends ConsumerState<TripScreen> {
  final _gps = GpsService();
  StreamSubscription? _gpsSub;
  bool _tracking = false;

  Future<void> _start() async {
    final vehicle = ref.read(selectedVehicleProvider);
    if (vehicle == null) return;
    final pos = await _gps.getCurrentPosition();
    if (pos == null) return;

    final tripId = await ApiService.instance.startTrip(vehicle.id, pos.latitude, pos.longitude);
    ref.read(activeTripIdProvider.notifier).state = tripId;
    setState(() => _tracking = true);

    _gpsSub = _gps.getPositionStream().listen((p) {
      final tid = ref.read(activeTripIdProvider);
      if (tid != null) {
        ApiService.instance.updateGps(tid, p.latitude, p.longitude);
        SocketService.instance.emitGps(tid, p.latitude, p.longitude);
      }
    });
  }

  void _stop() {
    _gpsSub?.cancel();
    ref.read(activeTripIdProvider.notifier).state = null;
    setState(() => _tracking = false);
  }

  @override
  void dispose() {
    _gpsSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Trip Tracking')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(_tracking ? Icons.gps_fixed : Icons.gps_off, size: 64, color: _tracking ? Colors.green : Colors.grey),
            const SizedBox(height: 16),
            Text(_tracking ? 'Trip in progress' : 'Not tracking'),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _tracking ? _stop : _start,
              child: Text(_tracking ? 'Stop Trip' : 'Start Trip'),
            ),
          ],
        ),
      ),
    );
  }
}
