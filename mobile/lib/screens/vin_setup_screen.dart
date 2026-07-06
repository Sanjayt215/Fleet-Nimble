// ignore_for_file: avoid_print

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';
import '../services/vin_service.dart';
import '../services/obd_service.dart';

/// Screen for VIN reading, decoding, and vehicle setup
class VinSetupScreen extends StatefulWidget {
  const VinSetupScreen({super.key});

  @override
  State<VinSetupScreen> createState() => _VinSetupScreenState();
}

class _VinSetupScreenState extends State<VinSetupScreen> {
  final _vinService = VinService.instance;
  final _apiService = ApiService.instance;
  final _obdService = ObdService.instance;
  
  String? _vin;
  Map<String, dynamic>? _decodedData;
  bool _isReading = false;
  bool _isDecoding = false;
  bool _isSettingUp = false;
  String? _error;
  bool _isManualEntry = false;
  
  final _vinController = TextEditingController();
  final _vehicleNameController = TextEditingController();
  final _regNumberController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _readVinFromObd();
  }

  Future<void> _readVinFromObd() async {
    if (!_obdService.isConnected) {
      setState(() {
        _error = 'OBD not connected. Please connect to OBD first.';
      });
      return;
    }

    setState(() {
      _isReading = true;
      _error = null;
    });

    try {
      final vin = await _vinService.readVinFromObd();
      
      if (vin != null) {
        setState(() {
          _vin = vin;
          _vinController.text = vin;
        });
        await _decodeVin(vin);
      } else {
        setState(() {
          _error = 'Failed to read VIN from vehicle ECU after 3 attempts.\nYou can enter vehicle details manually.';
          _isManualEntry = true;
        });
      }
    } catch (e) {
      setState(() {
        _error = 'Error reading VIN: $e\nYou can enter vehicle details manually.';
        _isManualEntry = true;
      });
    } finally {
      setState(() {
        _isReading = false;
      });
    }
  }

  Future<void> _decodeVin(String vin) async {
    setState(() {
      _isDecoding = true;
      _error = null;
    });

    try {
      final decoded = await _apiService.decodeVin(vin);
      setState(() {
        _decodedData = decoded;
        _vehicleNameController.text = '${decoded['make'] ?? ''} ${decoded['model'] ?? ''}'.trim();
      });
    } catch (e) {
      setState(() {
        _error = 'VIN decode failed: $e\nYou can enter vehicle details manually.';
        _isManualEntry = true;
      });
    } finally {
      setState(() {
        _isDecoding = false;
      });
    }
  }

  Future<void> _setupVehicle() async {
    if (_vehicleNameController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a vehicle name')),
      );
      return;
    }

    setState(() {
      _isSettingUp = true;
      _error = null;
    });

    try {
      final result = await _apiService.setupVehicle(
        vehicleName: _vehicleNameController.text,
        registrationNumber: _regNumberController.text.isEmpty ? null : _regNumberController.text,
        vin: _vin,
        make: _decodedData?['make'],
        model: _decodedData?['model'],
        year: _decodedData?['year'],
        manufacturer: _decodedData?['manufacturer'],
        fuelType: _decodedData?['fuelType'],
        bodyClass: _decodedData?['bodyClass'],
        engineModel: _decodedData?['engineModel'],
        obdDeviceName: _obdService.device?.platformName ?? 'ELM327',
        bluetoothAddress: _obdService.device?.remoteId.toString(),
      );

      final vehicleId = result['vehicleId'] as String;
      
      // Save vehicle ID to persistent storage
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('activeVehicleId', vehicleId);
      await prefs.setString('activeVehicleVin', _vin ?? '');
      await prefs.setString('activeVehicleName', _vehicleNameController.text);
      
      print('✅ Vehicle setup complete. Vehicle ID: $vehicleId');

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✅ Vehicle setup successful!'),
            backgroundColor: Colors.green,
          ),
        );
        Navigator.of(context).pop(true); // Return success
      }
    } catch (e) {
      setState(() {
        _error = 'Vehicle setup failed: $e';
      });
    } finally {
      setState(() {
        _isSettingUp = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Vehicle Setup'),
        backgroundColor: Colors.blue[900],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Status Card
            Card(
              color: Colors.blue[900],
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          _isReading ? Icons.hourglass_empty : 
                          _vin != null ? Icons.check_circle : Icons.error,
                          color: _isReading ? Colors.orange : 
                                 _vin != null ? Colors.green : Colors.red,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          _isReading ? 'Reading VIN from ECU...' :
                          _vin != null ? 'VIN Read Successfully' : 'VIN Read Failed',
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                    if (_vin != null) ...[
                      const SizedBox(height: 8),
                      SelectableText(
                        'VIN: $_vin',
                        style: const TextStyle(
                          fontSize: 14,
                          color: Colors.white70,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            
            const SizedBox(height: 16),

            // Error Message
            if (_error != null)
              Card(
                color: Colors.red[900],
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      const Icon(Icons.warning, color: Colors.white),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _error!,
                          style: const TextStyle(color: Colors.white),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

            const SizedBox(height: 16),

            // Decoded Data
            if (_isDecoding)
              const Center(
                child: Column(
                  children: [
                    CircularProgressIndicator(),
                    SizedBox(height: 8),
                    Text('Decoding VIN...'),
                  ],
                ),
              ),

            if (_decodedData != null) ...[
              const Text(
                'Decoded Vehicle Information',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildInfoRow('Make', _decodedData!['make']),
                      _buildInfoRow('Model', _decodedData!['model']),
                      _buildInfoRow('Year', _decodedData!['year']?.toString()),
                      _buildInfoRow('Manufacturer', _decodedData!['manufacturer']),
                      _buildInfoRow('Fuel Type', _decodedData!['fuelType']),
                      _buildInfoRow('Body Class', _decodedData!['bodyClass']),
                      _buildInfoRow('Engine', _decodedData!['engineModel']),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ],

            // Manual VIN Entry
            if (_isManualEntry || _vin == null) ...[
              TextField(
                controller: _vinController,
                decoration: const InputDecoration(
                  labelText: 'VIN (optional)',
                  hintText: 'Enter 17-character VIN',
                  border: OutlineInputBorder(),
                ),
                maxLength: 17,
                textCapitalization: TextCapitalization.characters,
                onChanged: (value) {
                  if (value.length == 17) {
                    _decodeVin(value);
                  }
                },
              ),
              const SizedBox(height: 16),
            ],

            // Vehicle Details Form
            const Text(
              'Vehicle Details',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            
            TextField(
              controller: _vehicleNameController,
              decoration: const InputDecoration(
                labelText: 'Vehicle Name *',
                hintText: 'e.g., My Honda Accord',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            
            TextField(
              controller: _regNumberController,
              decoration: const InputDecoration(
                labelText: 'Registration Number',
                hintText: 'e.g., ABC-1234',
                border: OutlineInputBorder(),
              ),
              textCapitalization: TextCapitalization.characters,
            ),
            const SizedBox(height: 24),

            // Action Buttons
            Row(
              children: [
                if (_vin == null && !_isReading)
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _readVinFromObd,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Retry VIN Read'),
                    ),
                  ),
                if (_vin == null && !_isReading)
                  const SizedBox(width: 8),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _isSettingUp ? null : _setupVehicle,
                    icon: _isSettingUp 
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.check),
                    label: Text(_isSettingUp ? 'Setting Up...' : 'Complete Setup'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                  ),
                ),
              ],
            ),
            
            const SizedBox(height: 16),
            
            const Text(
              'Note: The vehicle will be created with decoded information. '
              'You can update details later from settings.',
              style: TextStyle(fontSize: 12, color: Colors.grey),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoRow(String label, String? value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              '$label:',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ),
          Expanded(
            child: Text(value ?? '—'),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _vinController.dispose();
    _vehicleNameController.dispose();
    _regNumberController.dispose();
    super.dispose();
  }
}
