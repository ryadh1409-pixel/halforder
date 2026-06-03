import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { doc, onSnapshot } from 'firebase/firestore';

import { haversineDistanceKm } from '@/lib/haversine';
import {
  fetchPlaceAutocompleteSuggestions,
  fetchPlaceDetails,
  geocodeAddressToCoordinates,
  PlacesApiError,
} from '@/services/places/googlePlacesClient';
import {
  getCurrentGpsReading,
  requestForegroundLocationPermission,
  watchGpsPosition,
} from '@/services/location';
import {
  CURRENT_LOCATION_LABEL,
  resolveAddressFromGps,
} from '@/services/location/resolveAddressFromGps';
import {
  persistGpsCoordinatesOnly,
  readSavedLocationFromUserDoc,
  readSavedLocationLabelFromUserDoc,
  saveUserSavedLocation,
} from '@/services/profile/savedLocation';
import type { SavedAddressLabel, UserSavedLocation } from '@/types/userLocation';
import { db } from '@/services/firebase';

export type ProfileLocationState = {
  saved: UserSavedLocation | null;
  label: SavedAddressLabel | null;
  loading: boolean;
  saving: boolean;
  searching: boolean;
  resolvingGps: boolean;
  error: string | null;
  /** Human-readable address shown in the input (autofill target). */
  addressInput: string;
  suggestions: Awaited<ReturnType<typeof fetchPlaceAutocompleteSuggestions>>;
  selectedLabel: SavedAddressLabel;
};

const DEFAULT_LABEL: SavedAddressLabel = 'home';

/** Minimum movement before re-geocoding while profile is open (km). */
const PROFILE_LOCATION_WATCH_KM = 0.75;

type DeviceCoords = { latitude: number; longitude: number };

