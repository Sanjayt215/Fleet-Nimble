import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/vehicle.dart';
import '../providers/app_state.dart';
import '../services/api_service.dart';

class VehicleSelectorScreen extends ConsumerStatefulWidget {
  const VehicleSelectorScreen({super.key});

  @override
  ConsumerState<VehicleSelectorScreen> createState() => _VehicleSelectorScreenState();
}

class _VehicleSelectorScreenState extends ConsumerState<VehicleSelectorScreen> {
  List<Vehicle> _vehicles = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final list = await ApiService.instance.getVehicles();
      setState(() { _vehicles = list; _loading = false; });
    } catch (e) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final selected = ref.watch(selectedVehicleProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Select Vehicle')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView.builder(
                itemCount: _vehicles.length,
                itemBuilder: (_, i) {
                  final v = _vehicles[i];
                  final isSelected = selected?.id == v.id;
                  return ListTile(
                    leading: Icon(Icons.directions_car, color: isSelected ? Colors.blue : null),
                    title: Text(v.displayName),
                    subtitle: Text(v.plateNumber ?? v.vin ?? ''),
                    trailing: isSelected ? const Icon(Icons.check_circle, color: Colors.green) : null,
                    onTap: () {
                      ref.read(selectedVehicleProvider.notifier).state = v;
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Selected ${v.displayName}')),
                      );
                    },
                  );
                },
              ),
            ),
    );
  }
}
