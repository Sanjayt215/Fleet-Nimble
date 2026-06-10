class Vehicle {
  final String id;
  final String? vin;
  final String? plateNumber;
  final String? make;
  final String? model;
  final int? year;

  Vehicle({
    required this.id,
    this.vin,
    this.plateNumber,
    this.make,
    this.model,
    this.year,
  });

  factory Vehicle.fromJson(Map<String, dynamic> json) => Vehicle(
        id: json['id'] as String,
        vin: json['vin'] as String?,
        plateNumber: json['plateNumber'] as String?,
        make: json['make'] as String?,
        model: json['model'] as String?,
        year: json['year'] as int?,
      );

  String get displayName => '${make ?? ''} ${model ?? ''}'.trim().isEmpty
      ? (plateNumber ?? vin ?? id)
      : '${make ?? ''} ${model ?? ''}'.trim();
}
