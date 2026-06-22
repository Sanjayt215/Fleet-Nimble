/**
 * World Manufacturer Identifier (WMI) Database
 * First 3 characters of VIN identify the manufacturer
 */

const WMI_DATABASE = {
  // INDIA
  'MAT': { manufacturer: 'Tata Motors', country: 'India', make: 'Tata' },
  'MA3': { manufacturer: 'Maruti Suzuki', country: 'India', make: 'Maruti Suzuki' },
  'MA6': { manufacturer: 'Maruti Suzuki', country: 'India', make: 'Maruti Suzuki' },
  'MA7': { manufacturer: 'Maruti Suzuki', country: 'India', make: 'Maruti Suzuki' },
  'MAL': { manufacturer: 'Hyundai Motor India', country: 'India', make: 'Hyundai' },
  'MAJ': { manufacturer: 'Ford India', country: 'India', make: 'Ford' },
  'MEX': { manufacturer: 'Volkswagen India', country: 'India', make: 'Volkswagen' },
  'ME4': { manufacturer: 'Mahindra & Mahindra', country: 'India', make: 'Mahindra' },
  'MZB': { manufacturer: 'Kia India', country: 'India', make: 'Kia' },
  'MBJ': { manufacturer: 'Toyota Kirloskar', country: 'India', make: 'Toyota' },
  'ME1': { manufacturer: 'Honda Cars India', country: 'India', make: 'Honda' },
  'MAK': { manufacturer: 'Honda Motorcycle India', country: 'India', make: 'Honda' },
  'MNT': { manufacturer: 'Nissan Motor India', country: 'India', make: 'Nissan' },
  'MA1': { manufacturer: 'General Motors India', country: 'India', make: 'Chevrolet' },
  
  // JAPAN
  'JHM': { manufacturer: 'Honda', country: 'Japan', make: 'Honda' },
  'JHG': { manufacturer: 'Honda', country: 'Japan', make: 'Honda' },
  'JHL': { manufacturer: 'Honda', country: 'Japan', make: 'Honda' },
  'JN1': { manufacturer: 'Nissan', country: 'Japan', make: 'Nissan' },
  'JN8': { manufacturer: 'Nissan', country: 'Japan', make: 'Nissan' },
  'JT1': { manufacturer: 'Toyota', country: 'Japan', make: 'Toyota' },
  'JT2': { manufacturer: 'Toyota', country: 'Japan', make: 'Toyota' },
  'JT3': { manufacturer: 'Toyota', country: 'Japan', make: 'Toyota' },
  'JTD': { manufacturer: 'Toyota', country: 'Japan', make: 'Toyota' },
  'JTE': { manufacturer: 'Toyota', country: 'Japan', make: 'Toyota' },
  'JTJ': { manufacturer: 'Lexus', country: 'Japan', make: 'Lexus' },
  'JTK': { manufacturer: 'Lexus', country: 'Japan', make: 'Lexus' },
  'JM1': { manufacturer: 'Mazda', country: 'Japan', make: 'Mazda' },
  'JM3': { manufacturer: 'Mazda', country: 'Japan', make: 'Mazda' },
  'JS1': { manufacturer: 'Suzuki', country: 'Japan', make: 'Suzuki' },
  'JS2': { manufacturer: 'Suzuki', country: 'Japan', make: 'Suzuki' },
  'JF1': { manufacturer: 'Subaru', country: 'Japan', make: 'Subaru' },
  'JF2': { manufacturer: 'Subaru', country: 'Japan', make: 'Subaru' },
  'JA3': { manufacturer: 'Mitsubishi', country: 'Japan', make: 'Mitsubishi' },
  'JA4': { manufacturer: 'Mitsubishi', country: 'Japan', make: 'Mitsubishi' },
  
  // KOREA
  'KMH': { manufacturer: 'Hyundai', country: 'South Korea', make: 'Hyundai' },
  'KM8': { manufacturer: 'Hyundai', country: 'South Korea', make: 'Hyundai' },
  'KNA': { manufacturer: 'Kia', country: 'South Korea', make: 'Kia' },
  'KNB': { manufacturer: 'Kia', country: 'South Korea', make: 'Kia' },
  'KNC': { manufacturer: 'Kia', country: 'South Korea', make: 'Kia' },
  'KND': { manufacturer: 'Kia', country: 'South Korea', make: 'Kia' },
  'KL1': { manufacturer: 'Daewoo', country: 'South Korea', make: 'Daewoo' },
  'KL4': { manufacturer: 'Daewoo', country: 'South Korea', make: 'Daewoo' },
  'KPT': { manufacturer: 'SsangYong', country: 'South Korea', make: 'SsangYong' },
  
  // GERMANY
  'WAU': { manufacturer: 'Audi', country: 'Germany', make: 'Audi' },
  'WA1': { manufacturer: 'Audi', country: 'Germany', make: 'Audi' },
  'WVW': { manufacturer: 'Volkswagen', country: 'Germany', make: 'Volkswagen' },
  'WV1': { manufacturer: 'Volkswagen', country: 'Germany', make: 'Volkswagen' },
  'WV2': { manufacturer: 'Volkswagen', country: 'Germany', make: 'Volkswagen' },
  'WDB': { manufacturer: 'Mercedes-Benz', country: 'Germany', make: 'Mercedes-Benz' },
  'WDD': { manufacturer: 'Mercedes-Benz', country: 'Germany', make: 'Mercedes-Benz' },
  'WDC': { manufacturer: 'Mercedes-Benz', country: 'Germany', make: 'Mercedes-Benz' },
  'WBA': { manufacturer: 'BMW', country: 'Germany', make: 'BMW' },
  'WBS': { manufacturer: 'BMW', country: 'Germany', make: 'BMW' },
  'WBY': { manufacturer: 'BMW', country: 'Germany', make: 'BMW' },
  'W0L': { manufacturer: 'Opel', country: 'Germany', make: 'Opel' },
  'WP0': { manufacturer: 'Porsche', country: 'Germany', make: 'Porsche' },
  'WP1': { manufacturer: 'Porsche', country: 'Germany', make: 'Porsche' },
  
  // FRANCE
  'VF1': { manufacturer: 'Renault', country: 'France', make: 'Renault' },
  'VF3': { manufacturer: 'Peugeot', country: 'France', make: 'Peugeot' },
  'VF7': { manufacturer: 'Citroën', country: 'France', make: 'Citroën' },
  'VSS': { manufacturer: 'SEAT', country: 'Spain', make: 'SEAT' },
  
  // ITALY
  'ZAR': { manufacturer: 'Alfa Romeo', country: 'Italy', make: 'Alfa Romeo' },
  'ZFA': { manufacturer: 'Fiat', country: 'Italy', make: 'Fiat' },
  'ZFF': { manufacturer: 'Ferrari', country: 'Italy', make: 'Ferrari' },
  'ZHW': { manufacturer: 'Lamborghini', country: 'Italy', make: 'Lamborghini' },
  'ZAM': { manufacturer: 'Maserati', country: 'Italy', make: 'Maserati' },
  
  // UK
  'SAJ': { manufacturer: 'Jaguar', country: 'United Kingdom', make: 'Jaguar' },
  'SAL': { manufacturer: 'Land Rover', country: 'United Kingdom', make: 'Land Rover' },
  'SAR': { manufacturer: 'Rover', country: 'United Kingdom', make: 'Rover' },
  'SCA': { manufacturer: 'Rolls-Royce', country: 'United Kingdom', make: 'Rolls-Royce' },
  'SCE': { manufacturer: 'Bentley', country: 'United Kingdom', make: 'Bentley' },
  
  // SWEDEN
  'YS3': { manufacturer: 'Saab', country: 'Sweden', make: 'Saab' },
  'YV1': { manufacturer: 'Volvo', country: 'Sweden', make: 'Volvo' },
  'YV4': { manufacturer: 'Volvo', country: 'Sweden', make: 'Volvo' },
  
  // USA
  '1G1': { manufacturer: 'Chevrolet', country: 'United States', make: 'Chevrolet' },
  '1G6': { manufacturer: 'Cadillac', country: 'United States', make: 'Cadillac' },
  '1FA': { manufacturer: 'Ford', country: 'United States', make: 'Ford' },
  '1FB': { manufacturer: 'Ford', country: 'United States', make: 'Ford' },
  '1FC': { manufacturer: 'Ford', country: 'United States', make: 'Ford' },
  '1FD': { manufacturer: 'Ford', country: 'United States', make: 'Ford' },
  '1FM': { manufacturer: 'Ford', country: 'United States', make: 'Ford' },
  '1FT': { manufacturer: 'Ford', country: 'United States', make: 'Ford' },
  '1GC': { manufacturer: 'Chevrolet', country: 'United States', make: 'Chevrolet' },
  '1GT': { manufacturer: 'GMC', country: 'United States', make: 'GMC' },
  '1HG': { manufacturer: 'Honda', country: 'United States', make: 'Honda' },
  '1J4': { manufacturer: 'Jeep', country: 'United States', make: 'Jeep' },
  '1L1': { manufacturer: 'Lincoln', country: 'United States', make: 'Lincoln' },
  '1LN': { manufacturer: 'Lincoln', country: 'United States', make: 'Lincoln' },
  '1N4': { manufacturer: 'Nissan', country: 'United States', make: 'Nissan' },
  '1N6': { manufacturer: 'Nissan', country: 'United States', make: 'Nissan' },
  '2G1': { manufacturer: 'Chevrolet', country: 'Canada', make: 'Chevrolet' },
  '2HG': { manufacturer: 'Honda', country: 'Canada', make: 'Honda' },
  '2T1': { manufacturer: 'Toyota', country: 'Canada', make: 'Toyota' },
  '3FA': { manufacturer: 'Ford', country: 'Mexico', make: 'Ford' },
  '3G1': { manufacturer: 'Chevrolet', country: 'Mexico', make: 'Chevrolet' },
  '3VW': { manufacturer: 'Volkswagen', country: 'Mexico', make: 'Volkswagen' },
  
  // CHINA
  'LDC': { manufacturer: 'Dongfeng', country: 'China', make: 'Dongfeng' },
  'LFV': { manufacturer: 'FAW', country: 'China', make: 'FAW' },
  'LGB': { manufacturer: 'Geely', country: 'China', make: 'Geely' },
  'LHG': { manufacturer: 'Haval', country: 'China', make: 'Haval' },
  'LBV': { manufacturer: 'BMW Brilliance', country: 'China', make: 'BMW' },
  'LSV': { manufacturer: 'SAIC', country: 'China', make: 'MG' },
  'LVS': { manufacturer: 'Ford China', country: 'China', make: 'Ford' },
  
  // THAILAND
  'MR0': { manufacturer: 'Toyota Thailand', country: 'Thailand', make: 'Toyota' },
  'ML1': { manufacturer: 'Mitsubishi Thailand', country: 'Thailand', make: 'Mitsubishi' },
  
  // BRAZIL
  '9BW': { manufacturer: 'Volkswagen Brazil', country: 'Brazil', make: 'Volkswagen' },
  '9BG': { manufacturer: 'Chevrolet Brazil', country: 'Brazil', make: 'Chevrolet' },
  
  // AUSTRALIA
  '6G1': { manufacturer: 'Holden', country: 'Australia', make: 'Holden' },
  '6T1': { manufacturer: 'Toyota Australia', country: 'Australia', make: 'Toyota' },
  
  // RUSSIA
  'XTA': { manufacturer: 'AvtoVAZ', country: 'Russia', make: 'Lada' },
  'XTT': { manufacturer: 'UAZ', country: 'Russia', make: 'UAZ' },
};

