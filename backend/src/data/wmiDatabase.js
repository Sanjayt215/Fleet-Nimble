/**
 * World Manufacturer Identifier (WMI) Database
 * First 3 characters of VIN identify manufacturer and country
 * Re-exports the canonical WMI registry in array form.
 */

import { getAllWMIs } from '../services/wmiDatabase.js';

export const wmiDatabase = Object.entries(getAllWMIs()).map(([wmi, info]) => ({
  wmi,
  manufacturer: info.manufacturer,
  country: info.country,
  brand: info.make,
}));
