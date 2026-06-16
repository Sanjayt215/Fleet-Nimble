import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';
import '../utils/config.dart';
import 'home_screen.dart';
import 'vehicle_setup_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController(text: 'admin@fleetnimble.com');
  final _password = TextEditingController(text: 'Admin123!');
  bool _loading = false;
  String? _error;

  Future<void> _login() async {
    setState(() { _loading = true; _error = null; });
    try {
      await ApiService.instance.login(_email.text.trim(), _password.text);
      if (!mounted) return;
      
      // If backup mode enabled, skip vehicle setup and go directly to home
      if (AppConfig.useFixedFleetVehicleId) {
        final prefs = await SharedPreferences.getInstance();
        // Store the fixed vehicle ID for reference
        await prefs.setString('vehicleId', AppConfig.fixedFleetVehicleId);
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const HomeScreen()),
        );
      } else {
        // Original flow: check if vehicle exists
        final prefs = await SharedPreferences.getInstance();
        final hasVehicle = prefs.getString('vehicleId') != null;
        
        if (hasVehicle) {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(builder: (_) => const HomeScreen()),
          );
        } else {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(builder: (_) => const VehicleSetupScreen()),
          );
        }
      }
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              const Icon(Icons.directions_car, size: 56, color: Color(0xFF2563EB)),
              const Text('FleetNimble', textAlign: TextAlign.center, style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
              const Text('FleetNimble Telematics Platform', textAlign: TextAlign.center, style: TextStyle(fontSize: 14, color: Colors.grey)),
              if (AppConfig.useFixedFleetVehicleId)
                Container(
                  margin: const EdgeInsets.only(top: 12),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.orange.withOpacity(0.2),
                    border: Border.all(color: Colors.orange),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    '⚙️ Backup Mode: Fixed Vehicle ID\nVehicle setup skipped',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12, color: Colors.orange),
                  ),
                ),
              const SizedBox(height: 32),
              if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
              TextField(controller: _email, decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder())),
              const SizedBox(height: 12),
              TextField(controller: _password, obscureText: true, decoration: const InputDecoration(labelText: 'Password', border: OutlineInputBorder())),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _loading ? null : _login,
                child: Text(_loading ? 'Signing in...' : 'Sign In'),
              ),
              const Spacer(),
            ],
          ),
        ),
      ),
    );
  }
}
