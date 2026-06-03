import type { SavedLocation } from '@/types/savedLocation';

/** Saved delivery address on `users/{uid}.location`. */
export type UserSavedLocation = SavedLocation;

export type SavedAddressLabel = 'home' | 'apartment' | 'building' | 'custom';

export const SAVED_ADDRESS_LABELS: {
  id: SavedAddressLabel;
  title: string;
  icon: 'home' | 'apartment' | 'business' | 'edit-location';
}[] = [
  { id: 'home', title: 'Home', icon: 'home' },
  { id: 'apartment', title: 'Apartment', icon: 'apartment' },
  { id: 'building', title: 'Building', icon: 'business' },
  { id: 'custom', title: 'Custom', icon: 'edit-location' },
];

export type PlaceAutocompleteSuggestion = {
  placeId: string;
  description: string;
  /** Place name (main line). */
  mainText: string;
  /** Formatted address (secondary line). */
  secondaryText: string;
  formattedAddress: string;
};

export type PlaceDetailsResult = {
  placeId: string;
  address: string;
  latitude: number;
  longitude: number;
  city?: string;
  province?: string;
  country?: string;
  postalCode?: string;
};
