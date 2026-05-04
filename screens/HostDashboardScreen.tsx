import { systemConfirm } from '@/components/SystemDialogHost';
import { useMenu } from '@/hooks/useMenu';
import { useRestaurantOrders } from '@/hooks/useOrders';
import {
  mergeHostRestaurantProfile,
  saveRestaurantVenueMain,
} from '@/services/hostRestaurant';
import { useAuth } from '@/services/AuthContext';
import {
  addFoodItem,
  deleteFoodItem,
  updateFoodItem,
  type FoodItem,
} from '@/services/foodService';
import { db } from '@/services/firebase';
import { updateRestaurantOpen } from '@/services/restaurantDashboard';
import { startOnboarding } from '@/services/stripeConnect';
import { pickAndUploadImage } from '@/services/uploadImage';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { requireRole } from '@/utils/requireRole';
import { stripeConnectErrorMessage } from '@/utils/stripeConnectErrors';
import { showError, showSuccess } from '@/utils/toast';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { doc, onSnapshot } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

type RestaurantState = {
  id: string;
  name: string;
  logo: string | null;
  location: string;
  isOpen: boolean;
};

const PRIMARY = '#16a34a';
const PAGE = '#f8fafc';
const CARD = '#ffffff';

export default function HostDashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, loading: authLoading } = useAuth();
  const { authorized, loading: roleLoading } = requireRole(['restaurant', 'host']);
  const uid = user?.uid ?? '';

  const [restaurant, setRestaurant] = useState<RestaurantState | null>(null);
  const [restaurantLoading, setRestaurantLoading] = useState(true);
  const [nameDraft, setNameDraft] = useState('');
  const [locationDraft, setLocationDraft] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [locating, setLocating] = useState(false);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [stripeLoading, setStripeLoading] = useState(false);

  const { items: menu, loading: menuLoading } = useMenu(uid || null);
  const { orders, loading: ordersLoading } = useRestaurantOrders(uid || null);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FoodItem | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemImage, setItemImage] = useState<string | null>(null);
  const [savingItem, setSavingItem] = useState(false);

  useEffect(() => {
    if (!uid) {
      setRestaurant(null);
      setRestaurantLoading(false);
      return;
    }
    setRestaurantLoading(true);
    const unsub = onSnapshot(
      doc(db, 'restaurants', uid),
      (snap) => {
        if (!snap.exists()) {
          setRestaurant(null);
          setNameDraft('');
          setLocationDraft('');
          setRestaurantLoading(false);
          return;
        }
        const data = snap.data();
        const row: RestaurantState = {
          id: uid,
          name: typeof data.name === 'string' ? data.name : '',
          logo: typeof data.logo === 'string' ? data.logo : null,
          location: typeof data.location === 'string' ? data.location : '',
          isOpen: data.isOpen !== false,
        };
        setRestaurant(row);
        setNameDraft(row.name);
        setLocationDraft(row.location);
        setRestaurantLoading(false);
      },
      () => {
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
          return;
        }
        const v = snap.data()?.stripeAccountId;
        setStripeAccountId(
          typeof v === 'string' && v.startsWith('acct_') ? v : null,
        );
      },
      () => setStripeAccountId(null),
    );
    return () => unsub();
  }, [uid]);

  const handleConnectStripe = useCallback(async () => {
    if (!uid) return;
    setStripeLoading(true);
    try {
      await startOnboarding(uid);
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
    setSavingProfile(true);
    try {
      await saveRestaurantVenueMain({
        uid,
        name,
        location: locationDraft.trim(),
        logo:
          typeof restaurant?.logo === 'string' && restaurant.logo.trim()
            ? restaurant.logo.trim()
            : null,
      });
      showSuccess('Profile saved.');
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setSavingProfile(false);
    }
  }, [uid, nameDraft, locationDraft, restaurant?.logo]);

  const onPickLogo = async () => {
    if (!uid) return;
    setUploadingLogo(true);
    try {
      const { url, error: upErr } = await pickAndUploadImage({
        uid,
        folder: 'restaurantLogos',
        quality: 0.88,
      });
      if (upErr) showError(upErr);
      if (!url) return;
      await mergeHostRestaurantProfile(uid, { logo: url });
      showSuccess('Logo updated.');
    } catch (e) {
      showError(getUserFriendlyError(e));
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
      showError(getUserFriendlyError(e));
    } finally {
      setLocating(false);
    }
  };

  const onToggleOpen = async (next: boolean) => {
    if (!uid) return;
    try {
      await updateRestaurantOpen(uid, next);
    } catch (e) {
      showError(getUserFriendlyError(e));
    }
  };

  const openNewItem = () => {
    setEditingItem(null);
    setItemName('');
    setItemPrice('');
    setItemImage(null);
    setItemModalOpen(true);
  };

  const openEditItem = (row: FoodItem) => {
    setEditingItem(row);
    setItemName(row.name);
    setItemPrice(String(row.price));
    setItemImage(row.image);
    setItemModalOpen(true);
  };

  const pickItemImage = async () => {
    if (!uid) return;
    const { url, error: upErr } = await pickAndUploadImage({
      uid,
      folder: 'restaurantMenu',
      quality: 0.85,
    });
    if (upErr) showError(upErr);
    if (url) setItemImage(url);
  };

  const saveMenuItem = async () => {
    if (!uid) return;
    const name = itemName.trim();
    const price = Number(String(itemPrice).replace(/[^0-9.]/g, ''));
    if (!name) {
      showError('Enter item name.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      showError('Enter a valid price.');
      return;
    }
    setSavingItem(true);
    try {
      if (editingItem) {
        await updateFoodItem(uid, editingItem.id, {
          name,
          price,
          image: itemImage,
        });
        showSuccess('Item updated.');
      } else {
        await addFoodItem({
          name,
          price,
          image: itemImage,
          restaurantId: uid,
          available: true,
          description: '',
          category: '',
        });
        showSuccess('Item added.');
      }
      setItemModalOpen(false);
      setEditingItem(null);
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setSavingItem(false);
    }
  };

  const confirmDeleteItem = (row: FoodItem) => {
    void (async () => {
      const ok = await systemConfirm({
        title: 'Remove item',
        message: `Delete “${row.name}”?`,
        confirmLabel: 'Delete',
        destructive: true,
      });
      if (!ok || !uid) return;
      try {
        await deleteFoodItem(uid, row.id);
        showSuccess('Item removed.');
      } catch (e) {
        showError(getUserFriendlyError(e));
      }
    })();
  };

  const ordersPreview = useMemo(
    () => orders.slice(0, 24),
    [orders],
  );

  const stats = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const t0 = start.getTime();
    const todayOrders = orders.filter((o) => (o.createdAtMs ?? 0) >= t0);
    const ordersToday = todayOrders.length;
    const revenueToday = todayOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
    const activeItems = menu.length;
    return { ordersToday, revenueToday, activeItems };
  }, [menu, orders]);

  if (authLoading || roleLoading) {
    return (
      <SafeAreaView style={styles.center} edges={['top', 'bottom']}>
        <ActivityIndicator size="large" color={PRIMARY} />
        <Text style={styles.muted}>Loading…</Text>
      </SafeAreaView>
    );
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (!authorized) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          <View style={styles.headerMain}>
            <Text style={styles.screenTitle}>Restaurant Dashboard</Text>
            <View style={styles.onlineRow}>
              <Text style={styles.onlineLabel}>
                {restaurant?.isOpen !== false ? 'Online' : 'Offline'}
              </Text>
              <Switch
                value={restaurant?.isOpen ?? true}
                onValueChange={(v) => void onToggleOpen(v)}
                trackColor={{
                  false: '#cbd5e1',
                  true: 'rgba(22,163,74,0.35)',
                }}
                thumbColor={restaurant?.isOpen !== false ? PRIMARY : '#f1f5f9'}
              />
            </View>
          </View>
          <TouchableOpacity
            onPress={() =>
              router.canGoBack()
                ? router.back()
                : router.replace('/(tabs)' as never)
            }
            hitSlop={12}
          >
            <Text style={styles.topLink}>Close</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.statsRow}>
            <View style={styles.statTile}>
              <Ionicons name="calendar-outline" size={20} color={PRIMARY} />
              <Text style={styles.statValue}>{stats.ordersToday}</Text>
              <Text style={styles.statLabel}>Orders today</Text>
            </View>
            <View style={styles.statTile}>
              <Ionicons name="cash-outline" size={20} color={PRIMARY} />
              <Text style={styles.statValue}>${stats.revenueToday.toFixed(0)}</Text>
              <Text style={styles.statLabel}>Revenue</Text>
            </View>
            <View style={styles.statTile}>
              <Ionicons name="restaurant-outline" size={20} color={PRIMARY} />
              <Text style={styles.statValue}>{stats.activeItems}</Text>
              <Text style={styles.statLabel}>Active items</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Venue info</Text>
            {restaurantLoading ? (
              <ActivityIndicator color={PRIMARY} />
            ) : (
              <>
                <TouchableOpacity
                  style={styles.logoWrap}
                  onPress={onPickLogo}
                  disabled={uploadingLogo}
                >
                  {restaurant?.logo ? (
                    <Image source={{ uri: restaurant.logo }} style={styles.logo} />
                  ) : (
                    <View style={[styles.logo, styles.logoPh]}>
                      <Ionicons name="image-outline" size={36} color="#94a3b8" />
                    </View>
                  )}
                  <Text style={styles.logoHint}>
                    {uploadingLogo ? 'Uploading…' : 'Tap to upload logo'}
                  </Text>
                </TouchableOpacity>

                <Text style={styles.inputLabel}>Restaurant / truck name</Text>
                <TextInput
                  style={styles.input}
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  placeholder="Your public name"
                  placeholderTextColor="#94a3b8"
                />

                <Text style={styles.inputLabel}>Location</Text>
                <TextInput
                  style={[styles.input, styles.inputMulti]}
                  value={locationDraft}
                  onChangeText={setLocationDraft}
                  placeholder="Address or service area"
                  placeholderTextColor="#94a3b8"
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
                  style={styles.primaryBtn}
                  onPress={saveProfileFields}
                  disabled={savingProfile}
                >
                  {savingProfile ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Save venue</Text>
                  )}
                </TouchableOpacity>

                {!stripeAccountId ? (
                  <Pressable
                    onPress={handleConnectStripe}
                    disabled={stripeLoading}
                    style={({ pressed }) => [
                      styles.stripeConnectBtn,
                      pressed && { opacity: 0.9 },
                      stripeLoading && styles.stripeConnectBtnDisabled,
                    ]}
                  >
                    {stripeLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.stripeConnectBtnText}>Connect Stripe</Text>
                    )}
                  </Pressable>
                ) : (
                  <Text style={styles.stripeConnectedText}>Stripe Connected ✅</Text>
                )}
              </>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Menu</Text>
            <Text style={styles.menuHint}>
              Card layout with photo, name, and price. Tap + to add an item.
            </Text>
            {menuLoading ? (
              <ActivityIndicator color={PRIMARY} style={{ marginTop: 12 }} />
            ) : menu.length === 0 ? (
              <Text style={styles.empty}>No menu items yet. Tap + to add your first dish.</Text>
            ) : (
              menu.map((row) => (
                <View key={row.id} style={styles.menuDishCard}>
                  {row.image ? (
                    <Image source={{ uri: row.image }} style={styles.menuDishImage} />
                  ) : (
                    <View style={[styles.menuDishImage, styles.menuDishImagePh]}>
                      <Ionicons name="fast-food-outline" size={36} color="#94a3b8" />
                    </View>
                  )}
                  <View style={styles.menuDishBody}>
                    <View style={styles.menuDishText}>
                      <Text style={styles.menuDishName} numberOfLines={2}>
                        {row.name}
                      </Text>
                      <Text style={styles.menuDishPrice}>${row.price.toFixed(2)}</Text>
                    </View>
                    <View style={styles.menuDishActions}>
                      <TouchableOpacity
                        onPress={() => openEditItem(row)}
                        style={styles.menuActionBtn}
                        hitSlop={8}
                      >
                        <Ionicons name="create-outline" size={22} color="#fff" />
                        <Text style={styles.menuActionBtnText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => confirmDeleteItem(row)}
                        style={[styles.menuActionBtn, styles.menuActionBtnDanger]}
                        hitSlop={8}
                      >
                        <Ionicons name="trash-outline" size={22} color="#fff" />
                        <Text style={styles.menuActionBtnText}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Orders</Text>
            {ordersLoading ? (
              <ActivityIndicator color={PRIMARY} style={{ marginTop: 8 }} />
            ) : ordersPreview.length === 0 ? (
              <Text style={styles.empty}>No orders yet for your venue.</Text>
            ) : (
              ordersPreview.map((o) => (
                <View key={o.id} style={styles.orderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderId} numberOfLines={1}>
                      {o.id}
                    </Text>
                    <Text style={styles.orderMeta}>
                      {o.createdAtLabel} · {o.status} · ${o.totalPrice.toFixed(2)}
                    </Text>
                    <Text style={styles.orderItems} numberOfLines={2}>
                      {o.items.map((i) => i.name).join(', ') || '—'}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

          <Text style={styles.footerHint}>
            Public menu:{' '}
            <Text
              style={styles.footerLink}
              onPress={() =>
                router.push(
                  `/restaurant-menu/${encodeURIComponent(uid)}` as never,
                )
              }
            >
              Preview menu link
            </Text>
          </Text>
        </ScrollView>

        <TouchableOpacity
          style={[styles.fab, { bottom: 18 + insets.bottom }]}
          onPress={openNewItem}
          activeOpacity={0.88}
          accessibilityLabel="Add menu item"
        >
          <Ionicons name="add" size={30} color="#fff" />
        </TouchableOpacity>

        <Modal
          visible={itemModalOpen}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setItemModalOpen(false)}
        >
          <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingItem ? 'Edit item' : 'New item'}
              </Text>
              <TouchableOpacity onPress={() => setItemModalOpen(false)}>
                <Text style={styles.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.modalBody}
            >
              <TouchableOpacity style={styles.secondaryBtn} onPress={pickItemImage}>
                <Text style={styles.secondaryBtnText}>
                  {itemImage ? 'Change photo' : 'Add photo'}
                </Text>
              </TouchableOpacity>
              {itemImage ? (
                <Image source={{ uri: itemImage }} style={styles.preview} />
              ) : null}
              <Text style={styles.inputLabel}>Name</Text>
              <TextInput
                style={styles.input}
                value={itemName}
                onChangeText={setItemName}
                placeholder="Item name"
                placeholderTextColor="#94a3b8"
              />
              <Text style={styles.inputLabel}>Price (USD)</Text>
              <TextInput
                style={styles.input}
                value={itemPrice}
                onChangeText={setItemPrice}
                placeholder="0.00"
                placeholderTextColor="#94a3b8"
                keyboardType="decimal-pad"
              />
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={saveMenuItem}
                disabled={savingItem}
              >
                {savingItem ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Save item</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </KeyboardAvoidingView>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
    backgroundColor: CARD,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  headerMain: { flex: 1, paddingRight: 12 },
  screenTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a', lineHeight: 26 },
  onlineRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  onlineLabel: { fontSize: 14, fontWeight: '700', color: '#334155' },
  topLink: { fontSize: 15, fontWeight: '700', color: PRIMARY, marginTop: 2 },
  scroll: { padding: 16, paddingBottom: 120 },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statTile: {
    flex: 1,
    minWidth: 0,
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  statValue: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  statLabel: { marginTop: 4, fontSize: 11, color: '#64748b', fontWeight: '700' },
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12,
  },
  logoWrap: { alignItems: 'center', marginBottom: 16 },
  logo: {
    width: 100,
    height: 100,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
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
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0f172a',
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
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  stripeConnectBtn: {
    marginTop: 12,
    backgroundColor: '#635BFF',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  stripeConnectBtnDisabled: { opacity: 0.55 },
  stripeConnectBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  stripeConnectedText: {
    marginTop: 12,
    color: '#15803d',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 16,
  },
  fab: {
    position: 'absolute',
    right: 18,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 40,
  },
  menuHint: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: -6,
    marginBottom: 14,
    lineHeight: 17,
  },
  empty: { color: '#64748b', fontSize: 14, marginTop: 4 },
  menuDishCard: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 14,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  menuDishImage: {
    width: '100%',
    height: 140,
    backgroundColor: '#e2e8f0',
  },
  menuDishImagePh: { alignItems: 'center', justifyContent: 'center' },
  menuDishBody: { padding: 14 },
  menuDishText: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  menuDishName: { flex: 1, fontSize: 16, fontWeight: '800', color: '#0f172a' },
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
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f1f5f9',
  },
  orderId: { fontSize: 12, color: '#64748b', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  orderMeta: { fontSize: 13, color: '#334155', marginTop: 4, fontWeight: '600' },
  orderItems: { fontSize: 13, color: '#64748b', marginTop: 4 },
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
    borderBottomColor: '#e2e8f0',
    backgroundColor: CARD,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  modalClose: { fontSize: 16, fontWeight: '600', color: PRIMARY },
  modalBody: { padding: 16, paddingBottom: 40 },
  preview: {
    width: '100%',
    height: 160,
    borderRadius: 14,
    marginBottom: 12,
    backgroundColor: '#e2e8f0',
  },
});
