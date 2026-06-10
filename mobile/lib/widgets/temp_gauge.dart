import 'package:flutter/material.dart';

class TempGauge extends StatelessWidget {
  final double? celsius;

  const TempGauge({super.key, this.celsius});

  @override
  Widget build(BuildContext context) {
    final t = celsius ?? 0;
    final color = t > 100 ? Colors.red : t > 85 ? Colors.orange : Colors.blue;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Icon(Icons.thermostat, color: color, size: 28),
            Text('${t.toStringAsFixed(0)}°C', style: TextStyle(fontWeight: FontWeight.bold, color: color)),
            const Text('Coolant', style: TextStyle(fontSize: 11, color: Colors.grey)),
          ],
        ),
      ),
    );
  }
}
