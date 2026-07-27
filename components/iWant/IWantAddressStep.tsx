import { AccountLocationPicker } from '@/components/location/AccountLocationPicker';
import { LOCATION_PALETTE_DARK } from '@/components/location/locationPalette';
import {
  IWantConfirmMap,
  type IWantMapCoords,
} from '@/components/iWant/IWantConfirmMap';
import { getCurrentGpsReading } from '@/services/location/gps';
import { reverseGeocodeCoordinates } from '@/services/places/googlePlacesClient';
import { saveAccountSavedLocation } from '@/services/location/savedLocationFirestore';
import {
  EMO_AI_PURPLE,
  EMO_AI_PURPLE_SOFT,
  EMO_AI_SURFACE,
} from '@/types/emoAi';
import type { IWantAddressDraft } from '@/types/iWant';
import type { SavedLocation } from '@/types/savedLocation';
import { showError, showSuccess } from '@/utils/toast';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const LOCATION_PALETTE = {
  ...LOCATION_PALETTE_DARK,
  primary: EMO_AI_PURPLE,
};

type Props = {
  uid: string | null;
  saved: SavedLocation | null;
  fallbackCoords: IWantMapCoords | null;
  onConfirmed: (address: IWantAddressDraft) => void;
};

type PendingLocation = {
  latitude: number;
  longitude: number;
  address: string;
  placeId?: string;
  city?: string;
  province?: string;
  country?: string;
  postalCode?: string;
};

function coordsClose(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
  epsilon = 0.00008,
): boolean {
  return (
    Math.abs(a.latitude - b.latitude) < epsilon &&
    Math.abs(a.longitude - b.longitude) < epsilon
  );
}

