class LiveData {
  final double? rpm;
  final double? speed;
  final double? coolantTemp;
  final double? fuelLevel;
  final double? batteryVoltage;
  final double? throttle;
  final double? engineLoad;
  final double? maf;
  final double? intakeTemp;
  final double? latitude;
  final double? longitude;
  final double? gpsAccuracy;
  final double? gpsAltitude;
  final double? gpsHeading;
  final DateTime? gpsTimestamp;
  final String? vin;

  LiveData({
    this.rpm,
    this.speed,
    this.coolantTemp,
    this.fuelLevel,
    this.batteryVoltage,
    this.throttle,
    this.engineLoad,
    this.maf,
    this.intakeTemp,
    this.latitude,
    this.longitude,
    this.gpsAccuracy,
    this.gpsAltitude,
    this.gpsHeading,
    this.gpsTimestamp,
    this.vin,
  });

  Map<String, dynamic> toJson() => {
        'rpm': rpm,
        'speed': speed,
        'coolantTemp': coolantTemp,
        'fuelLevel': fuelLevel,
        'batteryVoltage': batteryVoltage,
        'throttle': throttle,
        'engineLoad': engineLoad,
        'maf': maf,
        'intakeTemp': intakeTemp,
        'latitude': latitude,
        'longitude': longitude,
        'gpsAccuracy': gpsAccuracy,
        'gpsAltitude': gpsAltitude,
        'gpsHeading': gpsHeading,
        'gpsTimestamp': gpsTimestamp?.toIso8601String(),
        'vin': vin,
      };

  LiveData merge(Map<String, dynamic> parsed) => LiveData(
        rpm: parsed['rpm'] ?? rpm,
        speed: parsed['speed'] ?? speed,
        coolantTemp: parsed['coolantTemp'] ?? coolantTemp,
        fuelLevel: parsed['fuelLevel'] ?? fuelLevel,
        batteryVoltage: parsed['batteryVoltage'] ?? batteryVoltage,
        throttle: parsed['throttle'] ?? throttle,
        engineLoad: parsed['engineLoad'] ?? engineLoad,
        maf: parsed['maf'] ?? maf,
        intakeTemp: parsed['intakeTemp'] ?? intakeTemp,
        latitude: parsed['latitude'] ?? latitude,
        longitude: parsed['longitude'] ?? longitude,
        gpsAccuracy: parsed['gpsAccuracy'] ?? gpsAccuracy,
        gpsAltitude: parsed['gpsAltitude'] ?? gpsAltitude,
        gpsHeading: parsed['gpsHeading'] ?? gpsHeading,
        gpsTimestamp: parsed['gpsTimestamp'] ?? gpsTimestamp,
        vin: parsed['vin'] ?? vin,
      );
}
