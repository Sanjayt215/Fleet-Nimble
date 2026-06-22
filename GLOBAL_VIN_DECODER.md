# Global VIN Decoding System - FleetNimble

## Overview

FleetNimble now supports **global VIN decoding** for vehicles from USA, India, Europe, Japan, Korea, China, and other countries with a multi-level fallback system.

---

## Architecture

### Level 1: NHTSA Decoder (US Vehicles)
- Uses NHTSA vPIC API
- Returns full decode: make, model, year, manufacturer, fuel type, body class, engine model
- Best for US vehicles
- Decode Source: `NHTSA`
- Decode Type: `FULL_DECODE`
- Confidence: `HIGH`

### Level 2: Local WMI Database (Global Vehicles)
- Uses built-in World Manufacturer Identifier database
- Covers 100+ manufacturers from 20+ countries
- Returns partial decode: manufacturer, country, make, estimated year
- Fallback when NHTSA has no data
- Decode Source: `LOCAL_WMI`
- Decode Type: `PARTIAL_DECODE`
- Confidence: `MEDIUM`

### Level 3: Manual Entry
- When both Level 1 and Level 2 fail
- User enters vehicle details manually
- Decode Type: `MANUAL_COMPLETION_REQUIRED`

---

## Supported Regions

### India (MAT, MA3, MA6, MA7, MAL, MAJ, MEX, ME4, MZB, MBJ, ME1, MAK, MNT, MA1)
- Tata Motors (MAT)
- Maruti Suzuki (MA3, MA6, MA7)
- Hyundai India (MAL)
- Ford India (MAJ)
- Volkswagen India (MEX)
- Mahindra (ME4)
- Kia India (MZB)
- Toyota Kirloskar (MBJ)
- Honda India (ME1, MAK)
- Nissan India (MNT)
- Chevrolet India (MA1)

### Japan (JHM, JHG, JHL, JN1, JN8, JT1-JT3, JTD, JTE, JTJ, JTK, JM1, JM3, JS1, JS2, JF1, JF2, JA3, JA4)
- Honda (JHM, JHG, JHL)
- Nissan (JN1, JN8)
- Toyota (JT1, JT2, JT3, JTD, JTE)
- Lexus (JTJ, JTK)
- Mazda (JM1, JM3)
- Suzuki (JS1, JS2)
- Subaru (JF1, JF2)
- Mitsubishi (JA3, JA4)

### South Korea (KMH, KM8, KNA, KNB, KNC, KND, KL1, KL4, KPT)
- Hyundai (KMH, KM8)
- Kia (KNA, KNB, KNC, KND)
- Daewoo (KL1, KL4)
- SsangYong (KPT)

### Germany (WAU, WA1, WVW, WV1, WV2, WDB, WDD, WDC, WBA, WBS, WBY, W0L, WP0, WP1)
- Audi (WAU, WA1)
- Volkswagen (WVW, WV1, WV2)
- Mercedes-Benz (WDB, WDD, WDC)
- BMW (WBA, WBS, WBY)
- Opel (W0L)
- Porsche (WP0, WP1)

### Europe (VF1, VF3, VF7, VSS, ZAR, ZFA, ZFF, ZHW, ZAM, SAJ, SAL, SAR, SCA, SCE, YS3, YV1, YV4)
- Renault France (VF1)
- Peugeot France (VF3)
- Citroën France (VF7)
- SEAT Spain (VSS)
- Alfa Romeo Italy (ZAR)
- Fiat Italy (ZFA)
- Ferrari Italy (ZFF)
- Lamborghini Italy (ZHW)
- Maserati Italy (ZAM)
- Jaguar UK (SAJ)
- Land Rover UK (SAL)
- Rolls-Royce UK (SCA)
- Bentley UK (SCE)
- Saab Sweden (YS3)
- Volvo Sweden (YV1, YV4)

### USA, Canada, Mexico (1G1, 1G6, 1FA-1FT, 1GC, 1GT, 1HG, 1J4, 1L1, 1LN, 1N4, 1N6, 2G1, 2HG, 2T1, 3FA, 3G1, 3VW)
- Chevrolet (1G1, 1GC, 2G1, 3G1)
- Cadillac (1G6)
- Ford (1FA, 1FB, 1FC, 1FD, 1FM, 1FT, 3FA)
- GMC (1GT)
- Honda (1HG, 2HG)
- Jeep (1J4)
- Lincoln (1L1, 1LN)
- Nissan (1N4, 1N6)
- Toyota (2T1)
- Volkswagen (3VW)

### China (LDC, LFV, LGB, LHG, LBV, LSV, LVS)
- Dongfeng (LDC)
- FAW (LFV)
- Geely (LGB)
- Haval (LHG)
- BMW Brilliance (LBV)
- MG/SAIC (LSV)
- Ford China (LVS)

