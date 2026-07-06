import plzData from "@/data/plz-at.json";

const PLZ = plzData as Record<string, [number, number]>;

export function plzToLatLng(zip: string): { lat: number; lng: number } | null {
  const entry = PLZ[zip];
  return entry ? { lat: entry[0], lng: entry[1] } : null;
}

const EARTH_RADIUS_KM = 6371;

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}
