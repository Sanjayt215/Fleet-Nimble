import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/app_state.dart';
import '../services/obd_service.dart';
import '../services/api_service.dart';
import '../services/socket_service.dart';
import '../utils/dtc_decoder.dart';

class DtcScreen extends ConsumerStatefulWidget {
  const DtcScreen({super.key});

  @override
  ConsumerState<DtcScreen> createState() => _DtcScreenState();
}

class _DtcScreenState extends ConsumerState<DtcScreen> {
  final _obd = ObdService();
  List<String> _codes = [];
  bool _loading = false;

  Future<void> _read() async {
    final vehicle = ref.read(selectedVehicleProvider);
    if (vehicle == null || !_obd.isConnected) return;
    setState(() => _loading = true);
    try {
      final codes = await _obd.readDtc();
      setState(() => _codes = codes);
      await ApiService.instance.postDtc(vehicle.id, codes);
      SocketService.instance.emitDtc(vehicle.id, codes);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _clear() async {
    await _obd.clearDtc();
    setState(() => _codes = []);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('DTC Codes'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loading ? null : _read),
          IconButton(icon: const Icon(Icons.clear), onPressed: _clear),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _codes.isEmpty
              ? const Center(child: Text('No fault codes. Tap refresh to read.'))
              : ListView.builder(
                  itemCount: _codes.length,
                  itemBuilder: (_, i) {
                    final code = _codes[i];
                    return ListTile(
                      leading: const Icon(Icons.warning, color: Colors.orange),
                      title: Text(code, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.bold)),
                      subtitle: Text(DtcDecoder.description(code)),
                    );
                  },
                ),
    );
  }
}
