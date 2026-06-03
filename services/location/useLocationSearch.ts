import { useCallback, useEffect, useRef, useState } from 'react';

import { isGoogleMapsApiKeyConfigured } from '@/lib/maps/googleMapsApiKey';
import {
  fetchPlaceAutocompleteSuggestions,
  fetchPlaceDetailsAsSavedLocation,
  geocodeAddressToSavedLocation,
  PlacesApiError,
} from '@/services/places/googlePlacesClient';
import {
  LIVE_GPS_PRECISE_ERROR,
  LocationPermissionError,
  LocationUnavailableError,
  MAX_ACCEPTABLE_GPS_CACHE_AGE_MS,
} from '@/services/location/gps';
import {
  GPS_IMPROVING_MESSAGE,
  resolveProductionGpsSavedLocation,
} from '@/services/location/productionGps';
import {
  clearDeliveryLocationCache,
  refreshLiveGpsBiasCache,
} from '@/services/location/locationLocalCache';
import type { SavedLocation } from '@/types/savedLocation';
import type { PlaceAutocompleteSuggestion } from '@/types/userLocation';

const DEBOUNCE_MS = 300;

const PLACES_DENIED_MESSAGE =
  'Location search unavailable. Please check API key.';
function locationErrorMessage(error: unknown): string {
  if (error instanceof PlacesApiError) {
    if (error.status === 'REQUEST_DENIED' || error.status === 'MISSING_KEY') {
      return PLACES_DENIED_MESSAGE;
    }
    return error.message;
  }
  if (error instanceof LocationPermissionError || error instanceof LocationUnavailableError) {
    return LIVE_GPS_PRECISE_ERROR;
  }
  if (error instanceof Error) {
    if (
      error.message.toLowerCase().includes('permission') ||
      error.message.toLowerCase().includes('location')
    ) {
      return LIVE_GPS_PRECISE_ERROR;
    }
    return error.message;
  }
  return 'Could not resolve that address.';
}

export type LocationSearchGpsState = {
  accuracyMeters: number | null;
  latitude: number | null;
  longitude: number | null;
};

const EMPTY_GPS_STATE: LocationSearchGpsState = {
  accuracyMeters: null,
  latitude: null,
  longitude: null,
};

function isEmptyGpsState(state: LocationSearchGpsState): boolean {
  return (
    state.accuracyMeters === null &&
    state.latitude === null &&
    state.longitude === null
  );
}

