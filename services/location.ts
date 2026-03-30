import * as Location from 'expo-location';

export async function getUserLocation() {
  const { status } = await Location.requestForegroundPermissionsAsync();

  if (status !== 'granted') {
    throw new Error('Location permission denied');
  }

  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  };
}

/** Privacy-safe helper: returns null instead of throwing when denied/unavailable. */
export async function getUserLocationSafe(): Promise<{
  latitude: number;
  longitude: number;
} | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  } catch {
    return null;
  }
}

/** Reverse geocode to city only (never expose exact address in UI). */
export async function getCityFromCoordinates(
  latitude: number,
  longitude: number,
): Promise<string> {
  try {
    const res = await Location.reverseGeocodeAsync({ latitude, longitude });
    return res?.[0]?.city?.trim() || 'Nearby';
  } catch {
    return 'Nearby';
  }
}
