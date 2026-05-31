import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as Location from 'expo-location';
import { doc, onSnapshot } from 'firebase/firestore';

import {
  fetchPlaceAutocompleteSuggestions,
  fetchPlaceDetails,
  geocodeAddressToCoordinates,
  PlacesApiError,
  reverseGeocodeCoordinates,
} from '@/services/places/googlePlacesClient';
import {
  getCurrentGpsReading,
  requestForegroundLocationPermission,
} from '@/services/location';
import {
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
  const skipFirestoreAddressHydrationRef = useRef(false);
  const [inputVersion, setInputVersion] = useState(0);

  useEffect(() => {
    if (!userId) {
      setSaved(null);
      setLabel(null);
      setLoading(false);
      setAddressInput('');
      skipFirestoreAddressHydrationRef.current = false;
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

        if (loc && !skipFirestoreAddressHydrationRef.current) {
          setAddressInput(loc.address);
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
    };
  }, []);

  const applyResolvedAddress = useCallback((address: string) => {
    const trimmed = address.trim();
    if (!trimmed) return;
    skipFirestoreAddressHydrationRef.current = true;
    setInputVersion((v) => v + 1);
    setAddressInput(trimmed);
    setError(null);
  }, []);

  /** GPS → Google reverse geocode → autofill input → optional Firestore save. */
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
        accuracy: Location.Accuracy.High,
      });

      const coords = {
        latitude: reading.latitude,
        longitude: reading.longitude,
      };
      console.log('[GPS REAL]', coords);
      deviceCoordsRef.current = coords;

      const geocoded = await reverseGeocodeCoordinates(coords.latitude, coords.longitude);

      applyResolvedAddress(geocoded.address);

      const locationPayload: UserSavedLocation = {
        address: geocoded.address,
        latitude: coords.latitude,
        longitude: coords.longitude,
        ...(geocoded.placeId ? { placeId: geocoded.placeId } : {}),
      };

      if (options?.persist && userId) {
        const persisted = await saveUserSavedLocation(userId, locationPayload, {
          label: selectedLabel,
        });
        setSaved(persisted);
        setLabel(selectedLabel);
      }

      return { coords, geocoded, locationPayload };
    },
    [applyResolvedAddress, selectedLabel, userId],
  );

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
      skipFirestoreAddressHydrationRef.current = true;
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