### Other Regions
- Thailand: Toyota (MR0), Mitsubishi (ML1)
- Brazil: Volkswagen (9BW), Chevrolet (9BG)
- Australia: Holden (6G1), Toyota (6T1)
- Russia: Lada (XTA), UAZ (XTT)

---

## API Endpoints

### POST /api/mobile/vehicles/vin-decode

Decode a VIN using multi-level fallback system.

**Request:**
```json
{
  "vin": "MAT627162HLK08178"
}
```

**Response (Full Decode):**
```json
{
  "success": true,
  "data": {
    "vin": "1HGCM82633A004352",
    "make": "Honda",
    "model": "Accord",
    "year": 2003,
    "manufacturer": "Honda",
    "fuelType": "Gasoline",
    "bodyClass": "Sedan",
    "engineModel": "K24A",
    "country": null,
    "decodeSource": "NHTSA",
    "decodeType": "FULL_DECODE",
    "isPartial": false,
    "confidence": "HIGH"
  }
}
```

**Response (Partial Decode - WMI):**
```json
{
  "success": true,
  "data": {
    "vin": "MAT627162HLK08178",
    "make": "Tata",
    "model": null,
    "year": 2016,
    "manufacturer": "Tata Motors",
    "country": "India",
    "fuelType": null,
    "bodyClass": null,
    "engineModel": null,
    "decodeSource": "LOCAL_WMI",
    "decodeType": "PARTIAL_DECODE",
    "isPartial": true,
    "confidence": "MEDIUM"
  },
  "warning": "Vehicle partially identified from manufacturer database. Please verify and complete details."
}
```

**Response (Manual Entry Required):**
```json
{
  "success": false,
  "error": {
    "code": "VIN_DECODE_UNAVAILABLE",
    "message": "VIN is valid but could not be decoded automatically. Please enter vehicle details manually.",
    "allowManualEntry": true,
    "vin": "XYZ1234567890ABCD",
    "decodeType": "MANUAL_COMPLETION_REQUIRED"
  }
}
```

### POST /api/mobile/vehicles/setup

Create or update a vehicle with decode metadata.

**Request:**
```json
{
  "vehicleName": "My Tata Car",
  "registrationNumber": "DL01AB1234",
  "make": "Tata",
  "model": "Nexon",
  "year": 2016,
  "vin": "MAT627162HLK08178",
  "manufacturer": "Tata Motors",
  "vinDecodeSource": "LOCAL_WMI",
  "vinDecodeType": "PARTIAL_DECODE",
  "vinCountry": "India",
  "vinConfidence": "MEDIUM",
  "isPartialDecode": true,
  "obdDeviceName": "ELM327",
  "bluetoothAddress": "00:11:22:33:44:55"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "vehicleId": "abc-123-def-456",
    "vehicleName": "My Tata Car",
    "registrationNumber": "DL01AB1234",
    "make": "Tata",
    "model": "Nexon",
    "year": 2016,
    "vin": "MAT627162HLK08178",
    "manufacturer": "Tata Motors",
    "vinDecodeSource": "LOCAL_WMI",
    "vinDecodeType": "PARTIAL_DECODE",
    "vinCountry": "India",
    "vinConfidence": "MEDIUM",
    "isPartialDecode": true,
    "obdDeviceId": "obd-123",
    "isNew": true
  }
}
```

---

## Database Schema

New fields added to `Vehicle` model:

```prisma
model Vehicle {
  // ... existing fields
  
  vinDecodeSource   String?  @map("vin_decode_source")   // NHTSA, LOCAL_WMI, MANUAL
  vinDecodeType     String?  @map("vin_decode_type")     // FULL_DECODE, PARTIAL_DECODE, MANUAL_COMPLETION_REQUIRED
  vinCountry        String?  @map("vin_country")         // India, Japan, Germany, etc.
  vinConfidence     String?  @map("vin_confidence")      // HIGH, MEDIUM, LOW
  isPartialDecode   Boolean  @default(false) @map("is_partial_decode")
  
  // ... existing fields
}
```

---

## Android App Integration

### 1. Update VIN Decode Response Handling

```kotlin
data class VinDecodeResponse(
    val success: Boolean,
    val data: VinDecodeData? = null,
    val error: VinDecodeError? = null,
    val warning: String? = null
)

data class VinDecodeData(
    val vin: String,
    val make: String?,
    val model: String?,
    val year: Int?,
    val manufacturer: String?,
    val country: String?,
    val fuelType: String?,
    val bodyClass: String?,
    val engineModel: String?,
    val decodeSource: String,        // NEW
    val decodeType: String,           // NEW
    val isPartial: Boolean,           // NEW
    val confidence: String            // NEW
)
```

### 2. Handle Partial Decode in UI

