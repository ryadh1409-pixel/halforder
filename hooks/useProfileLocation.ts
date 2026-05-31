import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchPlaceAutocompleteSuggestions,
  fetchPlaceDetails,
  geocodeAddressToCoordinates,
  PlacesApiError,
} from '@/services/places/googlePlacesClient';
import {
  getCurrentGpsReadingSafe,
  requestForegroundLocationPermission,
  reverseGeocodeAddress,
} from '@/services/location';
import {
  readSavedLocationFromUserDoc,
  readSavedLocationLabelFromUserDoc,
  saveUserSavedLocation,
} from '@/services/profile/savedLocation';
import type { SavedAddressLabel, UserSavedLocation } from '@/types/userLocation';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/services/firebase';

export type ProfileLocationState = {
  saved: UserSavedLocation | null;
  label: SavedAddressLabel | null;
  loading: boolean;
  saving: boolean;
  searching: boolean;
  resolvingGps: boolean;
  error: string | null;
  query: string;
  suggestions: Awaited<ReturnType<typeof fetchPlaceAutocompleteSuggestions>>;
  selectedLabel: SavedAddressLabel;
};

const DEFAULT_LABEL: SavedAddressLabel = 'home';

export function useProfileLocation(userId: string | null) {
  const [saved, setSaved] = useState<UserSavedLocation | null>(null);
  const [label, setLabel] = useState<SavedAddressLabel | null>(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [resolvingGps, setResolvingGps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<
    ProfileLocationState['suggestions']
  >([]);
  const [selectedLabel, setSelectedLabel] = useState<SavedAddressLabel>(DEFAULT_LABEL);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);
  const hydratedQueryRef = useRef(false);

  useEffect(() => {
    if (!userId) {
      setSaved(null);
      setLabel(null);
      setLoading(false);
      hydratedQueryRef.current = false;
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
        if (loc && !hydratedQueryRef.current) {
          hydratedQueryRef.current = true;
          setQuery(loc.address);
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

  const runSearch = useCallback(
    async (text: string, origin?: { latitude: number; longitude: number }) => {
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
        const rows = await fetchPlaceAutocompleteSuggestions(trimmed, { origin });
        if (seq === searchSeqRef.current) {
          setSuggestions(rows);
        }
      } catch (e) {
        if (seq === searchSeqRef.current) {
          setSuggestions([]);
          setError(e instanceof PlacesApiError ? e.message : 'Address search failed.');
        }
      } finally {
        if (seq === searchSeqRef.current) {
          setSearching(false);
        }
      }
    },
    [],
  );

  const onQueryChange = useCallback(
    (text: string) => {
      setQuery(text);
      setError(null);
      if (debounceRef.current != null) clearTimeout(debounceRef.current);
      if (text.trim().length < 2) {
        setSuggestions([]);
        setSearching(false);
        return;
      }
      debounceRef.current = setTimeout(() => {
        void runSearch(text, saved ?? undefined);
      }, 350);
    },
    [runSearch, saved],
  );

  const selectSuggestion = useCallback(
    async (placeId: string) => {
      if (!userId) return;
      setSaving(true);
      setError(null);
      setSuggestions([]);
      try {
        const details = await fetchPlaceDetails(placeId);
        setQuery(details.address);
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
        setError(
          e instanceof PlacesApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : 'Could not save location.',
        );
      } finally {
        setSaving(false);
      }
    },
    [selectedLabel, userId],
  );

  const useCurrentDeviceLocation = useCallback(async () => {
    if (!userId) return;
    setResolvingGps(true);
    setError(null);
    setSuggestions([]);
    try {
      const permission = await requestForegroundLocationPermission();
      if (permission !== 'granted') {
        setError('Location permission is required to use your current position.');
        return;
      }
      const reading = await getCurrentGpsReadingSafe();
      if (!reading) {
        setError('Could not determine your current location.');
        return;
      }
      const address = await reverseGeocodeAddress(reading.latitude, reading.longitude);
      setQuery(address);
      const persisted = await saveUserSavedLocation(
        userId,
        {
          address,
          latitude: reading.latitude,
          longitude: reading.longitude,
        },
        { label: selectedLabel },
      );
      setSaved(persisted);
      setLabel(selectedLabel);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not use current location.');
    } finally {
      setResolvingGps(false);
    }
  }, [selectedLabel, userId]);

  const saveManualQuery = useCallback(async () => {
    if (!userId) return;
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setError('Enter an address with at least 3 characters.');
      return;
    }
    setSaving(true);
    setError(null);
    setSuggestions([]);
    try {
      const details = await geocodeAddressToCoordinates(trimmed);
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
      setQuery(details.address);
      setSaved(persisted);
      setLabel(selectedLabel);
    } catch (e) {
      setError(
        e instanceof PlacesApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Could not save location.',
      );
    } finally {
      setSaving(false);
    }
  }, [query, selectedLabel, userId]);

  return {
    saved,
    label,
    loading,
    saving,
    searching,
    resolvingGps,
    error,
    query,
    suggestions,
    selectedLabel,
    setSelectedLabel,
    onQueryChange,
    selectSuggestion,
    useCurrentDeviceLocation,
    saveManualQuery,
    clearError: () => setError(null),
  };
}
