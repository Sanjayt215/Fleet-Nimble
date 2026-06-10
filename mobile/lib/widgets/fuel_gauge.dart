import 'package:flutter/material.dart';

class FuelGauge extends StatelessWidget {
  final double? percent;

  const FuelGauge({super.key, this.percent});

  @override
  Widget build(BuildContext context) {
    final p = ((percent ?? 0) / 100).clamp(0.0, 1.0);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.local_gas_station, color: p < 0.15 ? Colors.red : Colors.amber, size: 32),
        const SizedBox(height: 8),
        LinearProgressIndicator(
          value: p,
          minHeight: 8,
          backgroundColor: Colors.grey.shade300,
          color: p < 0.15 ? Colors.red : Colors.green,
        ),
        const SizedBox(height: 4),
        Text('${(percent ?? 0).toStringAsFixed(0)}%', style: const TextStyle(fontWeight: FontWeight.bold)),
        const Text('Fuel', style: TextStyle(fontSize: 11, color: Colors.grey)),
      ],
    );
  }
}