```kotlin
if (response.success && response.data != null) {
    val data = response.data
    
    // Show decoded data
    binding.makeText.text = data.make ?: "Unknown"
    binding.modelText.text = data.model ?: "Please enter"
    binding.yearText.text = data.year?.toString() ?: "Please enter"
    binding.manufacturerText.text = data.manufacturer ?: "Unknown"
    binding.countryText.text = data.country ?: "Unknown"
    
    // Show decode source
    binding.decodeSourceText.text = when (data.decodeSource) {
        "NHTSA" -> "✅ Full decode from NHTSA"
        "LOCAL_WMI" -> "⚠️ Partial decode from manufacturer database"
        else -> "Manual entry"
    }
    
    // Show warning for partial decode
    if (data.isPartial) {
        binding.warningCard.visibility = View.VISIBLE
        binding.warningText.text = "Vehicle partially identified. Please verify and complete missing details."
        
        // Enable manual fields for completion
        binding.modelInput.isEnabled = true
        binding.yearInput.isEnabled = true
    }
}
```

### 3. Send Decode Metadata to Backend

```kotlin
val response = fleetApi.setupVehicle(
    vehicleName = vehicleName,
    registrationNumber = regNumber,
    make = data.make,
    model = data.model,
    year = data.year,
    vin = data.vin,
    manufacturer = data.manufacturer,
    // Include decode metadata
    vinDecodeSource = data.decodeSource,
    vinDecodeType = data.decodeType,
    vinCountry = data.country,
    vinConfidence = data.confidence,
    isPartialDecode = data.isPartial
)
```

---

## Website Integration

### Vehicle Details Page

Display VIN decode information:

```jsx
<div className="vehicle-vin-info">
  <h3>VIN Information</h3>
  <div className="vin-grid">
    <div><strong>VIN:</strong> {vehicle.vin}</div>
    <div><strong>Make:</strong> {vehicle.make}</div>
    <div><strong>Model:</strong> {vehicle.model}</div>
    <div><strong>Year:</strong> {vehicle.year}</div>
    <div><strong>Manufacturer:</strong> {vehicle.manufacturer}</div>
    <div><strong>Country:</strong> {vehicle.vinCountry}</div>
    <div><strong>Decode Source:</strong> 
      <span className={`badge badge-${vehicle.vinDecodeSource?.toLowerCase()}`}>
        {vehicle.vinDecodeSource}
      </span>
    </div>
    <div><strong>Confidence:</strong> 
      <span className={`badge badge-${vehicle.vinConfidence?.toLowerCase()}`}>
        {vehicle.vinConfidence}
      </span>
    </div>
  </div>
  
  {vehicle.isPartialDecode && (
    <div className="alert alert-warning">
      ⚠️ Vehicle was partially identified. Some details may need verification.
    </div>
  )}
</div>
```

### Dashboard - Show Manufacturer

```jsx
<div className="vehicle-card">
  <h4>{vehicle.vehicleName}</h4>
  <p className="manufacturer">
    {vehicle.manufacturer || vehicle.make}
    {vehicle.vinCountry && ` • ${vehicle.vinCountry}`}
  </p>
  <p className="vehicle-info">
    {vehicle.make} {vehicle.model} {vehicle.year}
  </p>
  <span className={`status-badge ${vehicle.status}`}>
    {vehicle.status}
  </span>
</div>
```

---

## Testing

### Test Case 1: US Vehicle (Full Decode)
```bash
curl -X POST http://localhost:5000/api/mobile/vehicles/vin-decode \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"vin":"1HGCM82633A004352"}'
```

**Expected:** Full decode from NHTSA with HIGH confidence

### Test Case 2: Indian Vehicle (Partial Decode)
```bash
curl -X POST http://localhost:5000/api/mobile/vehicles/vin-decode \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"vin":"MAT627162HLK08178"}'
```

**Expected:** Partial decode from LOCAL_WMI showing Tata Motors, India

### Test Case 3: Unknown VIN (Manual Entry)
```bash
curl -X POST http://localhost:5000/api/mobile/vehicles/vin-decode \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"vin":"XYZ1234567890ABCD"}'
```

**Expected:** allowManualEntry = true, decodeType = MANUAL_COMPLETION_REQUIRED

---

## Benefits

1. **Global Coverage**: Support for 100+ manufacturers from 20+ countries
2. **Graceful Degradation**: Multi-level fallback ensures users are never blocked
3. **Data Quality**: Decode metadata helps track data reliability
4. **User Experience**: Clear messaging about partial decodes and manual entry
5. **Analytics Ready**: Track decode success rates by source and region
6. **Future Extensible**: Easy to add more decoder providers

---

## Migration

Run on production database:
```bash
npx prisma migrate deploy
```

This adds the new VIN decode metadata fields to the vehicles table.

---

## Status: ✅ IMPLEMENTED

- [✅] WMI Database (100+ manufacturers)
- [✅] VIN Decoder Service with fallback
- [✅] Updated Vehicle Controller
- [✅] Database migration
- [✅] API endpoints ready
- [ ] Android app integration (TODO by user)
- [ ] Website UI updates (TODO by user)

