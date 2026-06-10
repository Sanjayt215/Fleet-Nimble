class PidParser {
  static final Map<String, PidDef> pids = {
    '010C': PidDef('rpm', 2, (a, b) => ((a * 256) + b) / 4),
    '010D': PidDef('speed', 1, (a, _) => a.toDouble()),
    '0105': PidDef('coolantTemp', 1, (a, _) => a - 40.0),
    '012F': PidDef('fuelLevel', 1, (a, _) => (a * 100) / 255),
    '0104': PidDef('engineLoad', 1, (a, _) => (a * 100) / 255),
    '0110': PidDef('maf', 2, (a, b) => ((a * 256) + b) / 100),
    '010F': PidDef('intakeTemp', 1, (a, _) => a - 40.0),
    '0111': PidDef('throttle', 1, (a, _) => (a * 100) / 255),
  };

  static String cleanResponse(String raw) {
    return raw
        .replaceAll(RegExp(r'[\r\n>]'), ' ')
        .replaceAll(RegExp(r'SEARCHING\.\.\.', caseSensitive: false), '')
        .replaceAll(RegExp(r'NO DATA', caseSensitive: false), '')
        .trim()
        .toUpperCase();
  }

  static Map<String, double>? parse(String pid, String response) {
    final def = pids[pid.toUpperCase()];
    if (def == null) return null;

    final parts = cleanResponse(response).split(RegExp(r'\s+')).where((p) {
      return RegExp(r'^[0-9A-F]{2}$').hasMatch(p);
    }).toList();

    if (parts.length < 4) return null;

    int start = 2;
    for (int i = 0; i < parts.length - 1; i++) {
      if (parts[i] == '41') {
        start = i + 2;
        break;
      }
    }

    final bytes = parts.skip(start).take(def.bytes).map((h) => int.parse(h, radix: 16)).toList();
    if (bytes.length < def.bytes) return null;

    final value = def.bytes == 1
        ? def.formula(bytes[0], 0)
        : def.formula(bytes[0], bytes[1]);

    return {def.name: double.parse(value.toStringAsFixed(2))};
  }

  static double? parseBattery(String raw) {
    final v = double.tryParse(raw.replaceAll(RegExp(r'[^0-9.]'), ''));
    return v;
  }
}

class PidDef {
  final String name;
  final int bytes;
  final double Function(int, int) formula;
  const PidDef(this.name, this.bytes, this.formula);
}
