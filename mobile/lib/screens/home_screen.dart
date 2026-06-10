import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'vehicle_selector_screen.dart';
import 'bluetooth_scan_screen.dart';
import 'gauges_screen.dart';
import 'dtc_screen.dart';
import 'trip_screen.dart';
import 'alerts_screen.dart';
import 'settings_screen.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  int _index = 0;

  final _pages = const [
    VehicleSelectorScreen(),
    BluetoothScanScreen(),
    GaugesScreen(),
    DtcScreen(),
    TripScreen(),
    AlertsScreen(),
    SettingsScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _pages[_index],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.directions_car), label: 'Vehicle'),
          NavigationDestination(icon: Icon(Icons.bluetooth), label: 'OBD'),
          NavigationDestination(icon: Icon(Icons.speed), label: 'Gauges'),
          NavigationDestination(icon: Icon(Icons.warning), label: 'DTC'),
          NavigationDestination(icon: Icon(Icons.route), label: 'Trip'),
          NavigationDestination(icon: Icon(Icons.notifications), label: 'Alerts'),
          NavigationDestination(icon: Icon(Icons.settings), label: 'Settings'),
        ],
      ),
    );
  }
}
