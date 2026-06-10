import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../utils/config.dart';
import '../models/vehicle.dart';

class ApiService {
  static final ApiService instance = ApiService._();
  ApiService._();

  String? _token;

  Future<void> loadToken() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString('accessToken');
  }

  Future<void> saveTokens(String access, String refresh) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('accessToken', access);
    await prefs.setString('refreshToken', refresh);
    _token = access;
  }

  Future<void> clearTokens() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('accessToken');
    await prefs.remove('refreshToken');
    _token = null;
  }

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token',
      };

  Future<Map<String, dynamic>> login(String email, String password) async {
    final res = await http.post(
      Uri.parse('${AppConfig.apiBaseUrl}/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode != 200) {
      throw Exception(body['error']?['message'] ?? 'Login failed');
    }
    final data = body['data'] as Map<String, dynamic>;
    await saveTokens(data['accessToken'] as String, data['refreshToken'] as String);
    return data;
  }

  Future<List<Vehicle>> getVehicles() async {
    await loadToken();
    final res = await http.get(
      Uri.parse('${AppConfig.apiBaseUrl}/vehicles'),
      headers: _headers,
    );
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    final list = body['data'] as List<dynamic>;
    return list.map((e) => Vehicle.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> postLiveData(String vehicleId, Map<String, dynamic> data) async {
    await loadToken();
    final res = await http.post(
      Uri.parse('${AppConfig.apiBaseUrl}/obd/live-data'),
      headers: _headers,
      body: jsonEncode({'vehicleId': vehicleId, ...data}),
    );
    if (res.statusCode >= 400) {
      throw Exception('HTTP ${res.statusCode}');
    }
  }

  Future<void> postLiveDataBatch(String vehicleId, List<Map<String, dynamic>> readings) async {
    await loadToken();
    final res = await http.post(
      Uri.parse('${AppConfig.apiBaseUrl}/obd/live-data/batch'),
      headers: _headers,
      body: jsonEncode({
        'vehicleId': vehicleId,
        'readings': readings,
        'source': 'android-offline-sync',
      }),
    );
    if (res.statusCode >= 400) {
      throw Exception('HTTP ${res.statusCode}');
    }
  }

  Future<Map<String, dynamic>> provisionMqttDevice(String vehicleId) async {
    await loadToken();
    final res = await http.post(
      Uri.parse('${AppConfig.apiBaseUrl}/v1/devices/provision-mobile'),
      headers: _headers,
      body: jsonEncode({'vehicleId': vehicleId, 'deviceType': 'MOBILE_APP'}),
    );
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 400 || body['success'] != true) {
      throw Exception(body['error']?.toString() ?? 'Provision failed');
    }
    return body['data'] as Map<String, dynamic>;
  }

  Future<void> postDtc(String vehicleId, List<String> codes) async {
    await loadToken();
    await http.post(
      Uri.parse('${AppConfig.apiBaseUrl}/dtc/read'),
      headers: _headers,
      body: jsonEncode({'vehicleId': vehicleId, 'codes': codes}),
    );
  }

  Future<String?> startTrip(String vehicleId, double lat, double lng) async {
    await loadToken();
    final res = await http.post(
      Uri.parse('${AppConfig.apiBaseUrl}/trips/start'),
      headers: _headers,
      body: jsonEncode({
        'vehicleId': vehicleId,
        'latitude': lat,
        'longitude': lng,
      }),
    );
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return (body['data'] as Map<String, dynamic>)['id'] as String?;
  }

  Future<void> updateGps(String tripId, double lat, double lng) async {
    await loadToken();
    await http.post(
      Uri.parse('${AppConfig.apiBaseUrl}/gps/update'),
      headers: _headers,
      body: jsonEncode({'tripId': tripId, 'latitude': lat, 'longitude': lng}),
    );
  }
}
