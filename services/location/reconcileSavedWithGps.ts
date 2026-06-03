/** @deprecated Import from `@/lib/location/savedLocationDiffersFromGps`. */
export { savedLocationDiffersFromGps } from '@/lib/location/savedLocationDiffersFromGps';

export type FreshGpsLocationResult = {
  location: import('@/types/savedLocation').SavedLocation;
  city: string | undefined;
};

/** @deprecated Use `resolveProductionGpsSavedLocation` from `@/services/location/productionGps`. */
export async function fetchFreshGpsSavedLocation(): Promise<FreshGpsLocationResult | null> {
  const { resolveProductionGpsSavedLocation } = await import('./productionGps');
  try {
    const { location } = await resolveProductionGpsSavedLocation({ forceFresh: true });
    return { location, city: location.city };
  } catch {
    return null;
  }
}
