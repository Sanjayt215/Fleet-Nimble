import 'dart:async';
import 'dart:isolate';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../utils/logger.dart';

/// FleetNimble foreground service for continuous OBD + GPS monitoring.
/// Keeps the app running in the background, polling OBD data and GPS location
/// every 2-3 seconds, and uploading telemetry to the backend.
class ForegroundService {
  static const String _tag = 'ForegroundService';

  /// Initialize and start the foreground service.
  static Future<bool> start() async {
    try {
      logger.info('$_tag: Initializing foreground task');
      
      // Initialize the foreground task
      FlutterForegroundTask.init(
        androidNotificationOptions: AndroidNotificationOptions(
          channelId: 'fleetnimble_obd',
          channelName: 'FleetNimble OBD Service',
          channelDescription: 'Keeps OBD and GPS monitoring active in background',
          channelImportance: NotificationChannelImportance.LOW,
          priority: NotificationPriority.LOW,
          iconData: const NotificationIconData(
            resType: ResourceType.mipmap,
            resPrefix: ResourcePrefix.ic,
            name: 'launcher',
          ),
        ),
        iosNotificationOptions: const IOSNotificationOptions(
          showNotification: true,
          playSound: false,
        ),
        foregroundTaskOptions: const ForegroundTaskOptions(
          interval: 3000, // Poll every 3 seconds
          isOnceEvent: false,
          autoRunOnBoot: false,
          allowWakeLock: true,
          allowWifiLock: true,
        ),
      );

      // Check if we have vehicle setup
      final prefs = await SharedPreferences.getInstance();
      final vehicleId = prefs.getString('activeVehicleId');
      
      if (vehicleId == null) {
        logger.warning('$_tag: Cannot start foreground service - no vehicle ID');
        return false;
      }

      // Start the service
      final started = await FlutterForegroundTask.startService(
        notificationTitle: 'FleetNimble Active',
        notificationText: 'OBD monitoring and GPS tracking',
        callback: startCallback,
      );

      if (started) {
        logger.info('$_tag: Foreground service started successfully');
      } else {
        logger.error('$_tag: Failed to start foreground service');
      }

      return started;
    } catch (e, stack) {
      logger.error('$_tag: Error starting foreground service', error: e, stackTrace: stack);
      return false;
    }
  }

  /// Stop the foreground service.
  static Future<bool> stop() async {
    try {
      logger.info('$_tag: Stopping foreground service');
      final stopped = await FlutterForegroundTask.stopService();
      
      if (stopped) {
        logger.info('$_tag: Foreground service stopped successfully');
      } else {
        logger.warning('$_tag: Foreground service stop returned false');
      }
      
      return stopped;
    } catch (e, stack) {
      logger.error('$_tag: Error stopping foreground service', error: e, stackTrace: stack);
      return false;
    }
  }

  /// Check if the foreground service is currently running.
  static Future<bool> isRunning() async {
    return await FlutterForegroundTask.isRunningService;
  }

  /// Update the notification text.
  static Future<void> updateNotification({
    required String title,
    required String text,
  }) async {
    await FlutterForegroundTask.updateService(
      notificationTitle: title,
      notificationText: text,
    );
  }
}

/// Entry point for the foreground task isolate.
/// This function runs in a separate isolate and handles the background work.
@pragma('vm:entry-point')
void startCallback() {
  FlutterForegroundTask.setTaskHandler(OBDTaskHandler());
}

/// Task handler for OBD and GPS polling in the foreground service.
/// This runs in an isolate separate from the main app.
class OBDTaskHandler extends TaskHandler {
  static const String _tag = 'OBDTaskHandler';
  
  SendPort? _sendPort;
  int _updateCount = 0;

  @override
  void onStart(DateTime timestamp, SendPort? sendPort) async {
    _sendPort = sendPort;
    logger.info('$_tag: Task handler started at $timestamp');
    
    // NOTE: In a real implementation, you would initialize the OBD service
    // and GPS service here. However, since these services use native plugins
    // and may not be accessible from the isolate, the actual polling should
    // happen in the main isolate, and this foreground service just keeps
    // the app alive in the background.
    
    // For now, this is a placeholder that demonstrates the structure.
    // The actual OBD polling should continue in the main app, and this
    // foreground service ensures the app doesn't get killed by the OS.
  }

  @override
  void onRepeatEvent(DateTime timestamp, SendPort? sendPort) async {
    _updateCount++;
    
    // This is called every 3 seconds (configured in foreground task options)
    // In a production app, you might:
    // 1. Poll OBD data via the OBD service (if accessible from isolate)
    // 2. Get GPS location via geolocator (if accessible from isolate)
    // 3. Upload telemetry via HTTP (if accessible from isolate)
    
    // For FleetNimble, the main app handles the actual OBD/GPS/HTTP work,
    // and this foreground service just keeps the notification alive and
    // prevents the OS from killing the app.
    
    // Send heartbeat to main app
    _sendPort?.send({
      'type': 'heartbeat',
      'timestamp': timestamp.toIso8601String(),
      'updateCount': _updateCount,
    });

    // Update notification with status
    if (_updateCount % 10 == 0) {
      // Update every 30 seconds (10 * 3 seconds)
      FlutterForegroundTask.updateService(
        notificationTitle: 'FleetNimble Active',
        notificationText: 'OBD monitoring - $_updateCount updates',
      );
    }
  }

  @override
  void onDestroy(DateTime timestamp, SendPort? sendPort) async {
    logger.info('$_tag: Task handler destroyed at $timestamp');
    
    // Cleanup resources
    _sendPort?.send({
      'type': 'stopped',
      'timestamp': timestamp.toIso8601String(),
    });
  }

  @override
  void onNotificationButtonPressed(String id) {
    // Handle notification button presses if needed
    logger.info('$_tag: Notification button pressed: $id');
  }

  @override
  void onNotificationPressed() {
    // Handle notification tap - could navigate to app
    logger.info('$_tag: Notification tapped');
    FlutterForegroundTask.launchApp('/');
  }
}
