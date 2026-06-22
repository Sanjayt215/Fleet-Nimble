import logger from "../utils/logger.js";
import { lookupWMI, extractYearFromVIN } from "./wmiDatabase.js";

/**
 * VIN Decoder Service
 * Multi-level VIN decoding with fallback support
 */

const DECODE_SOURCES = {
  NHTSA: 'NHTSA',
  LOCAL_WMI: 'LOCAL_WMI',
  MANUAL: 'MANUAL'
};

const DECODE_TYPES = {
  FULL: 'FULL_DECODE',
  PARTIAL: 'PARTIAL_DECODE',
  MANUAL_REQUIRED: 'MANUAL_COMPLETION_REQUIRED'
};

/**
 * Validate VIN format
 */
export function validateVIN(vin) {
  if (!vin || typeof vin !== 'string') {
    return { valid: false, error: 'VIN is required' };
  }
  
  const cleanVin = vin.trim().toUpperCase();
  
  // Must be 17 characters
  if (cleanVin.length !== 17) {
    return { 
      valid: false, 
      error: `VIN must be exactly 17 characters (received ${cleanVin.length})` 
    };
  }
  
  // Cannot contain I, O, Q
  const invalidChars = cleanVin.match(/[IOQ]/g);
  if (invalidChars) {
    return { 
      valid: false, 
      error: `VIN contains invalid characters: ${invalidChars.join(', ')}. VIN cannot contain I, O, or Q.` 
    };
  }
  
  // Must only contain valid characters
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(cleanVin)) {
    return { 
      valid: false, 
      error: 'VIN must contain only letters (A-H, J-N, P, R-Z) and numbers (0-9)' 
    };
  }
  
  return { valid: true, cleanVin };
}

/**
 * Level 1: Decode VIN using NHTSA vPIC API
 */
async function decodeWithNHTSA(vin) {
  try {
    logger.info('🔍 [NHTSA] Attempting decode', { vin });
    
    const response = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`,
      { timeout: 5000 }
    );
    
    if (!response.ok) {
      logger.warn('⚠️ [NHTSA] API request failed', { status: response.status });
      return null;
    }
    
    const data = await response.json();
    const result = data.Results[0];
    
    if (!result) {
      logger.warn('⚠️ [NHTSA] No results returned');
      return null;
    }
    
    // Check if we have meaningful data
    const hasMake = result.Make && result.Make.trim().length > 0;
    const hasModel = result.Model && result.Model.trim().length > 0;
    
    if (hasMake || hasModel) {
      logger.info('✅ [NHTSA] Decode successful', { 
        make: result.Make, 
        model: result.Model 
      });
      
      return {
        source: DECODE_SOURCES.NHTSA,
        vin: result.VIN || vin,
        make: result.Make || null,
        model: result.Model || null,
        year: result.ModelYear ? parseInt(result.ModelYear) : null,
        manufacturer: result.Manufacturer || null,
        fuelType: result.FuelTypePrimary || null,
        bodyClass: result.BodyClass || null,
        engineModel: result.EngineModel || null,
        country: null, // NHTSA doesn't provide country
        errorCode: result.ErrorCode,
        errorText: result.ErrorText
      };
    }
    
    logger.warn('⚠️ [NHTSA] No meaningful data', { 
      errorCode: result.ErrorCode,
      errorText: result.ErrorText 
    });
    return null;
    
  } catch (error) {
    logger.error('❌ [NHTSA] Exception', { error: error.message });
    return null;
  }
}

/**
 * Level 2: Decode VIN using local WMI database
 */
function decodeWithLocalWMI(vin) {
  try {
    logger.info('🔍 [LOCAL_WMI] Attempting decode', { vin });
    
    const wmiData = lookupWMI(vin);
    
    if (!wmiData) {
      logger.warn('⚠️ [LOCAL_WMI] WMI not found in database');
      return null;
    }
    
    // Try to extract year from VIN
    const estimatedYear = extractYearFromVIN(vin);
    
    logger.info('✅ [LOCAL_WMI] Partial decode successful', { 
      manufacturer: wmiData.manufacturer,
      country: wmiData.country 
    });
    
    return {
      source: DECODE_SOURCES.LOCAL_WMI,
      vin: vin,
      make: wmiData.make,
      model: null, // WMI cannot determine model
      year: estimatedYear,
      manufacturer: wmiData.manufacturer,
      country: wmiData.country,
      fuelType: null,
      bodyClass: null,
      engineModel: null,
      errorCode: null,
      errorText: null
    };
    
  } catch (error) {
    logger.error('❌ [LOCAL_WMI] Exception', { error: error.message });
    return null;
  }
}

/**
 * Main VIN decode function with fallback chain
 */
export async function decodeVIN(vin) {
  const startTime = Date.now();
  
  // Validate VIN
  const validation = validateVIN(vin);
  if (!validation.valid) {
    return {
      success: false,
      error: {
        code: 'INVALID_VIN',
        message: validation.error,
        allowManualEntry: false
      }
    };
  }
  
  const cleanVin = validation.cleanVin;
  
  logger.info('🚗 Starting VIN decode', { vin: cleanVin });
  
  // Level 1: Try NHTSA
  let result = await decodeWithNHTSA(cleanVin);
  
  if (result) {
    const duration = Date.now() - startTime;
    logger.info('✅ VIN decode complete (NHTSA)', { duration: `${duration}ms` });
    
    return {
      success: true,
      data: {
        ...result,
        decodeSource: DECODE_SOURCES.NHTSA,
        decodeType: DECODE_TYPES.FULL,
        isPartial: false,
        confidence: 'HIGH'
      }
    };
  }
  
  // Level 2: Try Local WMI
  result = decodeWithLocalWMI(cleanVin);
  
  if (result) {
    const duration = Date.now() - startTime;
    logger.info('✅ VIN decode complete (LOCAL_WMI)', { duration: `${duration}ms` });
    
    return {
      success: true,
      data: {
        ...result,
        decodeSource: DECODE_SOURCES.LOCAL_WMI,
        decodeType: DECODE_TYPES.PARTIAL,
        isPartial: true,
        confidence: 'MEDIUM'
      },
      warning: 'Vehicle partially identified from manufacturer database. Please verify and complete details.'
    };
  }
  
  // Level 3: Manual entry required
  const duration = Date.now() - startTime;
  logger.warn('⚠️ VIN decode failed - manual entry required', { 
    vin: cleanVin,
    duration: `${duration}ms` 
  });
  
  return {
    success: false,
    error: {
      code: 'VIN_DECODE_UNAVAILABLE',
      message: 'VIN is valid but could not be decoded automatically. Please enter vehicle details manually.',
      allowManualEntry: true,
      vin: cleanVin,
      decodeType: DECODE_TYPES.MANUAL_REQUIRED
    }
  };
}

export default {
  decodeVIN,
  validateVIN,
  DECODE_SOURCES,
  DECODE_TYPES
};
