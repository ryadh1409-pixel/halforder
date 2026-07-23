import { LocationScreenMap } from '@/components/location/LocationScreenMap';
import { ProfileLocationPicker } from '@/components/profile/ProfileLocationPicker';
import { useAccountSavedLocation } from '@/hooks/useAccountSavedLocation';
import { goBackFromProfileScreen } from '@/lib/profileBack';
import { useAuth } from '@/services/AuthContext';
import { isRegisteredAuthUser } from '@/lib/authSession';
import {
  resolveAddressFromGps,
  savedLocationFromGpsResolve,
} from '@/services/location/resolveAddressFromGps';
import { saveAccountSavedLocation } from '@/services/location/savedLocationFirestore';
import {
  captureAndSaveCurrentProfileLocation,
  formatProfileLocationLabel,
  subscribeUserProfileLocation,
  type ProfileLocationFields,
} from '@/services/signupProfileLocation';
import { showError, showSuccess } from '@/utils/toast';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

const PAL = {
  bg: '#000000',
  surface: '#171923',
  surfaceMuted: '#1C1F2E',
  text: '#FFFFFF',
  textSecondary: '#B7BDC9',
  textTertiary: '#8B93A7',
  border: 'rgba(168, 85, 247, 0.22)',
  inputBg: '#1C2030',
  chipBg: 'rgba(168,85,247,0.10)',
  primary: '#A855F7',
  onPrimary: '#FFFFFF',
  danger: '#EF4444',
  success: '#22C55E',
} as const;

/** Dedicated Location screen — same controls previously on Profile. */
export default function LocationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const registered = isRegisteredAuthUser(user);
  const uid = registered ? (user?.uid ?? null) : null;

  const [profileLocation, setProfileLocation] =
    useState<ProfileLocationFields | null>(null);
  const [changingLocation, setChangingLocation] = useState(false);

  const { saved: deliveryLocation } = useAccountSavedLocation('users', uid, {
    skipCacheSnapshots: true,
  });

  const locationPalette = useMemo(
    () => ({
      surface: PAL.surface,
      surfaceMuted: PAL.surfaceMuted,
      text: PAL.text,
      textSecondary: PAL.textSecondary,
      textTertiary: PAL.textTertiary,
      border: PAL.border,
      inputBg: PAL.inputBg,
      chipBg: PAL.chipBg,
      primary: PAL.primary,
      onPrimary: PAL.onPrimary,
      danger: PAL.danger,
      success: PAL.success,
    }),
    [],
  );

  const mapPin = useMemo(() => {
    if (
      deliveryLocation &&
      Number.isFinite(deliveryLocation.latitude) &&
      Number.isFinite(deliveryLocation.longitude)
    ) {
      return {
        latitude: deliveryLocation.latitude,
        longitude: deliveryLocation.longitude,
        label:
          deliveryLocation.address?.trim() ||
          formatProfileLocationLabel(profileLocation),
      };
    }
    if (
      profileLocation &&
      Number.isFinite(profileLocation.latitude) &&
      Number.isFinite(profileLocation.longitude)
    ) {
      return {
        latitude: profileLocation.latitude,
        longitude: profileLocation.longitude,
        label: formatProfileLocationLabel(profileLocation),
      };
    }
    return null;
  }, [deliveryLocation, profileLocation]);

  useEffect(() => {
    if (!uid) {
      setProfileLocation(null);
      return undefined;
    }
    return subscribeUserProfileLocation(uid, setProfileLocation);
  }, [uid]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => goBackFromProfileScreen(router)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <MaterialIcons name="arrow-back" size={24} color={PAL.text} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Location</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: Math.max(insets.bottom + 40, 56) },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!uid ? (
          <View style={styles.card}>
            <Text style={styles.bodyMuted}>
              Sign in to manage your location settings.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionHeading}>Location</Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                📍{' '}
                {deliveryLocation?.address?.trim() ||
                  formatProfileLocationLabel(profileLocation)}
              </Text>
              <TouchableOpacity
                style={[styles.primaryButton, { marginTop: 12 }]}
                onPress={() => {
                  if (!uid || changingLocation) return;
                  setChangingLocation(true);
                  void (async () => {
                    try {
                      const fields =
                        await captureAndSaveCurrentProfileLocation(uid);
                      const resolved = await resolveAddressFromGps(
                        fields.latitude,
                        fields.longitude,
                      );
                      const delivery = savedLocationFromGpsResolve(
                        fields.latitude,
                        fields.longitude,
                        resolved,
                      );
                      if (delivery) {
                        await saveAccountSavedLocation(
                          'users',
                          uid,
                          delivery,
                          { role: 'user' },
                        );
                      }
                      showSuccess('Location updated.');
                    } catch (e) {
                      showError(
                        e instanceof Error
                          ? e.message
                          : 'Could not update location.',
                      );
                    } finally {
                      setChangingLocation(false);
                    }
                  })();
                }}
                disabled={changingLocation}
                activeOpacity={0.85}
              >
                {changingLocation ? (
                  <ActivityIndicator color={PAL.onPrimary} />
                ) : (
                  <Text style={styles.primaryButtonText}>Change Location</Text>
                )}
              </TouchableOpacity>
            </View>

            {mapPin ? (
              <>
                <Text style={styles.sectionHeading}>Map</Text>
                <LocationScreenMap
                  latitude={mapPin.latitude}
                  longitude={mapPin.longitude}
                />
                <Text style={styles.mapCaption} numberOfLines={2}>
                  {mapPin.label}
                </Text>
              </>
            ) : null}

            <Text style={styles.sectionHeading}>Delivery location</Text>
            <ProfileLocationPicker userId={uid} palette={locationPalette} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAL.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    color: PAL.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: PAL.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 16,
  },
  card: {
    backgroundColor: PAL.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PAL.border,
    padding: 20,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: PAL.text,
    marginBottom: 4,
  },
  bodyMuted: {
    fontSize: 14,
    color: PAL.textSecondary,
    lineHeight: 20,
  },
  mapCaption: {
    fontSize: 13,
    color: PAL.textSecondary,
    marginTop: -4,
    marginBottom: 4,
    lineHeight: 18,
  },
  primaryButton: {
    backgroundColor: PAL.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryButtonText: {
    color: PAL.onPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
});