export function useLocationSearch() {
  /** Text shown in the search field — user typing or explicit GPS fill only. */
  const [searchQuery, setSearchQuery] = useState('');
  /** Resolved selection (Places/GPS) — never copied from Firestore into searchQuery. */
  const [selectedLocation, setSelectedLocation] = useState<SavedLocation | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceAutocompleteSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolvingGps, setResolvingGps] = useState(false);
  const [gpsImproving, setGpsImproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placesAvailable, setPlacesAvailable] = useState(isGoogleMapsApiKeyConfigured());
  const [showNoResults, setShowNoResults] = useState(false);
  const [searchFieldKey, setSearchFieldKey] = useState(0);
  const [gpsState, setGpsState] = useState<LocationSearchGpsState>({
    accuracyMeters: null,
    latitude: null,
    longitude: null,
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);
  const liveGpsBiasRef = useRef<{
    latitude: number;
    longitude: number;
    capturedAtMs: number;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current != null) clearTimeout(debounceRef.current);
    };
  }, []);

  const clearStaleCaches = useCallback(async (logReason?: string) => {
    await clearDeliveryLocationCache(
      logReason ? { log: true, reason: logReason } : undefined,
    );
    liveGpsBiasRef.current = null;
  }, []);

  const setLiveGpsBias = useCallback(
    async (latitude: number, longitude: number, accuracy: number | null) => {
      const capturedAtMs = Date.now();
      liveGpsBiasRef.current = { latitude, longitude, capturedAtMs };
      setGpsState((prev) => {
        if (
          prev.latitude === latitude &&
          prev.longitude === longitude &&
          prev.accuracyMeters === accuracy
        ) {
          return prev;
        }
        return {
          accuracyMeters: accuracy,
          latitude,
          longitude,
        };
      });
      await refreshLiveGpsBiasCache({
        latitude,
        longitude,
        accuracy,
        capturedAt: capturedAtMs,
      });
    },
    [],
  );

  const applySelectedLocation = useCallback(
    (location: SavedLocation, options?: { fillSearchInput?: boolean }) => {
      setSelectedLocation((prev) =>
        prev?.address === location.address &&
        prev.latitude === location.latitude &&
        prev.longitude === location.longitude
          ? prev
          : location,
      );
      setError((prev) => (prev === null ? prev : null));
      setSuggestions((prev) => (prev.length === 0 ? prev : []));
      setShowNoResults((prev) => (prev === false ? prev : false));
      if (options?.fillSearchInput) {
        setSearchQuery((prev) => (prev === location.address ? prev : location.address));
      } else {
        setSearchQuery((prev) => (prev === '' ? prev : ''));
      }
    },
    [],
  );

  const resetSearchField = useCallback(() => {
    setSearchQuery((prev) => (prev === '' ? prev : ''));
    setSuggestions((prev) => (prev.length === 0 ? prev : []));
    setShowNoResults((prev) => (prev === false ? prev : false));
    setSearching((prev) => (prev === false ? prev : false));
  }, []);

  const clearAllLocalState = useCallback(() => {
    setSearchQuery((prev) => (prev === '' ? prev : ''));
    setSuggestions((prev) => (prev.length === 0 ? prev : []));
    setShowNoResults((prev) => (prev === false ? prev : false));
    setSearching((prev) => (prev === false ? prev : false));
    setSelectedLocation((prev) => (prev === null ? prev : null));
    setError((prev) => (prev === null ? prev : null));
    setGpsState((prev) => (isEmptyGpsState(prev) ? prev : EMPTY_GPS_STATE));
    liveGpsBiasRef.current = null;
  }, []);

  /** After Firestore save — preview card uses saved row; search stays empty. */
  const settleAfterSave = useCallback(() => {
    setSelectedLocation((prev) => (prev === null ? prev : null));
    setSearchQuery((prev) => (prev === '' ? prev : ''));
    setSuggestions((prev) => (prev.length === 0 ? prev : []));
    setShowNoResults((prev) => (prev === false ? prev : false));
    setSearching((prev) => (prev === false ? prev : false));
  }, []);

  /** Places bias from last explicit GPS tap only — never auto-fetches GPS. */
  const getPlacesSearchOrigin = useCallback((): {
    latitude: number;
    longitude: number;
  } | undefined => {
    const bias = liveGpsBiasRef.current;
    if (
      !bias ||
      Date.now() - bias.capturedAtMs > MAX_ACCEPTABLE_GPS_CACHE_AGE_MS
    ) {
      return undefined;
    }
    return { latitude: bias.latitude, longitude: bias.longitude };
  }, []);

  const runSearch = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setSearching(false);
      setShowNoResults(false);
      return;
    }

    if (!isGoogleMapsApiKeyConfigured()) {
      setPlacesAvailable(false);
      setSuggestions([]);
      setSearching(false);
      setShowNoResults(false);
      setError(PLACES_DENIED_MESSAGE);
      return;
    }

    setPlacesAvailable(true);
    const seq = ++searchSeqRef.current;
    setSearching(true);
    setShowNoResults(false);
    setError(null);

    console.log('[PLACES SEARCH QUERY]', trimmed);

    try {
      const origin = getPlacesSearchOrigin();

      const rows = await fetchPlaceAutocompleteSuggestions(trimmed, {
        origin,
        broadTypes: true,
      });
      if (seq === searchSeqRef.current) {
        setSuggestions(rows);
        setShowNoResults(rows.length === 0);
      }
    } catch (e) {
      if (seq === searchSeqRef.current) {
        setSuggestions([]);
        setShowNoResults(false);
        setError(locationErrorMessage(e));
      }
    } finally {
      if (seq === searchSeqRef.current) {
        setSearching(false);
      }
    }
  }, [getPlacesSearchOrigin]);

  const onSearchQueryChange = useCallback(
    (text: string) => {
      setSearchQuery(text);
      setSelectedLocation(null);
      setError(null);
      setShowNoResults(false);
      if (debounceRef.current != null) clearTimeout(debounceRef.current);
      if (text.trim().length < 2) {
        setSuggestions([]);
        setSearching(false);
        return;
      }
      debounceRef.current = setTimeout(() => {
        void runSearch(text);
      }, DEBOUNCE_MS);
    },
    [runSearch],
  );

  const selectSuggestion = useCallback(
    async (placeId: string): Promise<SavedLocation | null> => {
      setSearching(true);
      setSuggestions([]);
      setShowNoResults(false);
      setError(null);
      try {
        await clearStaleCaches();
        const location = await fetchPlaceDetailsAsSavedLocation(placeId);
        await setLiveGpsBias(location.latitude, location.longitude, null);
        applySelectedLocation(location, { fillSearchInput: false });
        console.log('[PLACES RESULT SELECTED]', {
          placeId,
          address: location.address,
          latitude: location.latitude,
          longitude: location.longitude,
        });
        return location;
      } catch (e) {
        setError(locationErrorMessage(e));
        return null;
      } finally {
        setSearching(false);
      }
    },
    [applySelectedLocation, clearStaleCaches, setLiveGpsBias],
  );

  const applyCurrentDeviceLocation = useCallback(async (): Promise<SavedLocation | null> => {
    setSuggestions([]);
    setShowNoResults(false);
    setResolvingGps(true);
    setGpsImproving(true);
    setError(null);

    try {
      await clearStaleCaches('use_current_location');
      const { reading, location } = await resolveProductionGpsSavedLocation({
        forceFresh: true,
      });
      await setLiveGpsBias(reading.latitude, reading.longitude, reading.accuracy ?? null);
      const withAccuracy: SavedLocation = {
        ...location,
        formattedAddress: location.formattedAddress ?? location.address,
        gpsAccuracy: reading.accuracy ?? null,
      };
      applySelectedLocation(withAccuracy, { fillSearchInput: true });
      return withAccuracy;
    } catch (e) {
      setError(locationErrorMessage(e));
      return null;
    } finally {
      setGpsImproving(false);
      setResolvingGps(false);
    }
  }, [applySelectedLocation, clearStaleCaches, setLiveGpsBias]);

  const resolveDraftForSave = useCallback(async (): Promise<SavedLocation> => {
    if (
      selectedLocation?.address.trim() &&
      Number.isFinite(selectedLocation.latitude) &&
      Number.isFinite(selectedLocation.longitude)
    ) {
      return selectedLocation;
    }

    const trimmed = searchQuery.trim();
    if (!trimmed) {
      throw new PlacesApiError('Enter an address before saving.', 'INVALID_INPUT');
    }
    if (trimmed.length < 3) {
      throw new PlacesApiError('Enter an address with at least 3 characters.', 'INVALID_INPUT');
    }

    if (!isGoogleMapsApiKeyConfigured()) {
      throw new PlacesApiError(PLACES_DENIED_MESSAGE, 'MISSING_KEY');
    }

    const location = await geocodeAddressToSavedLocation(trimmed);
    applySelectedLocation(location, { fillSearchInput: false });
    return location;
  }, [applySelectedLocation, searchQuery, selectedLocation]);

  /** Show active location preview without touching the search field. */
  const setActiveLocationPreview = useCallback((location: SavedLocation) => {
    setSelectedLocation((prev) =>
      prev?.address === location.address &&
      prev.latitude === location.latitude &&
      prev.longitude === location.longitude
        ? prev
        : location,
    );
    setSearchQuery((prev) => (prev === '' ? prev : ''));
    setSuggestions((prev) => (prev.length === 0 ? prev : []));
    setShowNoResults((prev) => (prev === false ? prev : false));
    setError((prev) => (prev === null ? prev : null));
  }, []);

  return {
    searchQuery,
    /** @deprecated Use searchQuery */
    addressInput: searchQuery,
    selectedLocation,
    /** @deprecated Use selectedLocation */
    draft: selectedLocation,
    suggestions,
    searching,
    resolvingGps,
    gpsImproving,
    gpsImprovingMessage: gpsImproving ? GPS_IMPROVING_MESSAGE : null,
    error,
    placesAvailable,
    showNoResults,
    searchFieldKey,
    gpsState,
    setError,
    onSearchQueryChange,
    /** @deprecated Use onSearchQueryChange */
    onAddressInputChange: onSearchQueryChange,
    selectSuggestion,
    applyCurrentDeviceLocation,
    resolveDraftForSave,
    clearAllLocalState,
    resetSearchField,
    clearStaleCaches,
    settleAfterSave,
    setActiveLocationPreview,
  };
}
