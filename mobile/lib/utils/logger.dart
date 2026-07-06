import 'package:flutter/foundation.dart';

final logger = _Logger();

class _Logger {
  void info(String message) {
    debugPrint('[INFO] $message');
  }

  void warning(String message) {
    debugPrint('[WARNING] $message');
  }

  void error(String message, {Object? error, StackTrace? stackTrace}) {
    debugPrint('[ERROR] $message');
    if (error != null) {
      debugPrint('  Error: $error');
    }
    if (stackTrace != null) {
      debugPrint('  StackTrace: $stackTrace');
    }
  }
}