/**
 * Lookup manufacturer information from VIN's WMI (first 3 characters)
 */
export function lookupWMI(vin) {
  if (!vin || vin.length < 3) {
    return null;
  }
  
  const wmi = vin.substring(0, 3).toUpperCase();
  return WMI_DATABASE[wmi] || null;
}

/**
 * Get all WMI entries (for analytics/reporting)
 */
export function getAllWMIs() {
  return WMI_DATABASE;
}

/**
 * Extract year from VIN (10th character)
 * Note: This is approximate and may not work for all regions
 */
export function extractYearFromVIN(vin) {
  if (!vin || vin.length < 10) {
    return null;
  }
  
  const yearChar = vin.charAt(9);
  const yearMap = {
    'A': 2010, 'B': 2011, 'C': 2012, 'D': 2013, 'E': 2014,
    'F': 2015, 'G': 2016, 'H': 2017, 'J': 2018, 'K': 2019,
    'L': 2020, 'M': 2021, 'N': 2022, 'P': 2023, 'R': 2024,
    'S': 2025, 'T': 2026, 'V': 2027, 'W': 2028, 'X': 2029,
    'Y': 2030,
    '1': 2001, '2': 2002, '3': 2003, '4': 2004, '5': 2005,
    '6': 2006, '7': 2007, '8': 2008, '9': 2009,
  };
  
  return yearMap[yearChar] || null;
}

export default {
  lookupWMI,
  getAllWMIs,
  extractYearFromVIN
};
