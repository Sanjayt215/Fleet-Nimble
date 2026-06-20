class Vehicle {
  final String id;
  final String? vin;
  final String? manufacturer;
  final String? bodyClass;
  final String? engineModel;
  final String? plateNumber;
  final String? make;
  final String? model;
  final int? year;
  final String? fuelType;

  Vehicle({
    required this.id,
    this.vin,
    this.manufacturer,
    this.bodyClass,
    this.engineModel,
    this.plateNumber,
    this.make,
    this.model,
    this.year,
    this.fuelType,
  });

  factory Vehicle.fromJson(Map<String, dynamic> json) => Vehicle(
        id: json['id'] as String,
        vin: json['vin'] as String?,
        manufacturer: json['manufacturer'] as String?,
        bodyClass: json['bodyClass'] as String?,
        engineModel: json['engineModel'] as String?,
        plateNumber: json['plateNumber'] as String?,
        make: json['make'] as String?,
        model: json['model'] as String?,
        year: json['year'] as int?,
        fuelType: json['fuelType'] as String?,
      );

  String get displayName => '${make ?? ''} ${model ?? ''}'.trim().isEmpty
      ? (plateNumber ?? vin ?? id)
      : '${make ?? ''} ${model ?? ''}'.trim();
}
