import 'dart:async';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import '../utils/pid_parser.dart';
import '../utils/dtc_decoder.dart';

/// ELM327 OBD-II service over Bluetooth
class ObdService {
  static final ObdService instance = ObdService._();
  ObdService._();
  factory ObdService() => instance;

  BluetoothDevice? _device;
  BluetoothCharacteristic? _writeChar;
  BluetoothCharacteristic? _readChar;
  final _responseBuffer = StringBuffer();
  StreamSubscription<List<int>>? _notifySub;

  static const initCommands = ['ATZ', 'ATE0', 'ATL0', 'ATH0', 'ATSP0'];
  static const pidCommands = [
    '010C', '010D', '0105', '012F', '0104', '0110', '010F', '0111',
  ];

  bool get isConnected => _device != null;

  /// Read VIN from ECU using mode 09 PID 02
  Future<String> readVin() async {
    if (_writeChar == null) throw Exception('Not connected');
    return await sendCommand('0902');
  }

  Future<void> connect(BluetoothDevice device) async {
    _device = device;
    await device.connect();
    final services = await device.discoverServices();

    for (final service in services) {
      for (final char in service.characteristics) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
          _writeChar ??= char;
        }
        if (char.properties.notify || char.properties.indicate) {
          _readChar ??= char;
        }
      }
    }

    if (_writeChar == null) {
      throw Exception('No writable OBD characteristic found');
    }

    if (_readChar != null) {
      await _readChar!.setNotifyValue(true);
      _notifySub = _readChar!.lastValueStream.listen(_onData);
    }

    for (final cmd in initCommands) {
      await sendCommand(cmd);
      await Future.delayed(const Duration(milliseconds: 300));
    }
  }

  void _onData(List<int> data) {
    _responseBuffer.write(String.fromCharCodes(data));
  }

  Future<String> sendCommand(String cmd) async {
    if (_writeChar == null) throw Exception('Not connected');
    _responseBuffer.clear();
    final line = cmd.endsWith('\r') ? cmd : '$cmd\r';
    await _writeChar!.write(line.codeUnits, withoutResponse: true);
    await Future.delayed(const Duration(milliseconds: 500));
    return _responseBuffer.toString();
  }

  Future<Map<String, double>> pollAllPids() async {
    final result = <String, double>{};
    for (final pid in pidCommands) {
      try {
        final raw = await sendCommand(pid);
        final parsed = PidParser.parse(pid, raw);
        if (parsed != null) result.addAll(parsed);
      } catch (_) {}
      await Future.delayed(const Duration(milliseconds: 100));
    }
    try {
      final batt = await sendCommand('ATRV');
      final v = PidParser.parseBattery(batt);
      if (v != null) result['batteryVoltage'] = v;
    } catch (_) {}
    return result;
  }

  Future<List<String>> readDtc() async {
    final raw = await sendCommand('03');
    return DtcDecoder.parseResponse(raw);
  }

  Future<String?> readVin() async {
    try {
      print('🔍 Reading VIN from ECU...');
      final raw = await sendCommand('0902');
      print('📥 VIN raw response: $raw');
      return _parseVin(raw);
    } catch (e) {
      print('❌ VIN read error: $e');
      return null;
    }
  }

  String? _parseVin(String response) {
    if (response.isEmpty) return null;

    // Remove common response artifacts
    String cleaned = response
        .toUpperCase()
        .replaceAll('49 02', '')
        .replaceAll('49', '')
        .replaceAll('02', '')
        .replaceAll(RegExp(r'[0-4]:'), '')
        .replaceAll('>', '')
        .replaceAll('\r', '')
        .replaceAll('\n', ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();

    // Extract hex bytes
    List<String> hexBytes = cleaned.split(' ').where((s) => s.isNotEmpty).toList();
    
    // Skip frame counters
    hexBytes = hexBytes.where((byte) {
      if (byte.length == 2 && byte[1] == '0') {
        int? value = int.tryParse(byte, radix: 16);
        if (value != null && value % 16 == 0 && value < 256) {
          return false;
        }
      }
      return true;
    }).toList();

    // Convert hex to ASCII
    StringBuffer vinBuffer = StringBuffer();
    for (String hexByte in hexBytes) {
      if (hexByte.length == 2) {
        try {
          int? charCode = int.tryParse(hexByte, radix: 16);
          if (charCode != null && charCode >= 32 && charCode <= 126) {
            vinBuffer.write(String.fromCharCode(charCode));
          }
        } catch (_) {}
      }
    }

    String vin = vinBuffer.toString().trim();
    
    // Extract valid VIN characters only
    vin = vin.replaceAll(RegExp(r'[^A-HJ-NPR-Z0-9]'), '');
    
    if (vin.length >= 17) {
      return vin.substring(0, 17);
    }
    
    return null;
  }

  Future<void> clearDtc() async {
    await sendCommand('04');
  }

  Future<void> disconnect() async {
    await _notifySub?.cancel();
    await _device?.disconnect();
    _device = null;
    _writeChar = null;
    _readChar = null;
  }
}