function locationErrorMessage(error: unknown): string {
  if (error instanceof PlacesApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Could not resolve your address.';
}

function showLocationAlert(message: string): void {
  Alert.alert('Location', message, [{ text: 'OK' }]);
}

export function useProfileLocation(userId: string | null) {
  const [saved, setSaved] = useState<UserSavedLocation | null>(null);
  const [label, setLabel] = useState<SavedAddressLabel | null>(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [resolvingGps, setResolvingGps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addressInput, setAddressInput] = useState('');
  const [suggestions, setSuggestions] = useState<
    ProfileLocationState['suggestions']
  >([]);
  const [selectedLabel, setSelectedLabel] = useState<SavedAddressLabel>(DEFAULT_LABEL);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);
  const deviceCoordsRef = useRef<DeviceCoords | null>(null);
  const [inputVersion, setInputVersion] = useState(0);
  const gpsWatchRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    if (!userId) {
      setSaved(null);
      setLabel(null);
      setLoading(false);
      setAddressInput('');
      deviceCoordsRef.current = null;
      return undefined;
    }

    setLoading(true);
    const ref = doc(db, 'users', userId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? (snap.data() as Record<string, unknown>) : undefined;
        const loc = readSavedLocationFromUserDoc(data);
        setSaved(loc);
        setLabel(readSavedLocationLabelFromUserDoc(data));
        if (loc) {
          deviceCoordsRef.current = {
            latitude: loc.latitude,
            longitude: loc.longitude,
          };
        }
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );
    return unsub;
  }, [userId]);

  useEffect(() => {
    return () => {
      if (debounceRef.current != null) clearTimeout(debounceRef.current);
      gpsWatchRef.current?.remove();
      gpsWatchRef.current = null;
    };
  }, []);

  const applyResolvedAddress = useCallback((address: string) => {
    const trimmed = address.trim();
    if (!trimmed) return;
    setInputVersion((v) => v + 1);
    setAddressInput(trimmed);
    setError(null);
  }, []);

  const syncGpsToProfile = useCallback(
    async (
      coords: DeviceCoords,
      options?: { persist?: boolean; label?: SavedAddressLabel },
    ) => {
      console.log('[GPS REAL]', coords);
      deviceCoordsRef.current = coords;

      const resolved = await resolveAddressFromGps(coords.latitude, coords.longitude);
      applyResolvedAddress(resolved.address);

      if (!options?.persist || !userId) {
        return { coords, resolved, locationPayload: null };
      }

      if (resolved.geocoded) {
        const locationPayload: UserSavedLocation = {
          address: resolved.address,
          latitude: coords.latitude,
          longitude: coords.longitude,
          ...(resolved.placeId ? { placeId: resolved.placeId } : {}),
        };
        const persisted = await saveUserSavedLocation(userId, locationPayload, {
          label: options.label ?? selectedLabel,
        });
        setSaved(persisted);
        setLabel(options.label ?? selectedLabel);
        return { coords, resolved, locationPayload };
      }

      await persistGpsCoordinatesOnly(userId, coords.latitude, coords.longitude);
      setSaved(null);
      if (resolved.geocodeStatus === 'REQUEST_DENIED' || resolved.geocodeStatus === 'MISSING_KEY') {
        setError(
          resolved.geocodeError ??
            'Google Geocoding is unavailable. Enable Geocoding API and verify your API key.',
        );
      }
      return { coords, resolved, locationPayload: null };
    },
    [applyResolvedAddress, selectedLabel, userId],
  );

  /** GPS → Google reverse geocode (or Current Location fallback) → optional Firestore save. */
  const resolveRealDeviceLocation = useCallback(
    async (options?: { persist?: boolean }) => {
      const permission = await requestForegroundLocationPermission();
      if (permission !== 'granted') {
        throw new PlacesApiError(
          'Location permission is required. Enable location access in Settings.',
          'PERMISSION_DENIED',
        );
      }

      const reading = await getCurrentGpsReading({
        accuracy: Location.Accuracy.BestForNavigation,
        fresh: true,
      });

      return syncGpsToProfile(
        { latitude: reading.latitude, longitude: reading.longitude },
        { persist: options?.persist, label: selectedLabel },
      );
    },
    [selectedLabel, syncGpsToProfile],
  );

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      void resolveRealDeviceLocation({ persist: true });
    }, [userId, resolveRealDeviceLocation]),
  );

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    void (async () => {
      const permission = await requestForegroundLocationPermission();
      if (permission !== 'granted' || cancelled) return;

      gpsWatchRef.current?.remove();
      gpsWatchRef.current = await watchGpsPosition(
        (reading) => {
          void (async () => {
            const prev = deviceCoordsRef.current;
            if (prev) {
              const movedKm = haversineDistanceKm(
                prev.latitude,
                prev.longitude,
                reading.latitude,
                reading.longitude,
              );
              if (movedKm < PROFILE_LOCATION_WATCH_KM) return;
            }
            try {
              await syncGpsToProfile(
                { latitude: reading.latitude, longitude: reading.longitude },
                { persist: true, label: selectedLabel },
              );
            } catch {
              applyResolvedAddress(CURRENT_LOCATION_LABEL);
            }
          })();
        },
        {
          accuracy: Location.Accuracy.Balanced,
          distanceIntervalM: Math.round(PROFILE_LOCATION_WATCH_KM * 1000),
        },
      );
    })();

    return () => {
      cancelled = true;
      gpsWatchRef.current?.remove();
      gpsWatchRef.current = null;
    };
  }, [applyResolvedAddress, selectedLabel, syncGpsToProfile, userId]);

  const runSearch = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    const seq = ++searchSeqRef.current;
    setSearching(true);
    setError(null);
    try {
      const origin = deviceCoordsRef.current ?? saved ?? undefined;
      const rows = await fetchPlaceAutocompleteSuggestions(trimmed, { origin });
      if (seq === searchSeqRef.current) {
        setSuggestions(rows);
      }
    } catch (e) {
      if (seq === searchSeqRef.current) {
        setSuggestions([]);
        const msg = locationErrorMessage(e);
        setError(msg);
      }
    } finally {
      if (seq === searchSeqRef.current) {
        setSearching(false);
      }
    }
  }, [saved]);

  const onAddressInputChange = useCallback(
    (text: string) => {
      setAddressInput(text);
      setError(null);
      if (debounceRef.current != null) clearTimeout(debounceRef.current);
      if (text.trim().length < 2) {
        setSuggestions([]);
        setSearching(false);
        return;
      }
      debounceRef.current = setTimeout(() => {
        void runSearch(text);
      }, 350);
    },
    [runSearch],
  );

  const selectSuggestion = useCallback(
    async (placeId: string) => {
      if (!userId) return;
      setSaving(true);
      setError(null);
      setSuggestions([]);
      try {
        const details = await fetchPlaceDetails(placeId);
        applyResolvedAddress(details.address);
        deviceCoordsRef.current = {
          latitude: details.latitude,
          longitude: details.longitude,
        };
        const persisted = await saveUserSavedLocation(
          userId,
          {
            address: details.address,
            latitude: details.latitude,
            longitude: details.longitude,
            placeId: details.placeId,
          },
          { label: selectedLabel },
        );
        setSaved(persisted);
        setLabel(selectedLabel);
      } catch (e) {
        const msg = locationErrorMessage(e);
        setError(msg);
        showLocationAlert(msg);
      } finally {
        setSaving(false);
      }
    },
    [applyResolvedAddress, selectedLabel, userId],
  );

  const applyCurrentDeviceLocation = useCallback(async () => {
    if (!userId) return;
    setResolvingGps(true);
    setError(null);
    setSuggestions([]);
    try {
      await resolveRealDeviceLocation({ persist: true });
    } catch (e) {
      const msg = locationErrorMessage(e);
      setError(msg);
      showLocationAlert(msg);
    } finally {
      setResolvingGps(false);
    }
  }, [resolveRealDeviceLocation, userId]);

  const saveManualQuery = useCallback(async () => {
    if (!userId) return;
    const trimmed = addressInput.trim();
    if (trimmed.length < 3) {
      const msg = 'Enter an address with at least 3 characters.';
      setError(msg);
      showLocationAlert(msg);
      return;
    }
    if (trimmed === CURRENT_LOCATION_LABEL) {
      const msg = 'Use “Use current location” or search for a street address.';
      setError(msg);
      showLocationAlert(msg);
      return;
    }
    setSaving(true);
    setError(null);
    setSuggestions([]);
    try {
      const details = await geocodeAddressToCoordinates(trimmed);
      applyResolvedAddress(details.address);
      deviceCoordsRef.current = {
        latitude: details.latitude,
        longitude: details.longitude,
      };
      const persisted = await saveUserSavedLocation(
        userId,
        {
          address: details.address,
          latitude: details.latitude,
          longitude: details.longitude,
          ...(details.placeId ? { placeId: details.placeId } : {}),
        },
        { label: selectedLabel },
      );
      setSaved(persisted);
      setLabel(selectedLabel);
    } catch (e) {
      const msg = locationErrorMessage(e);
      setError(msg);
      showLocationAlert(msg);
    } finally {
      setSaving(false);
    }
  }, [addressInput, applyResolvedAddress, selectedLabel, userId]);

  return {
    saved,
    label,
    loading,
    saving,
    searching,
    resolvingGps,
    error,
    addressInput,
    inputVersion,
    suggestions,
    selectedLabel,
    setSelectedLabel,
    onAddressInputChange,
    selectSuggestion,
    applyCurrentDeviceLocation,
    saveManualQuery,
    clearError: () => setError(null),
  };
}
