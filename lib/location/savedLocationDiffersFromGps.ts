import type { SavedLocation } from '@/types/savedLocation';

import { savedLocationShouldBeReplacedByGps } from './savedLocationReconcile';

/** @deprecated Use {@link savedLocationShouldBeReplacedByGps}. */
export function savedLocationDiffersFromGps(
  saved: SavedLocation | null,
  gps: SavedLocation,
): boolean {
  return savedLocationShouldBeReplacedByGps(saved, gps);
}
