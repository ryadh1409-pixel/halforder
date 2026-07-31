import { AssignDriverModal } from '@/components/AssignDriverModal';
import {
    RestaurantOrdersPanel,
    type RestaurantDashboardMetrics,
} from '@/components/restaurant/RestaurantOrdersPanel';
import { RestaurantPayoutMethods } from '@/components/restaurant/RestaurantPayoutMethods';
import { WorkspaceSwitcher } from '@/components/workspace/WorkspaceSwitcher';
import { useActiveWorkspace } from '@/hooks/useActiveWorkspace';
import { useDrivers } from '@/hooks/useDrivers';
import { logoutAndResetSession, POST_LOGOUT_ROUTE } from '@/lib/auth/logoutSession';
import {
    displayFromStoredProfilePhone,
    formatProfileWhatsAppDisplay,
    isCompleteNaProfilePhone,
    isProfilePhoneStorageEmpty,
    profilePhoneForFirestore,
    profileWhatsAppOnChangeText,
} from '@/lib/profileWhatsAppPhone';
import {
    formatRestaurantPhoneDisplay,
    resolveRestaurantDisplayName,
    resolveRestaurantLogoUrl,
    resolveRestaurantProfilePhone,
} from '@/lib/restaurantDashboardProfile';
import {
    isRestaurantIsOpenMatching,
    logVenueStatusError,
    parseRestaurantIsOpen,
} from '@/lib/restaurantVenueStatus';
import { runRootNavigationTask } from '@/lib/router/rootNavigation';
import { useAuth } from '@/services/AuthContext';
import { assignDriverToOrder } from '@/services/driverService';
import { showUserError } from '@/services/errors';
import { auth, db } from '@/services/firebase';
import {
    mergeHostRestaurantProfile,
    saveRestaurantVenueMain,
} from '@/services/hostRestaurant';
import {
    pickMenuImageFromLibrary,
    uploadRestaurantLogo,
} from '@/services/menuImageService';
import { updateRestaurantOpen } from '@/services/restaurantDashboard';
import { readRestaurantInteracEmail } from '@/services/restaurantPayoutMethods';
import { startOnboarding } from '@/services/stripeConnect';
import { requireRole } from '@/utils/requireRole';
import { stripeConnectErrorMessage } from '@/utils/stripeConnectErrors';
import { showError, showSuccess } from '@/utils/toast';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppTextInput } from '../components/AppTextInput';
type RestaurantState = {
  id: string;
  ownerId: string;
  name: string;
  logoUrl: string | null;
  location: string;
  isOpen: boolean;
  timezone: string | null;
  phoneNumber: string | null;
  phone: string | null;
  interacEmail: string;
};

const PRIMARY = '#16a34a';
const PAGE = '#FFFFFF';
const CARD = '#ffffff';
const AVATAR_SIZE = 90;

