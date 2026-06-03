/** Canonical saved address stored on account documents (`location` field). */
export type SavedLocation = {
  address: string;
  /** Same as address — stored explicitly for Firestore readers. */
  formattedAddress?: string;
  latitude: number;
  longitude: number;
  placeId?: string;
  city?: string;
  province?: string;
  country?: string;
  postalCode?: string;
  /** Horizontal accuracy in metres when sourced from device GPS. */
  gpsAccuracy?: number | null;
  /** Firestore server timestamp on write; millis when read client-side. */
  updatedAt?: number;
};

export type AccountLocationCollection = 'users' | 'drivers' | 'restaurants';
