import type {LatLng} from '../services/geocoding';

export function milesToMeters(miles: number) {
  return miles * 1609.344;
}

export function metersToMiles(meters: number) {
  return meters / 1609.344;
}

// Haversine distance between two coordinates in meters
export function distanceBetween(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371e3; // meters
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);

  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

export function isWithinRadius(center: LatLng, point: LatLng, radiusMiles: number): boolean {
  const dist = distanceBetween(center, point);
  return dist <= milesToMeters(radiusMiles);
}
