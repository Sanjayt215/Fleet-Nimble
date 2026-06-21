import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/app_state.dart';
import '../services/api_service.dart';
import '../services/mqtt_service.dart';
import '../services/socket_service.dart';
import '../utils/config.dart';
import 'login_screen.dart';
import 'debug_screen.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool _mqttEnabled = false;
  bool _mqttUseTls = AppConfig.mqttUseTls;
  bool _loading = false;
  String? _status;
  final _brokerCtrl = TextEditingController(text: AppConfig.mqttBroker);
  final _portCtrl = TextEditingController(text: '${AppConfig.mqttPort}');
  late TextEditingController _fixedVehicleIdCtrl;

  @override
  void initState() {
    super.initState();
    _fixedVehicleIdCtrl = TextEditingController(text: AppConfig.fixedFleetVehicleId);
    _loadMqttPrefs();
  }

  Future<void> _loadMqttPrefs() async {
    final enabled = await MqttTelemetryConfig.isEnabled();
    final config = await MqttTelemetryConfig.loadFromPrefs();
    setState(() {
      _mqttEnabled = enabled;
      if (config != null) {
        _brokerCtrl.text = config.broker;
        _portCtrl.text = '${config.port}';
        _mqttUseTls = config.useTls;
      }
    });
  }

  Future<void> _provisionAndConnect() async {
    final vehicle = ref.read(selectedVehicleProvider);
    if (vehicle == null) {
      setState(() => _status = 'Select a vehicle first');
      return;
    }

    setState(() {
      _loading = true;
      _status = 'Provisioning device…';
    });

    try {
      final data = await ApiService.instance.provisionMqttDevice(vehicle.id);

      if (data['alreadyProvisioned'] == true) {
        setState(() => _status = 'Device already provisioned — enter saved secret or re-provision from dashboard');
        setState(() => _loading = false);
        return;
      }

      final creds = data['credentials'] as Map<String, dynamic>;
      final mqttInfo = data['mqtt'] as Map<String, dynamic>;
      final brokerUrl = mqttInfo['brokerUrl'] as String? ?? 'mqtt://${AppConfig.mqttBroker}:${AppConfig.mqttPort}';
      final uri = Uri.parse(brokerUrl.replaceFirst('mqtts://', 'mqtt://'));
      final port = int.tryParse(_portCtrl.text) ?? uri.port;
      final useTls = _mqttUseTls || brokerUrl.startsWith('mqtts');

      await MqttTelemetryConfig.saveToPrefs(
        enabled: true,
        broker: _brokerCtrl.text.trim().isEmpty ? uri.host : _brokerCtrl.text.trim(),
        port: port,
        useTls: useTls,
        deviceUid: creds['username'] as String,
        deviceSecret: creds['deviceSecret'] as String,
        tenantId: mqttInfo['tenantId'] as String,
        vehicleId: vehicle.id,
      );

      final connected = await MqttTelemetryService.instance.initialize();
      setState(() {
        _mqttEnabled = true;
        _status = connected ? 'MQTT connected & provisioned' : 'Provisioned but broker unreachable';
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _status = 'Error: $e';
        _loading = false;
      });
    }
  }

  Future<void> _toggleMqtt(bool value) async {
    setState(() => _mqttEnabled = value);
    final prefs = await MqttTelemetryConfig.loadFromPrefs();
    if (prefs != null) {
      await MqttTelemetryConfig.saveToPrefs(
        enabled: value,
        broker: prefs.broker,
        port: prefs.port,
        useTls: prefs.useTls,
        deviceUid: prefs.deviceUid,
        deviceSecret: prefs.deviceSecret,
        tenantId: prefs.tenantId,
        vehicleId: prefs.vehicleId,
      );
    }
    if (value) {
      await MqttTelemetryService.instance.initialize();
    } else {
      await MqttTelemetryService.instance.disconnect();
    }
  }

  Future<void> _logout() async {
    await MqttTelemetryService.instance.disconnect();
    await ApiService.instance.clearTokens();
    SocketService.instance.disconnect();
    if (!mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  @override
  void dispose() {
    _brokerCtrl.dispose();
    _portCtrl.dispose();
    _fixedVehicleIdCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mqttStatus = MqttTelemetryService.instance.getStatus();
    final vehicle = ref.watch(selectedVehicleProvider);
    final tokenStatus = ref.watch(tokenStatusProvider);
    final httpStatus = ref.watch(httpStatusProvider);
    final lastUploadTime = ref.watch(lastUploadTimeProvider);
    final useFixedId = ref.watch(useFixedVehicleIdProvider);

    final lastUploadDisplay = lastUploadTime != null
        ? '${lastUploadTime.hour.toString().padLeft(2, '0')}:${lastUploadTime.minute.toString().padLeft(2, '0')}:${lastUploadTime.second.toString().padLeft(2, '0')}'
        : 'Never';

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        children: [
          ListTile(title: const Text('Fleet Server URL'), subtitle: Text(AppConfig.apiBaseUrl)),
          ListTile(title: const Text('Socket URL'), subtitle: Text(AppConfig.socketUrl)),
          
          // === BACKUP MODE DEBUG SECTION ===
          if (useFixedId) ...[
            const SizedBox(height: 8),
            Container(
              margin: const EdgeInsets.all(16),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.orange.withValues(alpha: 0.1),
                border: Border.all(color: Colors.orange, width: 2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.warning, color: Colors.orange, size: 20),
                      const SizedBox(width: 8),
                      const Text(
                        'BACKUP MODE: Fixed Vehicle ID',
                        style: TextStyle(fontWeight: FontWeight.bold, color: Colors.orange),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Vehicle Mode', style: TextStyle(fontSize: 12)),
                    subtitle: const Text('FIXED VEHICLE ID', style: TextStyle(color: Colors.orange, fontWeight: FontWeight.bold)),
                  ),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Token Status', style: TextStyle(fontSize: 12)),
                    subtitle: Text(tokenStatus, style: TextStyle(color: tokenStatus == 'VALID' ? Colors.green : Colors.red)),
                  ),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('HTTP Status', style: TextStyle(fontSize: 12)),
                    subtitle: Text(httpStatus, style: TextStyle(color: httpStatus == 'OK' ? Colors.green : httpStatus == 'FAILED' ? Colors.red : Colors.grey)),
                  ),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Last Upload', style: TextStyle(fontSize: 12)),
                    subtitle: Text(lastUploadDisplay),
                  ),
                  const SizedBox(height: 8),
                  const Text('Fixed Vehicle ID:', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  TextField(
                    controller: _fixedVehicleIdCtrl,
                    maxLines: 2,
                    decoration: InputDecoration(
                      hintText: 'Paste valid FleetNimble vehicle UUID',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(4)),
                      contentPadding: const EdgeInsets.all(8),
                      hintStyle: const TextStyle(fontSize: 11),
                    ),
                    style: const TextStyle(fontSize: 11, fontFamily: 'monospace'),
                  ),
                ],
              ),
            ),
            const Divider(),
          ],

          ListTile(
            title: const Text('Selected vehicle'),
            subtitle: Text(vehicle != null ? '${vehicle.make} ${vehicle.model} (${vehicle.plateNumber ?? vehicle.id})' : 'None (using fixed ID in backup mode)'),
          ),
          const Divider(),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Text('Cloud MQTT Telematics', style: Theme.of(context).textTheme.titleMedium),
          ),
          SwitchListTile(
            title: const Text('Enable MQTT upload'),
            subtitle: const Text('Dual-write: MQTT + HTTP (internet / 5G)'),
            value: _mqttEnabled,
            onChanged: _toggleMqtt,
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextField(
              controller: _brokerCtrl,
              decoration: const InputDecoration(labelText: 'MQTT broker host', hintText: '10.0.2.2 or your PC IP'),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: TextField(
              controller: _portCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Port (1883 dev / 8883 TLS)'),
            ),
          ),
          SwitchListTile(
            title: const Text('Use TLS (MQTTS)'),
            value: _mqttUseTls,
            onChanged: (v) => setState(() => _mqttUseTls = v),
          ),
          ListTile(
            title: const Text('MQTT status'),
            subtitle: Text(
              mqttStatus['connected'] == true
                  ? 'Connected to ${mqttStatus['broker']}:${mqttStatus['port']}'
                  : mqttStatus['configured'] == true
                      ? 'Configured, not connected'
                      : 'Not configured',
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: FilledButton.icon(
              onPressed: _loading ? null : _provisionAndConnect,
              icon: _loading
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.cloud_upload),
              label: const Text('Provision & Connect MQTT'),
            ),
          ),
          if (_status != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(_status!, style: TextStyle(color: Colors.grey.shade700)),
            ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.bug_report, color: Colors.blue),
            title: const Text('Debug Information'),
            subtitle: const Text('System status, telemetry info, error logs'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const DebugScreen()),
              );
            },
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.logout, color: Colors.red),
            title: const Text('Logout'),
            onTap: _logout,
          ),
        ],
      ),
    );
  }
}
