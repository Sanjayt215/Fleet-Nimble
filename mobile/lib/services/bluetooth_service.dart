import 'dart:async';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';

class BluetoothService {
  Stream<List<ScanResult>> scanDevices({Duration timeout = const Duration(seconds: 10)}) async* {
    if (await FlutterBluePlus.isSupported == false) {
      throw Exception('Bluetooth not supported');
    }
    await FlutterBluePlus.startScan(timeout: timeout);
    await for (final results in FlutterBluePlus.scanResults) {
      yield results.where((r) {
        final name = r.device.platformName.toUpperCase();
        return name.contains('OBD') ||
            name.contains('ELM') ||
            name.contains('VLINK') ||
            name.contains('OBDII');
      }).toList();
    }
  }

  Future<void> stopScan() => FlutterBluePlus.stopScan();

  Future<BluetoothDevice?> connect(BluetoothDevice device) async {
    await device.connect(timeout: const Duration(seconds: 15));
    return device;
  }

  Future<void> disconnect(BluetoothDevice device) async {
    await device.disconnect();
  }
}
