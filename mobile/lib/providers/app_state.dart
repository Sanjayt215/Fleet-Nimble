import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/vehicle.dart';
import '../models/live_data.dart';
import '../utils/config.dart';

final selectedVehicleProvider = StateProvider<Vehicle?>((ref) => null);
final liveDataProvider = StateProvider<LiveData>((ref) => LiveData());
final connectedObdProvider = StateProvider<bool>((ref) => false);
final activeTripIdProvider = StateProvider<String?>((ref) => null);

// Backup mode: Track if using fixed vehicle ID
final useFixedVehicleIdProvider = StateProvider<bool>((ref) => AppConfig.useFixedFleetVehicleId);
final fixedVehicleIdProvider = StateProvider<String>((ref) => AppConfig.fixedFleetVehicleId);
final tokenStatusProvider = StateProvider<String>((ref) => 'UNKNOWN'); // VALID, INVALID, EXPIRED
final lastUploadTimeProvider = StateProvider<DateTime?>((ref) => null);
final httpStatusProvider = StateProvider<String>((ref) => 'IDLE'); // OK, FAILED, IDLE
