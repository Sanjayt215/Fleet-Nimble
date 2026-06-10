import 'package:flutter/material.dart';

class AlertsScreen extends StatelessWidget {
  const AlertsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Alerts')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: const [
          ListTile(
            leading: Icon(Icons.warning, color: Colors.orange),
            title: Text('Alerts sync from dashboard'),
            subtitle: Text('Vehicle telemetry alerts appear on the web dashboard in real time.'),
          ),
        ],
      ),
    );
  }
}
