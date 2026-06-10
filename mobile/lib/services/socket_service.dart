import 'package:shared_preferences/shared_preferences.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../utils/config.dart';

class SocketService {
  static final SocketService instance = SocketService._();
  SocketService._();

  io.Socket? _socket;

  io.Socket? get socket => _socket;

  Future<void> connect() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('accessToken');
    _socket?.dispose();
    _socket = io.io(
      AppConfig.socketUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableAutoConnect()
          .build(),
    );
    _socket!.connect();
  }

  void joinVehicle(String vehicleId) {
    _socket?.emit('join:vehicle', vehicleId);
  }

  void emitLiveData(String vehicleId, Map<String, dynamic> data) {
    _socket?.emit('vehicle:liveData', {'vehicleId': vehicleId, ...data});
  }

  void emitDtc(String vehicleId, List<String> codes) {
    _socket?.emit('vehicle:dtcDetected', {'vehicleId': vehicleId, 'codes': codes});
  }

  void emitGps(String tripId, double lat, double lng) {
    _socket?.emit('trip:gps', {
      'tripId': tripId,
      'latitude': lat,
      'longitude': lng,
    });
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
  }
}
