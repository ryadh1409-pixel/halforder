import type { SavedAddressLabel } from '@/types/userLocation';

export function readSavedLocationLabelFromUserDoc(
  data: Record<string, unknown> | undefined,
): SavedAddressLabel | null {
  const raw = data?.locationLabel;
  if (raw === 'home' || raw === 'apartment' || raw === 'building' || raw === 'custom') {
    return raw;
  }
  return null;
}