export function IWantAddressStep({
  uid,
  saved,
  fallbackCoords,
  onConfirmed,
}: Props) {
  const [cameraTarget, setCameraTarget] = useState<IWantMapCoords | null>(null);
  const [pending, setPending] = useState<PendingLocation | null>(null);
  const [dirty, setDirty] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mapDragging, setMapDragging] = useState(false);
  const geocodeSeq = useRef(0);

  const seed = useMemo((): IWantMapCoords | null => {
    if (
      saved &&
      Number.isFinite(saved.latitude) &&
      Number.isFinite(saved.longitude)
    ) {
      return { latitude: saved.latitude, longitude: saved.longitude };
    }
    if (
      fallbackCoords &&
      Number.isFinite(fallbackCoords.latitude) &&
      Number.isFinite(fallbackCoords.longitude)
    ) {
      return fallbackCoords;
    }
    return null;
  }, [fallbackCoords, saved]);

  useEffect(() => {
    if (!seed) return;
    setCameraTarget(seed);
    if (saved?.address?.trim()) {
      setPending({
        latitude: saved.latitude,
        longitude: saved.longitude,
        address: saved.address.trim(),
        placeId: saved.placeId,
        city: saved.city,
        province: saved.province,
        country: saved.country,
        postalCode: saved.postalCode,
      });
      setDirty(false);
    }
  }, [seed, saved]);

  const resolvePending = useCallback(async (coords: IWantMapCoords) => {
    const seq = ++geocodeSeq.current;
    setGeocoding(true);
    try {
      const geo = await reverseGeocodeCoordinates(
        coords.latitude,
        coords.longitude,
      );
      if (seq !== geocodeSeq.current) return;
      setPending({
        latitude: coords.latitude,
        longitude: coords.longitude,
        address: geo.address,
        placeId: geo.placeId,
        city: geo.city,
        province: geo.province,
        country: geo.country,
        postalCode: geo.postalCode,
      });
    } catch {
      if (seq !== geocodeSeq.current) return;
      setPending({
        latitude: coords.latitude,
        longitude: coords.longitude,
        address: `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`,
      });
    } finally {
      if (seq === geocodeSeq.current) setGeocoding(false);
    }
  }, []);

  const handleRegionSettled = useCallback(
    (coords: IWantMapCoords) => {
      setDirty(true);
      void resolvePending(coords);
    },
    [resolvePending],
  );

  const handleCurrentLocation = useCallback(async () => {
    setLocating(true);
    try {
      const reading = await getCurrentGpsReading({ highAccuracy: true });
      const coords = {
        latitude: reading.latitude,
        longitude: reading.longitude,
      };
      setDirty(true);
      setCameraTarget(coords);
      await resolvePending(coords);
    } catch (e) {
      showError(
        e instanceof Error ? e.message : 'Could not read your current location.',
      );
    } finally {
      setLocating(false);
    }
  }, [resolvePending]);

  const handleConfirm = useCallback(async () => {
    if (!uid) {
      showError('Sign in to confirm your delivery location.');
      return;
    }
    if (!pending?.address?.trim()) {
      showError('Move the map or search for an address first.');
      return;
    }

    const draft: IWantAddressDraft = {
      address: pending.address.trim(),
      lat: pending.latitude,
      lng: pending.longitude,
    };

    const alreadySaved =
      saved &&
      !dirty &&
      coordsClose(saved, pending) &&
      saved.address.trim() === pending.address.trim();

    if (alreadySaved) {
      onConfirmed(draft);
      return;
    }

    setSaving(true);
    try {
      await saveAccountSavedLocation(
        'users',
        uid,
        {
          address: pending.address.trim(),
          formattedAddress: pending.address.trim(),
          latitude: pending.latitude,
          longitude: pending.longitude,
          ...(pending.placeId ? { placeId: pending.placeId } : {}),
          ...(pending.city ? { city: pending.city } : {}),
          ...(pending.province ? { province: pending.province } : {}),
          ...(pending.country ? { country: pending.country } : {}),
          ...(pending.postalCode ? { postalCode: pending.postalCode } : {}),
        },
        { role: 'user' },
      );
      setDirty(false);
      showSuccess('Location confirmed');
      onConfirmed(draft);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Could not save location.');
    } finally {
      setSaving(false);
    }
  }, [dirty, onConfirmed, pending, saved, uid]);

  const displayAddress =
    pending?.address?.trim() ||
    saved?.address?.trim() ||
    'Drag the map to set your delivery point';

  return (
    <ScrollView
      contentContainerStyle={styles.scrollBody}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
      scrollEnabled={!mapDragging}
    >
      <Text style={styles.title}>Delivery address</Text>
      <Text style={styles.subtitle}>
        Confirm where Emo should deliver your order.
      </Text>

      <View style={styles.addressCard}>
        <View style={styles.addressIcon}>
          <Ionicons name="navigate" size={18} color={EMO_AI_PURPLE} />
        </View>
        <View style={styles.addressCopy}>
          <Text style={styles.addressLabel}>Selected address</Text>
          <Text style={styles.addressTxt}>{displayAddress}</Text>
          {geocoding ? (
            <Text style={styles.geocodeHint}>Updating address…</Text>
          ) : null}
        </View>
      </View>

      {cameraTarget ? (
        <IWantConfirmMap
          latitude={cameraTarget.latitude}
          longitude={cameraTarget.longitude}
          locating={locating}
          onRegionSettled={handleRegionSettled}
          onPressCurrentLocation={() => void handleCurrentLocation()}
          onDragStateChange={setMapDragging}
        />
      ) : (
        <View style={styles.mapPlaceholder}>
          <Ionicons name="map-outline" size={28} color="#64748B" />
          <Text style={styles.placeholderTxt}>
            Search an address or use your current location to place the pin.
          </Text>
          <Pressable
            style={styles.locateInline}
            onPress={() => void handleCurrentLocation()}
          >
            {locating ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="locate" size={16} color="#FFF" />
                <Text style={styles.locateInlineTxt}>Use current location</Text>
              </>
            )}
          </Pressable>
        </View>
      )}

      <View style={styles.confirmBlock}>
        <Text style={styles.confirmTitle}>Confirm your location</Text>
        <Text style={styles.confirmHint}>
          Drag the map if needed to adjust the exact delivery point.
        </Text>
        <Pressable
          style={[
            styles.confirmBtn,
            (saving || !pending?.address) && styles.btnDisabled,
          ]}
          disabled={saving || !pending?.address}
          onPress={() => void handleConfirm()}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={18} color="#FFF" />
              <Text style={styles.confirmBtnTxt}>Confirm Location</Text>
            </>
          )}
        </Pressable>
      </View>

      <Pressable
        style={styles.searchToggle}
        onPress={() => setSearchOpen((v) => !v)}
      >
        <Ionicons name="search" size={16} color="#C084FC" />
        <Text style={styles.searchToggleTxt}>
          {searchOpen ? 'Hide address search' : 'Search a different address'}
        </Text>
      </Pressable>

      {searchOpen ? (
        <View style={styles.searchPanel}>
          <AccountLocationPicker
            role="user"
            accountId={uid}
            palette={LOCATION_PALETTE}
            title="Search address"
            hint="Same address system as checkout — select to update the pin."
            saveSuccessMessage="Address updated"
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollBody: {
    paddingBottom: 24,
    gap: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#B7BDC9',
    marginBottom: 14,
    lineHeight: 20,
  },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: EMO_AI_SURFACE,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.28)',
    marginBottom: 14,
  },
  addressIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: EMO_AI_PURPLE_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressCopy: { flex: 1, minWidth: 0 },
  addressLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#A78BFA',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  addressTxt: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
    lineHeight: 21,
  },
  geocodeHint: {
    marginTop: 6,
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  mapPlaceholder: {
    height: 280,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: EMO_AI_SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },
  placeholderTxt: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 19,
  },
  locateInline: {
    marginTop: 4,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: EMO_AI_PURPLE,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locateInlineTxt: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  confirmBlock: {
    marginTop: 18,
    gap: 6,
  },
  confirmTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  confirmHint: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    lineHeight: 19,
    marginBottom: 8,
  },
  confirmBtn: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: EMO_AI_PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  confirmBtnTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  btnDisabled: { opacity: 0.55 },
  searchToggle: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  searchToggleTxt: {
    color: '#C084FC',
    fontSize: 13,
    fontWeight: '800',
  },
  searchPanel: {
    marginTop: 4,
  },
});
