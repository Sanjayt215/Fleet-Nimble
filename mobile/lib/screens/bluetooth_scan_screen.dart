import 'package:flutter/material.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart' hide BluetoothService;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/app_state.dart';
import '../services/bluetooth_service.dart';
import '../services/obd_service.dart';
import '../services/socket_service.dart';

class BluetoothScanScreen extends ConsumerStatefulWidget {
  const BluetoothScanScreen({super.key});

  @override
  ConsumerState<BluetoothScanScreen> createState() => _BluetoothScanScreenState();
}

class _BluetoothScanScreenState extends ConsumerState<BluetoothScanScreen> {
  final _bt = BluetoothService();
  final _obd = ObdService();
  List<ScanResult> _results = [];
  bool _scanning = false;
  String? _status;

  Future<void> _scan() async {
    setState(() { _scanning = true; _results = []; _status = 'Scanning...'; });
    try {
      await for (final batch in _bt.scanDevices()) {
        if (mounted) setState(() => _results = batch);
      }
    } catch (e) {
      setState(() => _status = e.toString());
    } finally {
      await _bt.stopScan();
      if (mounted) setState(() { _scanning = false; _status = 'Scan complete'; });
    }
  }

  Future<void> _connect(BluetoothDevice device) async {
    setState(() => _status = 'Connecting...');
    try {
      await _obd.connect(device);
      ref.read(connectedObdProvider.notifier).state = true;
      final vehicle = ref.read(selectedVehicleProvider);
      if (vehicle != null) {
        await SocketService.instance.connect();
        SocketService.instance.joinVehicle(vehicle.id);
      }
      setState(() => _status = 'Connected to ${device.platformName}');
    } catch (e) {
      setState(() => _status = 'Connect failed: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final connected = ref.watch(connectedObdProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('OBD Bluetooth'),
        actions: [
          if (connected)
            IconButton(
              icon: const Icon(Icons.link_off),
              onPressed: () async {
                await _obd.disconnect();
                ref.read(connectedObdProvider.notifier).state = false;
                setState(() => _status = 'Disconnected');
              },
            ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: Text(_status ?? (connected ? 'Connected' : 'Not connected'),
                      style: TextStyle(color: connected ? Colors.green : null)),
                ),
                FilledButton(
                  onPressed: _scanning ? null : _scan,
                  child: Text(_scanning ? 'Scanning...' : 'Scan'),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView.builder(
              itemCount: _results.length,
              itemBuilder: (_, i) {
                final r = _results[i];
                return ListTile(
                  leading: const Icon(Icons.bluetooth),
                  title: Text(r.device.platformName.isEmpty ? 'Unknown' : r.device.platformName),
                  subtitle: Text(r.device.remoteId.str),
                  onTap: () => _connect(r.device),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