/** Restaurant dashboard — sole host screen for live marketplace orders. */
export default function HostDashboardScreen() {
  const router = useRouter();
  const { user, loading: authLoading, signOutUser } = useAuth();
  const {
    ready: workspaceReady,
    activeWorkspace,
    availableWorkspaces,
    switchWorkspace,
  } = useActiveWorkspace();
  const currentWorkspace = activeWorkspace ?? 'restaurant';
  const { authorized, loading: roleLoading } = requireRole(['restaurant', 'host']);
  const uid = user?.uid ?? '';

  const [restaurant, setRestaurant] = useState<RestaurantState | null>(null);
  const [restaurantLoading, setRestaurantLoading] = useState(true);
  const [nameDraft, setNameDraft] = useState('');
  const [phoneDraft, setPhoneDraft] = useState('');
  const [locationDraft, setLocationDraft] = useState('');
  const [pendingLogoUrl, setPendingLogoUrl] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [locating, setLocating] = useState(false);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [userDocData, setUserDocData] = useState<Record<string, unknown> | null>(null);
  const [stripeLoading, setStripeLoading] = useState(false);

  const [dashboardMetrics, setDashboardMetrics] = useState<RestaurantDashboardMetrics>({
    ordersToday: 0,
    revenue: 0,
  });
  const [ordersRefreshing, setOrdersRefreshing] = useState(false);
  const pendingIsOpenRef = useRef<boolean | null>(null);
  /** Prevent live snapshots from wiping in-progress edits. */
  const profileHydratedRef = useRef(false);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [assignDriverModalOpen, setAssignDriverModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const { drivers, loading: driversLoading } = useDrivers();

  const isVenueOpen = restaurant?.isOpen ?? true;

  const openAssignDriverModal = useCallback((orderId: string) => {
    setSelectedOrderId(orderId);
    setAssignDriverModalOpen(true);
  }, []);

  const handleAssignDriver = useCallback(
    async (driver: (typeof drivers)[number]) => {
      if (!selectedOrderId) return;
      try {
        await assignDriverToOrder(
          selectedOrderId,
          {
            id: driver.id,
            name: driver.name,
            phone: driver.phone,
            isOnline: driver.isOnline,
          },
          'ready_for_pickup',
        );
        showSuccess('Driver assigned');
        setAssignDriverModalOpen(false);
        setSelectedOrderId(null);
      } catch (error) {
        console.log('[HostDashboard] failed to assign driver', error);
        showError('Could not assign driver.');
      }
    },
    [drivers, selectedOrderId],
  );

  useEffect(() => {
    profileHydratedRef.current = false;
    setPendingLogoUrl(null);
    if (!uid) {
      setRestaurant(null);
      setNameDraft('');
      setPhoneDraft('');
      setLocationDraft('');
      setDashboardMetrics({ ordersToday: 0, revenue: 0 });
      setRestaurantLoading(false);
      return;
    }
    setRestaurantLoading(true);
    const unsub = onSnapshot(
      doc(db, 'restaurants', uid),
      (snap) => {
        if (!snap.exists()) {
          setRestaurant(null);
          if (!profileHydratedRef.current) {
            setNameDraft('');
            setPhoneDraft('+1 ');
            setLocationDraft('');
            profileHydratedRef.current = true;
          }
          setRestaurantLoading(false);
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        const rawIsOpen = data.isOpen;
        const fromServer = parseRestaurantIsOpen(data);
        const pending = pendingIsOpenRef.current;

        if (pending !== null && isRestaurantIsOpenMatching(rawIsOpen, pending)) {
          pendingIsOpenRef.current = null;
        }

        const resolvedIsOpen =
          pendingIsOpenRef.current !== null ? pendingIsOpenRef.current : fromServer;

        const row: RestaurantState = {
          id: uid,
          ownerId:
            typeof data.ownerId === 'string' && data.ownerId.trim()
              ? data.ownerId.trim()
              : uid,
          name: resolveRestaurantDisplayName(data),
          logoUrl: resolveRestaurantLogoUrl(data),
          location: typeof data.location === 'string' ? data.location : '',
          isOpen: resolvedIsOpen,
          phoneNumber:
            typeof data.phoneNumber === 'string' && data.phoneNumber.trim()
              ? data.phoneNumber.trim()
              : null,
          phone:
            typeof data.phone === 'string' && data.phone.trim()
              ? data.phone.trim()
              : null,
          timezone:
            typeof data.timezone === 'string' && data.timezone.trim()
              ? data.timezone.trim()
              : typeof data.timeZone === 'string' && data.timeZone.trim()
                ? data.timeZone.trim()
                : null,
          interacEmail: readRestaurantInteracEmail(data),
        };
        setRestaurant(row);
        // Hydrate editable drafts once so live snapshots cannot wipe typing.
        if (!profileHydratedRef.current) {
          setNameDraft(row.name);
          setPhoneDraft(
            displayFromStoredProfilePhone(row.phoneNumber ?? row.phone),
          );
          setLocationDraft(row.location);
          profileHydratedRef.current = true;
        }
        setRestaurantLoading(false);
      },
      (error) => {
        logVenueStatusError('snapshot-error', {
          uid,
          path: `restaurants/${uid}`,
          error: error instanceof Error ? error.message : String(error),
        });
        setRestaurantLoading(false);
      },
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setStripeAccountId(null);
      return;
    }
    const userRef = doc(db, 'users', uid);
    const unsub = onSnapshot(
      userRef,
      (snap) => {
        if (!snap.exists()) {
          setStripeAccountId(null);
          setUserDocData(null);
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        setUserDocData(data);
        const v = data.stripeAccountId;
        setStripeAccountId(
          typeof v === 'string' && v.startsWith('acct_') ? v : null,
        );
      },
      () => {
        setStripeAccountId(null);
        setUserDocData(null);
      },
    );
    return () => unsub();
  }, [uid]);

  const handleConnectStripe = useCallback(async () => {
    if (!uid) return;
    setStripeLoading(true);
    try {
      const { url } = await startOnboarding(uid);
      if (url) {
        await Linking.openURL(url);
      }
      showSuccess('Continue in Stripe, then return here.');
    } catch (e) {
      console.log('[host-dashboard] Connect Stripe', e);
      showError(stripeConnectErrorMessage(e));
    } finally {
      setStripeLoading(false);
    }
  }, [uid]);

  const saveProfileFields = useCallback(async () => {
    if (!uid) return;
    const name = nameDraft.trim();
    if (!name) {
      showError('Enter your restaurant or truck name.');
      return;
    }
    const phoneTreatEmpty = isProfilePhoneStorageEmpty(phoneDraft);
    if (!phoneTreatEmpty && !isCompleteNaProfilePhone(phoneDraft)) {
      showError('Enter a complete phone number (10 digits after +1).');
      return;
    }
    const phoneForStore = phoneTreatEmpty
      ? null
      : formatProfileWhatsAppDisplay(profilePhoneForFirestore(phoneDraft));
    setSavingProfile(true);
    try {
      const logoUrl =
        (typeof pendingLogoUrl === 'string' && pendingLogoUrl.trim()
          ? pendingLogoUrl.trim()
          : null) ??
        (typeof restaurant?.logoUrl === 'string' && restaurant.logoUrl.trim()
          ? restaurant.logoUrl.trim()
          : null);
      await saveRestaurantVenueMain({
        uid,
        name,
        phoneNumber: phoneForStore,
        location: locationDraft.trim(),
        logoUrl,
      });
      setPendingLogoUrl(null);
      setNameDraft(name);
      setPhoneDraft(
        phoneForStore ? displayFromStoredProfilePhone(phoneForStore) : '+1 ',
      );
      profileHydratedRef.current = true;
      showSuccess('Restaurant profile saved');
    } catch (e) {
      showUserError(e, { role: 'restaurant', context: 'restaurant' });
    } finally {
      setSavingProfile(false);
    }
  }, [uid, nameDraft, phoneDraft, locationDraft, pendingLogoUrl, restaurant?.logoUrl]);

  const profilePhoneDisplay = useMemo(() => {
    const authPhoneNumber = auth.currentUser?.phoneNumber ?? user?.phoneNumber ?? null;
    const resolvedPhone = resolveRestaurantProfilePhone({
      restaurantData: restaurant
        ? { phoneNumber: restaurant.phoneNumber, phone: restaurant.phone }
        : null,
      authPhoneNumber,
    });
    return formatRestaurantPhoneDisplay(resolvedPhone);
  }, [restaurant, user?.phoneNumber]);

  const savedPhoneNormalized = useMemo(() => {
    const raw = restaurant?.phoneNumber ?? restaurant?.phone ?? null;
    if (!raw) return '';
    return profilePhoneForFirestore(raw);
  }, [restaurant?.phoneNumber, restaurant?.phone]);

  const profileDirty = useMemo(() => {
    const savedName = (restaurant?.name ?? '').trim();
    const nameChanged = nameDraft.trim() !== savedName;
    const phoneChanged =
      profilePhoneForFirestore(phoneDraft) !== savedPhoneNormalized &&
      !(isProfilePhoneStorageEmpty(phoneDraft) && savedPhoneNormalized === '');
    const locationChanged =
      locationDraft.trim() !== (restaurant?.location ?? '').trim();
    const logoChanged = Boolean(pendingLogoUrl);
    return nameChanged || phoneChanged || locationChanged || logoChanged;
  }, [
    nameDraft,
    phoneDraft,
    locationDraft,
    pendingLogoUrl,
    restaurant?.name,
    restaurant?.location,
    savedPhoneNormalized,
  ]);

  const displayLogoUrl = pendingLogoUrl ?? restaurant?.logoUrl;

  const onPickLogo = async () => {
    if (!uid || uploadingLogo) return;
    setUploadingLogo(true);
    try {
      const picked = await pickMenuImageFromLibrary(0.88);
      if ('cancelled' in picked) return;
      const url = await uploadRestaurantLogo({
        restaurantId: uid,
        localUri: picked.localUri,
      });
      setPendingLogoUrl(url);
      showSuccess('Photo ready — tap Save to update your profile.');
    } catch (e) {
      showUserError(e, { role: 'restaurant', context: 'upload' });
    } finally {
      setUploadingLogo(false);
    }
  };

  const onUseCurrentLocation = async () => {
    if (!uid) return;
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showError('Allow location to set your address.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = pos.coords;
      const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
      const p = geo[0];
      const line = [
        [p.streetNumber, p.street].filter(Boolean).join(' '),
        p.city,
        p.region,
        p.postalCode,
      ]
        .filter(Boolean)
        .join(', ');
      setLocationDraft(line);
      await mergeHostRestaurantProfile(uid, {
        location: line,
        locationLat: latitude,
        locationLng: longitude,
      });
      showSuccess('Location updated from device.');
    } catch (e) {
      showUserError(e, { role: 'restaurant', context: 'default' });
    } finally {
      setLocating(false);
    }
  };

  const handleExit = useCallback(async () => {
    if (loggingOut || toggleBusy) return;

    setLoggingOut(true);
    pendingIsOpenRef.current = null;

    try {
      await logoutAndResetSession(signOutUser);
      runRootNavigationTask(() => {
        router.replace(POST_LOGOUT_ROUTE as never);
      });
    } catch (e) {
      showUserError(e, { context: 'default' });
    } finally {
      setLoggingOut(false);
    }
  }, [loggingOut, signOutUser, toggleBusy, router]);

  const onToggleOpen = async (next: boolean) => {
    if (!uid || !restaurant || toggleBusy) return;

    const previous = restaurant.isOpen;
    pendingIsOpenRef.current = next;
    setToggleBusy(true);
    setRestaurant((prev) => (prev ? { ...prev, isOpen: next } : prev));

    try {
      await updateRestaurantOpen(uid, next);
      showSuccess(next ? 'Restaurant is now open.' : 'Restaurant is now closed.');
    } catch (e) {
      pendingIsOpenRef.current = null;
      setRestaurant((prev) => (prev ? { ...prev, isOpen: previous } : prev));
      showUserError(e, { role: 'restaurant', context: 'restaurant' });
    } finally {
      setToggleBusy(false);
    }
  };

  const stats = useMemo(
    () => ({
      ordersToday: dashboardMetrics.ordersToday,
      revenueToday: dashboardMetrics.revenue,
    }),
    [dashboardMetrics],
  );

  if (authLoading || roleLoading) {
    return (
      <SafeAreaView style={styles.center} edges={['top', 'bottom']}>
        <ActivityIndicator size="large" color={PRIMARY} />
        <Text style={styles.muted}>Loading…</Text>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.center} edges={['top', 'bottom']}>
        <Text style={styles.screenTitle}>Sign in required</Text>
        <TouchableOpacity onPress={() => router.push('/(auth)/login' as never)} hitSlop={12}>
          <Text style={styles.topLink}>Go to sign in</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!authorized) {
    return (
      <SafeAreaView style={styles.center} edges={['top', 'bottom']}>
        <Text style={styles.muted}>This dashboard is only available for restaurant or host accounts.</Text>
      </SafeAreaView>
    );
  }

  if (!restaurantLoading && restaurant) {
    const authPhoneNumber = auth.currentUser?.phoneNumber ?? user?.phoneNumber ?? null;
    console.log('[RESTAURANT PROFILE DEBUG]', {
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      restaurantPhoneNumber: restaurant.phoneNumber,
      restaurantPhone: restaurant.phone,
      ownerId: restaurant.ownerId,
      authUid: auth.currentUser?.uid ?? user?.uid ?? null,
      authPhoneNumber,
      displayPhone: phoneDraft.trim() || profilePhoneDisplay,
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          style={styles.flex}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={ordersRefreshing}
              onRefresh={() => {
                setOrdersRefreshing(true);
                setTimeout(() => setOrdersRefreshing(false), 500);
              }}
            />
          }
        >
          <View style={styles.topBar}>
            <View style={styles.headerMain}>
              <Text style={styles.screenTitle}>Restaurant Dashboard</Text>
              <View style={styles.onlineRow}>
                <Text style={styles.onlineLabel}>{isVenueOpen ? 'Online' : 'Offline'}</Text>
                <Switch
                  value={isVenueOpen}
                  disabled={toggleBusy || restaurantLoading}
                  onValueChange={(v) => void onToggleOpen(v)}
                  trackColor={{
                    false: '#cbd5e1',
                    true: 'rgba(22,163,74,0.35)',
                  }}
                  thumbColor={isVenueOpen ? PRIMARY : '#f1f5f9'}
                />
              </View>
            </View>
            <TouchableOpacity
              onPress={() => void handleExit()}
              disabled={loggingOut || toggleBusy}
              hitSlop={12}
              accessibilityLabel="Sign out"
            >
              {loggingOut ? (
                <ActivityIndicator size="small" color={PRIMARY} />
              ) : (
                <Text style={styles.topLink}>Exit</Text>
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.profileHeader}>
            <Pressable
              style={styles.profileAvatarButton}
              onPress={() => void onPickLogo()}
              disabled={uploadingLogo}
              accessibilityRole="button"
              accessibilityLabel="Change restaurant logo"
            >
              {uploadingLogo ? (
                <View style={styles.profileAvatarPlaceholder}>
                  <ActivityIndicator color={PRIMARY} />
                </View>
              ) : displayLogoUrl ? (
                <Image source={{ uri: displayLogoUrl }} style={styles.profileAvatarImage} />
              ) : (
                <View style={styles.profileAvatarPlaceholder}>
                  <Ionicons name="storefront-outline" size={40} color="#7D8493" />
                </View>
              )}
            </Pressable>

            <View style={styles.profileFields}>
              <Text style={styles.profileFieldLabel}>Restaurant Name</Text>
              <AppTextInput
                style={styles.profileInput}
                value={nameDraft}
                onChangeText={setNameDraft}
                placeholder="Restaurant"
                placeholderTextColor="#7D8493"
                autoCapitalize="words"
                editable={!savingProfile && !restaurantLoading}
              />

              <Text style={styles.profileFieldLabel}>Phone Number</Text>
              <AppTextInput
                style={styles.profileInput}
                value={phoneDraft}
                onChangeText={(text) => setPhoneDraft(profileWhatsAppOnChangeText(text))}
                placeholder="+1 (613) 123-4567"
                placeholderTextColor="#7D8493"
                keyboardType="phone-pad"
                editable={!savingProfile && !restaurantLoading}
              />

              {profileDirty ? (
                <TouchableOpacity
                  style={[styles.primaryBtn, styles.saveVenueBtn]}
                  onPress={() => void saveProfileFields()}
                  disabled={savingProfile}
                >
                  {savingProfile ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Save</Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statTile}>
              <Ionicons name="calendar-outline" size={20} color={PRIMARY} />
              <Text style={styles.statValue}>{stats.ordersToday}</Text>
              <Text style={styles.statLabel}>Orders (24h)</Text>
            </View>
            <View style={styles.statTile}>
              <Ionicons name="cash-outline" size={20} color={PRIMARY} />
              <Text style={styles.statValue}>${stats.revenueToday.toFixed(0)}</Text>
              <Text style={styles.statLabel}>Revenue</Text>
            </View>
          </View>

          {uid ? (
            <RestaurantOrdersPanel
              restaurantId={uid}
              restaurantTimeZone={restaurant?.timezone}
              title="Live orders"
              onAssignDriver={openAssignDriverModal}
              onDashboardMetrics={setDashboardMetrics}
            />
          ) : null}

          {workspaceReady ? (
            <WorkspaceSwitcher
              availableWorkspaces={availableWorkspaces}
              activeWorkspace={currentWorkspace}
              onSwitch={switchWorkspace}
              variant="restaurant"
            />
          ) : null}

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Venue info</Text>
            {restaurantLoading ? (
              <ActivityIndicator color={PRIMARY} />
            ) : (
              <>
                <Text style={styles.inputLabel}>Location</Text>
                <AppTextInput
                  style={[styles.input, styles.inputMulti]}
                  value={locationDraft}
                  onChangeText={setLocationDraft}
                  placeholder="Address or service area"
                  placeholderTextColor="#7D8493"
                  multiline
                />
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={onUseCurrentLocation}
                  disabled={locating}
                >
                  {locating ? (
                    <ActivityIndicator color={PRIMARY} />
                  ) : (
                    <Text style={styles.secondaryBtnText}>Use current location</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    styles.saveVenueBtn,
                    (!profileDirty || savingProfile) && styles.saveVenueBtnDisabled,
                  ]}
                  onPress={() => void saveProfileFields()}
                  disabled={!profileDirty || savingProfile}
                >
                  {savingProfile ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Save venue</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>

          <RestaurantPayoutMethods
            restaurantId={uid}
            interacEmail={restaurant?.interacEmail ?? ''}
            stripeConnected={Boolean(stripeAccountId)}
            stripeLoading={stripeLoading}
            onConnectStripe={() => void handleConnectStripe()}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <AssignDriverModal
        visible={assignDriverModalOpen}
        drivers={drivers}
        loading={driversLoading}
        onClose={() => setAssignDriverModalOpen(false)}
        onSelectDriver={(driver) => void handleAssignDriver(driver)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PAGE },
  flex: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: PAGE,
  },
  muted: { marginTop: 10, color: '#64748b', fontSize: 14 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: -16,
    marginBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#B7BDC9',
    backgroundColor: CARD,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  headerMain: { flex: 1, paddingRight: 12 },
  screenTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', lineHeight: 26 },
  onlineRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  onlineLabel: { fontSize: 14, fontWeight: '700', color: '#B7BDC9' },
  topLink: { fontSize: 15, fontWeight: '700', color: PRIMARY, marginTop: 2 },
  scroll: { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 120, flexGrow: 1 },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
    paddingTop: 24,
    paddingBottom: 24,
  },
  profileFields: {
    width: '100%',
    gap: 12,
    marginTop: 20,
  },
  profileFieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  profileInput: {
    height: 48,
    borderWidth: 1,
    borderColor: '#B7BDC9',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#171923',
    backgroundColor: '#fafafa',
    textAlign: 'center',
  },
  profileAvatarButton: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(22,163,74,0.55)',
    backgroundColor: '#B7BDC9',
  },
  profileAvatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  profileAvatarPlaceholder: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#B7BDC9',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statTileWide: {
    flex: 1,
    minWidth: '100%',
  },
  statTile: {
    flex: 1,
    minWidth: 0,
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  statValue: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  statLabel: { marginTop: 4, fontSize: 11, color: '#64748b', fontWeight: '700' },
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  logoWrap: { alignItems: 'center', marginBottom: 16 },
  logo: {
    width: 100,
    height: 100,
    borderRadius: 20,
    backgroundColor: '#B7BDC9',
  },
  logoPh: { alignItems: 'center', justifyContent: 'center' },
  logoHint: { marginTop: 8, fontSize: 13, color: '#64748b', fontWeight: '500' },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#B7BDC9',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#171923',
    marginBottom: 12,
    backgroundColor: '#fafafa',
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.35)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 14,
  },
  secondaryBtnText: { color: PRIMARY, fontWeight: '700' },
  primaryBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveVenueBtn: {
    marginTop: 4,
    minHeight: 48,
    justifyContent: 'center',
  },
  saveVenueBtnDisabled: {
    opacity: 0.45,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  fab: {
    position: 'absolute',
    right: 18,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 40,
  },
  menuHint: {
    fontSize: 12,
    color: '#7D8493',
    marginTop: -6,
    marginBottom: 14,
    lineHeight: 17,
  },
  empty: { color: '#64748b', fontSize: 14, marginTop: 4 },
  menuDishCard: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#B7BDC9',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  menuDishImage: {
    width: '100%',
    height: 140,
    backgroundColor: '#B7BDC9',
  },
  menuDishImagePh: { alignItems: 'center', justifyContent: 'center' },
  menuDishBody: { padding: 14 },
  menuDishText: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  menuDishName: { flex: 1, fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  menuDishPrice: { fontSize: 16, fontWeight: '800', color: PRIMARY },
  menuDishActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  menuActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: PRIMARY,
    paddingVertical: 11,
    borderRadius: 12,
  },
  menuActionBtnDanger: { backgroundColor: '#dc2626' },
  menuActionBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  orderRow: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#B7BDC9',
    borderRadius: 12,
    backgroundColor: '#000000',
    marginBottom: 10,
  },
  orderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderId: { fontSize: 12, color: '#64748b', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  orderBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  orderBadgeText: { fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  orderMeta: { fontSize: 13, color: '#B7BDC9', marginTop: 4, fontWeight: '600' },
  orderItems: { fontSize: 13, color: '#64748b', marginTop: 4 },
  orderTotal: { fontSize: 16, color: '#FFFFFF', marginTop: 8, fontWeight: '800' },
  ordersSummaryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  ordersSummaryTile: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#171923',
    padding: 8,
    alignItems: 'center',
  },
  ordersSummaryValue: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  ordersSummaryLabel: { color: '#7D8493', fontWeight: '700', fontSize: 11, marginTop: 2 },
  orderSkeleton: {
    height: 92,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginTop: 10,
  },
  footerHint: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 8 },
  footerLink: { color: PRIMARY, fontWeight: '700' },
  modalSafe: { flex: 1, backgroundColor: PAGE },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#B7BDC9',
    backgroundColor: CARD,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  modalClose: { fontSize: 16, fontWeight: '600', color: PRIMARY },
  modalBody: { padding: 16, paddingBottom: 40 },
  preview: {
    width: '100%',
    height: 160,
    borderRadius: 14,
    marginBottom: 12,
    backgroundColor: '#B7BDC9',
  },
});
