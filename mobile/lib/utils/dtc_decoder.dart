class DtcDecoder {
  static const _prefix = ['P', 'C', 'B', 'U'];

  static String? decodeBytes(int b1, int b2) {
    final type = (b1 >> 6) & 0x03;
    final d1 = (b1 >> 4) & 0x03;
    final d2 = b1 & 0x0f;
    final d3 = (b2 >> 4) & 0x0f;
    final d4 = b2 & 0x0f;
    final prefix = type < _prefix.length ? _prefix[type] : 'P';
    return '$prefix$d1${d2.toRadixString(16).toUpperCase()}${d3.toRadixString(16).toUpperCase()}${d4.toRadixString(16).toUpperCase()}';
  }

  static List<String> parseResponse(String raw) {
    final parts = raw
        .replaceAll(RegExp(r'[\r\n>]'), ' ')
        .trim()
        .toUpperCase()
        .split(RegExp(r'\s+'))
        .where((p) => RegExp(r'^[0-9A-F]{2}$').hasMatch(p))
        .toList();

    final codes = <String>{};
    int i = 0;
    while (i < parts.length) {
      if (parts[i] == '43' || parts[i] == '47') {
        final count = int.tryParse(parts[i + 1], radix: 16) ?? 0;
        i += 2;
        for (int j = 0; j < count && i + 1 < parts.length; j++) {
          final b1 = int.parse(parts[i], radix: 16);
          final b2 = int.parse(parts[i + 1], radix: 16);
          final code = decodeBytes(b1, b2);
          if (code != null) codes.add(code);
          i += 2;
        }
        continue;
      }
      if (RegExp(r'^[PCBU][0-9A-F]{4}$').hasMatch(parts[i])) {
        codes.add(parts[i]);
      }
      i++;
    }
    return codes.toList();
  }

  static String description(String code) {
    const map = {
      'P0300': 'Random/Multiple Cylinder Misfire',
      'P0420': 'Catalyst Efficiency Below Threshold',
      'P0171': 'System Too Lean',
    };
    return map[code.toUpperCase()] ?? 'Diagnostic trouble code $code';
  }
}
