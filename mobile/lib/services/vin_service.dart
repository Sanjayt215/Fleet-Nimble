// ignore_for_file: avoid_print

import 'dart:async';
import 'obd_service.dart';

/// Service for reading and validating VIN from OBD
class VinService {
  static final VinService instance = VinService._();
  VinService._();

  /// Read VIN from OBD ECU using mode 09 PID 02
  Future<String?> readVinFromObd() async {
    final obd = ObdService.instance;
    if (!obd.isConnected) {
      throw Exception('OBD not connected');
    }

    // Try reading VIN up to 3 times
    for (int attempt = 1; attempt <= 3; attempt++) {
      try {
        print('🔍 VIN read attempt $attempt/3');
        
        // Send command 0902 to read VIN
        final response = await obd.sendCommand('0902');
        print('📥 VIN response: $response');
        
        // Parse multiline VIN response
        final vin = _parseVinResponse(response);
        
        if (vin != null && _validateVin(vin)) {
          print('✅ Valid VIN found: $vin');
          return vin;
        } else {
          print('⚠️ Invalid VIN on attempt $attempt: $vin');
        }
        
        // Wait before retry
        if (attempt < 3) {
          await Future.delayed(Duration(seconds: 2));
        }
      } catch (e) {
        print('❌ VIN read error attempt $attempt: $e');
        if (attempt == 3) rethrow;
      }
    }
    
    return null; // All attempts failed
  }

  /// Parse VIN from OBD response (handles multiline)
  String? _parseVinResponse(String response) {
    if (response.isEmpty) return null;

    // Remove common response artifacts
    String cleaned = response
        .toUpperCase()
        .replaceAll('49 02', '') // Remove mode response header
        .replaceAll('49', '')
        .replaceAll('02', '')
        .replaceAll('0:', '')
        .replaceAll('1:', '')
        .replaceAll('2:', '')
        .replaceAll('3:', '')
        .replaceAll('4:', '')
        .replaceAll('>', '')
        .replaceAll('\r', '')
        .replaceAll('\n', ' ')
        .replaceAll('  ', ' ')
        .trim();

    // Extract hex bytes
    List<String> hexBytes = cleaned.split(' ').where((s) => s.isNotEmpty).toList();
    
    // Skip first bytes if they're frame indicators
    hexBytes = hexBytes.where((byte) {
      // Remove frame counters (00, 10, 20, etc.)
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
    
    // VIN must be exactly 17 characters
    if (vin.length >= 17) {
      return vin.substring(0, 17);
    } else if (vin.length >= 15) {
      // Sometimes partial VIN, pad if close
      print('⚠️ Partial VIN detected: $vin (length: ${vin.length})');
      return vin;
    }
    
    return null;
  }

  /// Validate VIN format
  bool _validateVin(String vin) {
    if (vin.length != 17) {
      print('❌ VIN validation failed: length is ${vin.length}, expected 17');
      return false;
    }

    // Check allowed characters (A-H, J-N, P, R-Z, 0-9)
    // Note: I, O, Q are excluded from VINs to avoid confusion with 1, 0
    final validPattern = RegExp(r'^[A-HJ-NPR-Z0-9]{17}$');
    if (!validPattern.hasMatch(vin)) {
      print('❌ VIN validation failed: invalid characters');
      return false;
    }

    print('✅ VIN validation passed');
    return true;
  }

  /// Clean VIN string (remove spaces, special chars, convert to uppercase)
  String cleanVin(String vin) {
    return vin
        .toUpperCase()
        .replaceAll(RegExp(r'[^A-HJ-NPR-Z0-9]'), '')
        .trim();
  }
}
