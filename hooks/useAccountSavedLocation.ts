import { useCallback, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';

import { savedLocationsEqual } from '@/lib/location/savedLocationEqual';
import {
  fetchSavedLocationFromServer,
  readSavedLocationFromDoc,
  saveAccountSavedLocation,
  type SaveAccountLocationOptions,
} from '@/services/location/savedLocationFirestore';
import { readSavedLocationLabelFromUserDoc } from '@/lib/location/userLocationLabel';
import { db } from '@/services/firebase';
import type { AccountLocationCollection, SavedLocation } from '@/types/savedLocation';
import type { SavedAddressLabel } from '@/types/userLocation';

type Options = {
  /** Ignore Firestore SDK cache snapshots (delivery profile). */
  skipCacheSnapshots?: boolean;
};

export function useAccountSavedLocation(
  collection: AccountLocationCollection,
  accountId: string | null,
  options?: Options,
) {
  const skipCacheSnapshots = options?.skipCacheSnapshots === true;
  const [saved, setSaved] = useState<SavedLocation | null>(null);
  const [label, setLabel] = useState<SavedAddressLabel | null>(null);
  const [loading, setLoading] = useState(Boolean(accountId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyDocData = useCallback(
    (data: Record<string, unknown> | undefined) => {
      const nextLocation = readSavedLocationFromDoc(data);
      setSaved((prev) =>
        savedLocationsEqual(prev, nextLocation) ? prev : nextLocation,
      );
      if (collection === 'users') {
        const nextLabel = readSavedLocationLabelFromUserDoc(data);
        setLabel((prev) => (prev === nextLabel ? prev : nextLabel));
      }
    },
    [collection],
  );

  const refreshFromServer = useCallback(async () => {
    if (!accountId) {
      setSaved(null);
      setLabel(null);
      return;
    }
    setLoading(true);
    try {
      const result = await fetchSavedLocationFromServer(collection, accountId);
      setSaved((prev) =>
        savedLocationsEqual(prev, result.location) ? prev : result.location,
      );
      if (collection === 'users') {
        setLabel((prev) => (prev === result.label ? prev : result.label));
      }
    } catch {
      setSaved(null);
      if (collection === 'users') setLabel(null);
    } finally {
      setLoading(false);
    }
  }, [accountId, collection]);

  const clearSaved = useCallback(() => {
    setSaved(null);
    setLabel(null);
  }, []);

  useEffect(() => {
    if (!accountId) {
      setSaved(null);
      setLabel(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    void (async () => {
      try {
        const result = await fetchSavedLocationFromServer(collection, accountId);
        if (cancelled) return;
        setSaved((prev) =>
          savedLocationsEqual(prev, result.location) ? prev : result.location,
        );
        if (collection === 'users') {
          setLabel((prev) => (prev === result.label ? prev : result.label));
        }
      } catch {
        if (!cancelled) {
          setSaved(null);
          if (collection === 'users') setLabel(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const ref = doc(db, collection, accountId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (skipCacheSnapshots && snap.metadata.fromCache) {
          return;
        }
        const data = snap.exists() ? (snap.data() as Record<string, unknown>) : undefined;
        applyDocData(data);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [accountId, collection, applyDocData, skipCacheSnapshots]);

  const persist = useCallback(
    async (location: SavedLocation, persistOptions?: SaveAccountLocationOptions) => {
      if (!accountId) throw new Error('Sign in to save your location.');
      setSaving(true);
      setError(null);
      try {
        const payload = await saveAccountSavedLocation(
          collection,
          accountId,
          location,
          persistOptions,
        );
        setSaved((prev) => (savedLocationsEqual(prev, payload) ? prev : payload));
        if (collection === 'users' && persistOptions?.label) {
          const nextLabel = persistOptions.label;
          setLabel((prev) => (prev === nextLabel ? prev : nextLabel));
        }
        return payload;
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : 'Could not save your location. Please try again.';
        setError(msg);
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [accountId, collection],
  );

  return {
    saved,
    label,
    loading,
    saving,
    error,
    setError,
    persist,
    refreshFromServer,
    clearSaved,
  };
}
