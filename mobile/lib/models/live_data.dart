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
      };

  LiveData merge(Map<String, double> parsed) => LiveData(
        rpm: parsed['rpm'] ?? rpm,
        speed: parsed['speed'] ?? speed,
        coolantTemp: parsed['coolantTemp'] ?? coolantTemp,
        fuelLevel: parsed['fuelLevel'] ?? fuelLevel,
        batteryVoltage: parsed['batteryVoltage'] ?? batteryVoltage,
        throttle: parsed['throttle'] ?? throttle,
        engineLoad: parsed['engineLoad'] ?? engineLoad,
        maf: parsed['maf'] ?? maf,
        intakeTemp: parsed['intakeTemp'] ?? intakeTemp,
      );
}
