import type { SavedAddressLabel } from '@/types/userLocation';
import { SAVED_ADDRESS_LABELS } from '@/types/userLocation';

export function readSavedLocationLabelFromUserDoc(
  data: Record<string, unknown> | undefined,
): SavedAddressLabel | null {
  const raw = data?.locationLabel;
  if (raw === 'home' || raw === 'apartment' || raw === 'building' || raw === 'custom') {
    return raw;
  }
  const nested =
    data?.location && typeof data.location === 'object'
      ? (data.location as Record<string, unknown>).type
      : null;
  if (typeof nested === 'string') {
    const n = nested.trim().toLowerCase();
    if (n === 'home') return 'home';
    if (n === 'apartment') return 'apartment';
    if (n === 'building') return 'building';
    if (n === 'custom') return 'custom';
  }
  return null;
}

/** Free-text label when address type is Custom (Office, Parents, …). */
export function readSavedLocationCustomLabelFromUserDoc(
  data: Record<string, unknown> | undefined,
): string | null {
  const top = data?.locationCustomLabel;
  if (typeof top === 'string' && top.trim()) return top.trim();
  const nested =
    data?.location && typeof data.location === 'object'
      ? (data.location as Record<string, unknown>).customLabel
      : null;
  if (typeof nested === 'string' && nested.trim()) return nested.trim();
  return null;
}

/** Customer-facing label for saved-on-profile / checkout display. */
export function displaySavedAddressTypeLabel(
  label: SavedAddressLabel | null | undefined,
  customLabel?: string | null,
): string {
  if (label === 'custom') {
    const custom = customLabel?.trim();
    return custom || 'Custom';
  }
  if (!label) return '';
  return SAVED_ADDRESS_LABELS.find((l) => l.id === label)?.title ?? '';
}
