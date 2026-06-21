import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/telemetry_publisher.dart';
import '../services/obd_service.dart';
import '../utils/config.dart';

class DebugScreen extends StatefulWidget {
  const DebugScreen({Key? key}) : super(key: key);

  @override
  State<DebugScreen> createState() => _DebugScreenState();
}

class _DebugScreenState extends State<DebugScreen> {
  String? _vehicleId;
  String? _vin;
  String? _vehicleName;
  String? _email;
  DateTime? _lastUpload;
  String? _lastError;
  bool _obdConnected = false;
  bool _ecuResponding = false;
  Map<String, dynamic> _obdData = {};
  Map<String, dynamic> _gpsData = {};

  @override
  void initState() {
    super.initState();
    _loadDebugInfo();
    
    // Refresh every 2 seconds
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) {
        _loadDebugInfo();
      }
    });
  }

  Future<void> _loadDebugInfo() async {
    final prefs = await SharedPreferences.getInstance();
    final obdService = ObdService.instance;
    
    setState(() {
      // Auth & Vehicle Info
      _vehicleId = prefs.getString('activeVehicleId');
      _vin = prefs.getString('activeVehicleVin');
      _vehicleName = prefs.getString('activeVehicleName');
      _email = prefs.getString('userEmail');
      
      // Telemetry Status
      _lastUpload = TelemetryPublisher.lastUploadTime;
      _lastError = TelemetryPublisher.lastError;
      
      // OBD Status
      _obdConnected = obdService.isConnected;
      _ecuResponding = obdService.isConnected; // TODO: Track ECU response
      
      // OBD Data (from last poll)
      _obdData = prefs.getString('lastObdData') != null 
          ? {} // Parse JSON if stored
          : {};
      
      // GPS Data (from last location)
      _gpsData = {
        'active': prefs.getBool('gpsActive') ?? false,
        'latitude': prefs.getDouble('lastLatitude'),
        'longitude': prefs.getDouble('lastLongitude'),
        'accuracy': prefs.getDouble('lastAccuracy'),
      };
    });
  }

  @override
  Widget build(BuildContext context) {
    final httpOk = _lastError == null && _lastUpload != null;
    
    return Scaffold(
      appBar: AppBar(
        title: const Text('Debug Information'),
        backgroundColor: Colors.blue[900],
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadDebugInfo,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadDebugInfo,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Status Summary Card
            Card(
              color: httpOk ? Colors.green[700] : Colors.red[700],
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    Icon(
                      httpOk ? Icons.check_circle : Icons.error,
                      color: Colors.white,
                      size: 48,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      httpOk ? '✅ SYSTEM ONLINE' : '❌ SYSTEM ERROR',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    if (_lastUpload != null)
                      Text(
                        'Last Upload: ${_formatTime(_lastUpload!)}',
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 14,
                        ),
                      ),
                  ],
                ),
              ),
            ),
            
            const SizedBox(height: 16),
            
            // Backend Configuration
            _buildSection('Backend Configuration', [
              _buildRow('Backend URL', AppConfig.apiBaseUrl),
              _buildRow('Socket URL', AppConfig.socketUrl ?? 'Same as API'),
              _buildRow('Use Fixed Vehicle ID', 
                  AppConfig.useFixedFleetVehicleId ? '⚠️ YES (Testing)' : '✅ NO (Production)'),
              if (AppConfig.useFixedFleetVehicleId)
                _buildRow('Fixed Vehicle ID', AppConfig.fixedFleetVehicleId, 
                    style: const TextStyle(fontSize: 11, fontFamily: 'monospace')),
            ]),
            
            const Divider(height: 32),
            
            // Authentication
            _buildSection('Authentication', [
              _buildRow('Status', _email != null ? '✅ Logged In' : '❌ Not Logged In'),
              _buildRow('Email', _email ?? 'N/A'),
            ]),
            
            const Divider(height: 32),
            
            // Vehicle Information
            _buildSection('Vehicle Information', [
              _buildRow('Vehicle ID', _vehicleId ?? '❌ Not Set', 
                  isError: _vehicleId == null),
              _buildRow('VIN', _vin ?? 'Not Set'),
              _buildRow('Vehicle Name', _vehicleName ?? 'Not Set'),
              _buildRow('VIN Decode Status', _vin != null ? '✅ Complete' : '⚠️ Pending'),
              _buildRow('Vehicle Setup', _vehicleId != null ? '✅ Complete' : '❌ Required'),
            ]),
            
            const Divider(height: 32),
            
            // Telemetry Upload Status
            _buildSection('Telemetry Upload Status', [
              _buildRow('HTTP Status', httpOk ? '✅ OK' : '❌ ERROR', 
                  isError: !httpOk),
              _buildRow('Last Upload', 
                  _lastUpload != null ? _formatTime(_lastUpload!) : '❌ Never', 
                  isError: _lastUpload == null),
              if (_lastError != null)
                _buildRow('Last Error', _lastError!, isError: true),
              if (_vehicleId == null)
                _buildRow('⚠️ Warning', 'Complete vehicle setup to enable telemetry', 
                    isError: true),
            ]),
            
            const Divider(height: 32),
            
            // OBD Status
            _buildSection('OBD Status', [
              _buildRow('OBD Connected', 
                  _obdConnected ? '✅ Connected' : '❌ Disconnected', 
                  isError: !_obdConnected),
              _buildRow('ECU Responding', 
                  _ecuResponding ? '✅ Yes' : '❌ No', 
                  isError: !_ecuResponding),
              _buildRow('RPM', _obdData['rpm']?.toString() ?? '—'),
              _buildRow('Speed', _obdData['speed'] != null 
                  ? '${_obdData['speed']} km/h' : '—'),
              _buildRow('Coolant Temp', _obdData['coolantTemp'] != null 
                  ? '${_obdData['coolantTemp']}°C' : '—'),
              _buildRow('Battery Voltage', _obdData['batteryVoltage'] != null 
                  ? '${_obdData['batteryVoltage']}V' : '—'),
              _buildRow('Engine Load', _obdData['engineLoad'] != null 
                  ? '${_obdData['engineLoad']}%' : '—'),
              _buildRow('Fuel Level', _obdData['fuelLevel'] != null 
                  ? '${_obdData['fuelLevel']}%' : '—'),
            ]),
            
            const Divider(height: 32),
            
            // GPS Status
            _buildSection('GPS Status', [
              _buildRow('GPS Active', 
                  _gpsData['active'] == true ? '✅ Active' : '❌ Inactive',
                  isError: _gpsData['active'] != true),
              _buildRow('Latitude', _gpsData['latitude']?.toString() ?? '—'),
              _buildRow('Longitude', _gpsData['longitude']?.toString() ?? '—'),
              _buildRow('Accuracy', _gpsData['accuracy'] != null 
                  ? '${_gpsData['accuracy'].toStringAsFixed(1)}m' : '—'),
            ]),
            
            const SizedBox(height: 32),
            
            // Actions
            ElevatedButton.icon(
              onPressed: _loadDebugInfo,
              icon: const Icon(Icons.refresh),
              label: const Text('Refresh Debug Info'),
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.all(16),
              ),
            ),
            
            const SizedBox(height: 8),
            
            if (_vehicleId == null)
              OutlinedButton.icon(
                onPressed: () {
                  Navigator.pushNamed(context, '/vin-setup');
                },
                icon: const Icon(Icons.add),
                label: const Text('Setup Vehicle'),
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.all(16),
                ),
              ),
            
            const SizedBox(height: 24),
            
            // Footer
            Center(
              child: Text(
                'FleetNimble Debug v1.0',
                style: TextStyle(
                  color: Colors.grey[600],
                  fontSize: 12,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSection(String title, List<Widget> children) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: Colors.blue,
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(children: children),
          ),
        ),
      ],
    );
  }

  Widget _buildRow(String label, String value, {bool isError = false, TextStyle? style}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 140,
            child: Text(
              label,
              style: const TextStyle(
                fontWeight: FontWeight.w500,
                color: Colors.grey,
                fontSize: 13,
              ),
            ),
          ),
          Expanded(
            child: SelectableText(
              value,
              style: style ?? TextStyle(
                color: isError ? Colors.red : Colors.black87,
                fontSize: 13,
                fontFamily: value.contains('http') || value.contains('-') || value.length > 30
                    ? 'monospace' 
                    : null,
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _formatTime(DateTime time) {
    final now = DateTime.now();
    final diff = now.difference(time);
    
    if (diff.inSeconds < 5) {
      return 'Just now';
    } else if (diff.inSeconds < 60) {
      return '${diff.inSeconds}s ago';
    } else if (diff.inMinutes < 60) {
      return '${diff.inMinutes}m ago';
    } else if (diff.inHours < 24) {
      return '${diff.inHours}h ago';
    } else {
      return '${diff.inDays}d ago';
    }
  }
}
