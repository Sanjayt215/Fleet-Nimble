import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/vehicle.dart';
import '../models/live_data.dart';

final selectedVehicleProvider = StateProvider<Vehicle?>((ref) => null);
final liveDataProvider = StateProvider<LiveData>((ref) => LiveData());
final connectedObdProvider = StateProvider<bool>((ref) => false);
final activeTripIdProvider = StateProvider<String?>((ref) => null);
