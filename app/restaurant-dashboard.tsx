import { useFocusEffect } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { Redirect } from 'expo-router';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, TouchableWithoutFeedback, View, type AppStateStatus } from 'react-native';
import { AppTextInput } from '../components/AppTextInput';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppHeader from '../components/AppHeader';
import { AssignDriverModal } from '../components/AssignDriverModal';
import { StatCard } from '../components/restaurant/StatCard';
import { useDrivers } from '../hooks/useDrivers';
import { useMenu } from '../hooks/useMenu';
import {
  RestaurantOrdersPanel,
  type RestaurantDashboardMetrics,
} from '../components/restaurant/RestaurantOrdersPanel';
import { useAuth } from '../services/AuthContext';
import { assignDriverToOrder } from '../services/driverService';
import { db } from '../services/firebase';
import { addFoodItem, deleteFoodItem, updateFoodItem, type FoodItem } from '../services/foodService';
import { updateRestaurantOpen } from '../services/restaurantDashboard';
import {
    fetchStripeConnectStatusExpo,
    startOnboarding,
    type StripeConnectStatus,
} from '@/services/stripeConnect';
import { MenuItemImagePicker } from '../components/restaurant/MenuItemImagePicker';
import { useMenuItemImageEditor } from '../hooks/useMenuItemImageEditor';
import { menuImageDisplayUri } from '../utils/menuImageUrl';
import { requireRole } from '../utils/requireRole';
import { stripeConnectErrorMessage } from '../utils/stripeConnectErrors';
import { AccountLocationPicker } from '@/components/location/AccountLocationPicker';
import { LOCATION_PALETTE_LIGHT } from '@/components/location/locationPalette';
import { parseSavedLocation } from '@/lib/location/parseSavedLocation';
import { showError, showSuccess } from '../utils/toast';

type RestaurantView = {
  id: string;
  name: string;
  logo: string | null;
  location: string;
  isOpen: boolean;
  profileCompleted: boolean;
  stripeAccountId: string | null;
  /** From Stripe Connect + `account.updated` webhook / status sync. */
  stripeConnected: boolean;
  stripeChargesEnabled: boolean;
  timezone: string | null;
};

/** Firestore `users/{uid}` — backend Stripe Connect writes here first. */
type UserStripeDoc = Record<string, unknown> | null;

export default function RestaurantDashboardScreen() {
  const { authorized, loading: roleLoading } = requireRole(['restaurant', 'host', 'admin']);
  const { user } = useAuth();
  const [restaurant, setRestaurant] = useState<RestaurantView | null>(null);
  const [restaurantLoading, setRestaurantLoading] = useState(true);
  const [dashboardMetrics, setDashboardMetrics] = useState<RestaurantDashboardMetrics>({
    ordersToday: 0,
    revenue: 0,
  });
  const { drivers, loading: driversLoading } = useDrivers();
  const { items: menu, loading: menuLoading } = useMenu(restaurant?.id);
  const [menuModalOpen, setMenuModalOpen] = useState(false);
  const [assignDriverModalOpen, setAssignDriverModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<FoodItem | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemAvailable, setItemAvailable] = useState(true);
  const [itemDescription, setItemDescription] = useState('');
  const [itemCategory, setItemCategory] = useState('');
  const [savingItem, setSavingItem] = useState(false);

  const menuItemImage = useMenuItemImageEditor({
    restaurantId: restaurant?.id,
    itemId: editingItem?.id,
    initialImageUrl: editingItem?.image ?? null,
    initialUpdatedAtMs: editingItem?.updatedAtMs ?? null,
    active: menuModalOpen,
  });
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeStatusLoading, setStripeStatusLoading] = useState(false);
  const [stripeConnectStatus, setStripeConnectStatus] = useState<StripeConnectStatus | null>(null);
  const [userData, setUserData] = useState<UserStripeDoc>(null);

  const loadUserStripeDoc = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const docSnap = await getDoc(doc(db, 'users', user.uid));
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserData(data);
      } else {
        setUserData(null);
      }
    } catch (e) {
      console.warn('[restaurant-dashboard] users doc read failed (non-fatal)', e);
      setUserData(null);
    }
  }, [user?.uid]);

  const refreshStripeConnectStatus = useCallback(async () => {
    if (!restaurant?.id) return;
    setStripeStatusLoading(true);
    try {
      const data = await fetchStripeConnectStatusExpo(restaurant.id);
      if (__DEV__) console.log('[restaurant-dashboard] Stripe status parsed', data);
      setStripeConnectStatus(data);
    } catch (e) {
      console.warn('[restaurant-dashboard] stripe-status failed (non-fatal)', e);
    } finally {
      setStripeStatusLoading(false);
      await loadUserStripeDoc();
    }
  }, [restaurant?.id, loadUserStripeDoc]);

  useFocusEffect(
    useCallback(() => {
      void refreshStripeConnectStatus();
    }, [refreshStripeConnectStatus]),
  );

  useEffect(() => {
    if (!restaurant?.id) return;
    void refreshStripeConnectStatus();
  }, [restaurant?.id, refreshStripeConnectStatus]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') void refreshStripeConnectStatus();
    });
    return () => sub.remove();
  }, [refreshStripeConnectStatus]);

  useEffect(() => {
    setStripeConnectStatus(null);
    setUserData(null);
  }, [user?.uid]);

  useEffect(() => {
    void loadUserStripeDoc();
  }, [loadUserStripeDoc]);

  useEffect(() => {
    if (!user?.uid) {
      setRestaurant(null);
      setRestaurantLoading(false);
      return;
    }
    setRestaurantLoading(true);
    const unsub = onSnapshot(
      doc(db, 'restaurants', user.uid),
      (snap) => {
        if (__DEV__) console.log('[restaurant-dashboard] fetching restaurant for', user.uid);
        if (!snap.exists()) {
          setRestaurant(null);
          setRestaurantLoading(false);
          return;
        }
        const data = snap.data();
        setRestaurant({
          id: user.uid,
          name: typeof data.name === 'string' ? data.name : 'Restaurant',
          logo: typeof data.logo === 'string' ? data.logo : null,
          location: (() => {
            const parsed = parseSavedLocation(data.location);
            if (parsed) return parsed.address;
            return typeof data.location === 'string' ? data.location : '';
          })(),
          isOpen: data.isOpen !== false,
          profileCompleted: data.profileCompleted === true,
          stripeAccountId:
            typeof data.stripeAccountId === 'string' ? data.stripeAccountId : null,
          stripeConnected: data.stripeConnected === true,
          stripeChargesEnabled: data.stripeChargesEnabled === true,
          timezone:
            typeof data.timezone === 'string' && data.timezone.trim()
              ? data.timezone.trim()
              : typeof data.timeZone === 'string' && data.timeZone.trim()
                ? data.timeZone.trim()
                : null,
        });
        setRestaurantLoading(false);
      },
      (error) => {
        console.log('[restaurant-dashboard] failed to fetch restaurant', error);
        setRestaurantLoading(false);
      },
    );
    return () => unsub();
  }, [user?.uid]);

  const stats = useMemo(
    () => [
      { label: 'Orders (24h)', value: `${dashboardMetrics.ordersToday}` },
      { label: 'Revenue', value: `$${dashboardMetrics.revenue.toFixed(2)}` },
    ],
    [dashboardMetrics],
  );

  async function handleToggleOpen(value: boolean) {
    if (!restaurant?.id) return;
    try {
      await updateRestaurantOpen(restaurant.id, value);
    } catch (error) {
      console.log('[restaurant-dashboard] failed to toggle open status', error);
      showError('Failed to update restaurant status.');
    }
  }

  function openAssignDriverModal(orderId: string) {
    setSelectedOrderId(orderId);
    setAssignDriverModalOpen(true);
  }

  async function handleAssignDriver(driver: (typeof drivers)[number]) {
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
      console.log('[restaurant-dashboard] failed to assign driver', error);
      showError('Could not assign driver.');
    }
  }

  function openAddItemModal() {
    setEditingItem(null);
    setItemName('');
    setItemPrice('');
    menuItemImage.reset(null, null);
    setItemAvailable(true);
    setItemDescription('');
    setItemCategory('');
    setMenuModalOpen(true);
  }

  function openEditItemModal(item: FoodItem) {
    setEditingItem(item);
    setItemName(item.name);
    setItemPrice(String(item.price));
    menuItemImage.reset(item.image, item.updatedAtMs);
    setItemAvailable(item.available);
    setItemDescription(item.description ?? '');
    setItemCategory(item.category ?? '');
    setMenuModalOpen(true);
  }

  async function saveMenuItem() {
    if (!restaurant?.id) return;
    if (!menuItemImage.canSave) return;
    const trimmedName = itemName.trim();
    const parsedPrice = Number(itemPrice);
    if (!trimmedName) {
      showError('Item name is required.');
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      showError('Enter a valid price.');
      return;
    }
    setSavingItem(true);
    try {
      if (editingItem) {
        const imageUrl = await menuItemImage.finalizeImageForItem(editingItem.id);
        await updateFoodItem(restaurant.id, editingItem.id, {
          name: trimmedName,
          price: parsedPrice,
          image: imageUrl,
          available: itemAvailable,
          description: itemDescription.trim(),
          category: itemCategory.trim(),
        });
      } else {
        const newItemId = await addFoodItem({
          restaurantId: restaurant.id,
          name: trimmedName,
          price: parsedPrice,
          image: menuItemImage.committedImageUrl,
          available: itemAvailable,
          description: itemDescription.trim(),
          category: itemCategory.trim(),
        });
        await menuItemImage.finalizeImageForItem(newItemId);
      }
      setMenuModalOpen(false);
      menuItemImage.reset(null, null);
      showSuccess('Menu item saved');
    } catch (error) {
      console.log('[restaurant-dashboard] failed to save menu item', error);
      showError('Could not save menu item.');
    } finally {
      setSavingItem(false);
    }
  }

  async function handleDeleteItem(itemId: string) {
    if (!restaurant?.id) return;
    try {
      await deleteFoodItem(restaurant.id, itemId);
      showSuccess('Menu item deleted');
    } catch (error) {
      console.log('[restaurant-dashboard] failed to delete menu item', error);
      showError('Could not delete menu item.');
    }
  }

  async function handleConnectWithStripe() {
    if (!user?.uid || !restaurant?.id) return;
    setStripeLoading(true);
    try {
      const { url } = await startOnboarding(restaurant.id);
      if (url) {
        await Linking.openURL(url);
      }
      void refreshStripeConnectStatus();
      void loadUserStripeDoc();
      showSuccess('Finish setup in Stripe, then return to this app.');
    } catch (error) {
      const msg = stripeConnectErrorMessage(error);
      console.error('[restaurant-dashboard] Connect Stripe failed', error);
      showError(msg);
    } finally {
      setStripeLoading(false);
    }
  }

  async function handleResumeStripeSetup() {
    if (!user?.uid || !restaurant?.id) return;
    setStripeLoading(true);
    try {
      const { url } = await startOnboarding(restaurant.id);
      if (url) {
        await Linking.openURL(url);
      }
      void refreshStripeConnectStatus();
      void loadUserStripeDoc();
      showSuccess('Continue in Stripe, then return here.');
    } catch (error) {
      const msg = stripeConnectErrorMessage(error);
      console.error('[restaurant-dashboard] Resume Stripe failed', error);
      showError(msg);
    } finally {
      setStripeLoading(false);
    }
  }

  const userStripeAccountId =
    userData &&
    typeof userData.stripeAccountId === 'string' &&
    userData.stripeAccountId.startsWith('acct_')
      ? userData.stripeAccountId
      : null;
  const userStripeChargesEnabled = userData?.stripeChargesEnabled === true;
  const userStripeOnboardingComplete = userData?.stripeOnboardingComplete === true;

  const stripeAccountIdEffective =
    userStripeAccountId ?? restaurant?.stripeAccountId ?? null;
  const stripeChargesEffective =
    userStripeChargesEnabled ||
    restaurant?.stripeChargesEnabled === true ||
    stripeConnectStatus?.charges_enabled === true;
  /** Host payouts: `users.stripeOnboardingComplete` (synced when Stripe `charges_enabled`) or live status. */
  const stripePayoutsReady = userStripeOnboardingComplete || stripeChargesEffective;

  /** Single entry for the Payments card — connect vs resume from merged Firestore/API state. */
  function handleConnectStripe() {
    if (!user?.uid || !restaurant?.id || stripeLoading) return;
    const hasAcct = !!stripeAccountIdEffective;
    if (hasAcct && !stripePayoutsReady) {
      void handleResumeStripeSetup();
      return;
    }
    if (!hasAcct) {
      void handleConnectWithStripe();
    }
  }

  if (roleLoading || !authorized) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#16a34a" />
      </SafeAreaView>
    );
  }

  if (restaurantLoading || menuLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#16a34a" />
      </SafeAreaView>
    );
  }

  if (!restaurant) return <Redirect href="/restaurant-onboarding" />;
  if (!restaurant.profileCompleted) return <Redirect href="/restaurant-onboarding" />;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={{ flex: 1 }}>
      <AppHeader title="Restaurant Dashboard" />
      <View style={styles.header}>
        <View>
          <Text style={styles.restaurantName}>{restaurant.name || user?.displayName?.trim() || 'Restaurant Dashboard'}</Text>
          {restaurant.logo ? <Image source={{ uri: restaurant.logo }} style={styles.logoThumb} /> : null}
          <Text style={styles.locationText}>{restaurant.location || 'No location set'}</Text>
          <Text style={styles.earnings}>24h: ${dashboardMetrics.revenue.toFixed(2)}</Text>
        </View>
        <View style={styles.openToggleWrap}>
          <Text style={styles.openLabel}>{restaurant.isOpen ? 'Open' : 'Closed'}</Text>
          <Switch value={restaurant.isOpen} onValueChange={handleToggleOpen} />
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
          {stats.map((stat) => (
            <StatCard key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </ScrollView>
        {user?.uid ? (
          <AccountLocationPicker
            role="restaurant"
            accountId={user.uid}
            palette={LOCATION_PALETTE_LIGHT}
            hint="Update your restaurant address for customers and drivers."
            saveSuccessMessage="Venue location updated"
          />
        ) : null}
        {restaurant?.id ? (
          <RestaurantOrdersPanel
            restaurantId={restaurant.id}
            restaurantTimeZone={restaurant.timezone}
            title="Live orders"
            onAssignDriver={openAssignDriverModal}
            onDashboardMetrics={setDashboardMetrics}
          />
        ) : null}
        <View style={styles.stripePaymentsSection}>
          <Text style={styles.stripePaymentsTitle}>💳 Payments</Text>
          {!stripeAccountIdEffective ? (
            <View style={styles.stripeBannerDanger}>
              <Text style={styles.stripeBannerText}>
                Stripe is not connected. Connect to accept card payments and receive payouts.
              </Text>
            </View>
          ) : null}
          {!!stripeAccountIdEffective && !stripePayoutsReady ? (
            <View style={styles.stripeBannerWarning}>
              <Text style={styles.stripeBannerText}>
                Finish Stripe onboarding to enable payouts. Tap below to continue in Stripe.
              </Text>
            </View>
          ) : null}
          {stripePayoutsReady ? (
            <View style={styles.stripeBannerSuccess}>
              <Text style={styles.stripeBannerText}>Stripe Connected ✅ — you can receive payouts on paid orders.</Text>
            </View>
          ) : null}
          <Text style={styles.stripePaymentsSub}>
            {stripePayoutsReady
              ? 'Payouts are enabled for your account.'
              : 'Connect Stripe to get paid for card orders.'}
          </Text>
          {stripeStatusLoading ? (
            <View style={styles.stripePaymentsLoadingRow}>
              <ActivityIndicator color="#635BFF" />
              <Text style={styles.stripePaymentsLoadingText}>Checking Stripe status…</Text>
            </View>
          ) : null}
          {!stripeAccountIdEffective ? (
            <TouchableOpacity
              style={[styles.stripePaymentsConnectBtn, stripeLoading ? styles.stripePaymentsBtnDisabled : null]}
              disabled={stripeLoading}
              activeOpacity={0.85}
              onPress={handleConnectStripe}
            >
              {stripeLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.stripePaymentsConnectBtnText}>Connect Stripe</Text>
              )}
            </TouchableOpacity>
          ) : null}
          {!!stripeAccountIdEffective && !stripePayoutsReady ? (
            <TouchableOpacity
              style={[styles.stripePaymentsFinishBtn, stripeLoading ? styles.stripePaymentsBtnDisabled : null]}
              disabled={stripeLoading}
              activeOpacity={0.85}
              onPress={handleConnectStripe}
            >
              {stripeLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.stripePaymentsConnectBtnText}>Finish Stripe Setup</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={styles.sectionTitle}>Menu Management</Text>
        {menu.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No menu yet</Text>
            <Text style={styles.emptySub}>Add your first item to start receiving orders.</Text>
          </View>
        ) : (
          menu.map((item) => (
            <View key={item.id} style={styles.menuCard}>
              {item.image ? (
                <Image
                  source={{
                    uri:
                      menuImageDisplayUri(item.image, item.updatedAtMs) ??
                      item.image,
                  }}
                  style={styles.menuThumb}
                />
              ) : (
                <View style={styles.menuThumbPlaceholder} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.menuName}>{item.name}</Text>
                <Text style={styles.menuPrice}>${item.price.toFixed(2)}</Text>
                {!!item.category ? <Text style={styles.menuMeta}>{item.category}</Text> : null}
              </View>
              <View style={{ gap: 8 }}>
                <Switch
                  value={item.available}
                  onValueChange={(value) =>
                    updateFoodItem(restaurant.id, item.id, { available: value }).catch(() =>
                      showError('Could not update availability.'),
                    )
                  }
                />
                <Pressable style={styles.smallButton} onPress={() => openEditItemModal(item)}>
                  <Text style={styles.smallButtonText}>Edit</Text>
                </Pressable>
                <Pressable style={styles.deleteButton} onPress={() => handleDeleteItem(item.id)}>
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>
      <Pressable style={styles.fab} onPress={openAddItemModal}>
        <Text style={styles.fabText}>+ Add Item</Text>
      </Pressable>

      <Modal visible={menuModalOpen} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={styles.modalTitle}>
                  {editingItem ? 'Edit Menu Item' : 'Add Menu Item'}
                </Text>
                <AppTextInput
                  style={styles.input}
                  value={itemName}
                  onChangeText={setItemName}
                  placeholder="Item name"
                />
                <AppTextInput
                  style={styles.input}
                  value={itemPrice}
                  onChangeText={setItemPrice}
                  placeholder="Price"
                  keyboardType="decimal-pad"
                />
                <AppTextInput
                  style={[styles.input, styles.textArea]}
                  value={itemDescription}
                  onChangeText={setItemDescription}
                  placeholder="Description"
                  multiline
                />
                <AppTextInput
                  style={styles.input}
                  value={itemCategory}
                  onChangeText={setItemCategory}
                  placeholder="Category (e.g. Burgers)"
                />
                <View style={styles.row}>
                  <Text style={styles.label}>Available</Text>
                  <Switch value={itemAvailable} onValueChange={setItemAvailable} />
                </View>
                <MenuItemImagePicker
                  displayUri={menuItemImage.displayUri}
                  isPicking={menuItemImage.isPicking}
                  isUploading={menuItemImage.isUploading}
                  uploadProgress={menuItemImage.uploadProgress}
                  disabled={savingItem}
                  onPick={() => void menuItemImage.pickImage()}
                />
                <Pressable
                  style={styles.primaryButton}
                  onPress={saveMenuItem}
                  disabled={savingItem || !menuItemImage.canSave}
                >
                  {savingItem ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Save Item</Text>}
                </Pressable>
                <Pressable
                  style={styles.cancelButton}
                  onPress={() => setMenuModalOpen(false)}
                  disabled={savingItem || !menuItemImage.canSave}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                </ScrollView>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      <AssignDriverModal
        visible={assignDriverModalOpen}
        drivers={drivers}
        loading={driversLoading}
        onClose={() => setAssignDriverModalOpen(false)}
        onSelectDriver={handleAssignDriver}
      />
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#171923' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logoPreview: {
    width: 92,
    height: 92,
    borderRadius: 12,
    marginTop: 10,
    marginBottom: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  primaryButton: {
    marginTop: 10,
    backgroundColor: '#16a34a',
    borderRadius: 10,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '800' },
  secondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#09090B',
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { color: '#B7BDC9', fontWeight: '700' },
  header: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  restaurantName: { color: '#FFFFFF', fontSize: 26, fontWeight: '800' },
  logoThumb: { width: 44, height: 44, borderRadius: 10, marginTop: 6, backgroundColor: 'rgba(255,255,255,0.1)' },
  locationText: { color: '#7D8493', marginTop: 6, fontWeight: '600' },
  earnings: { color: '#16a34a', marginTop: 4, fontWeight: '700' },
  openToggleWrap: { alignItems: 'center' },
  openLabel: { color: '#B7BDC9', fontWeight: '700', marginBottom: 2 },
  content: { paddingHorizontal: 16, paddingBottom: 110 },
  statsRow: { paddingVertical: 10 },
  sectionTitle: { marginTop: 12, marginBottom: 10, color: '#FFFFFF', fontWeight: '800', fontSize: 20 },
  emptyCard: { borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#09090B', padding: 16, marginBottom: 10 },
  emptyTitle: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  emptySub: { marginTop: 6, color: '#7D8493', fontWeight: '600' },
  orderCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#09090B',
    padding: 12,
    marginBottom: 10,
  },
  orderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId: { color: '#FFFFFF', fontWeight: '800' },
  orderStatus: { color: '#1D4ED8', fontWeight: '700', textTransform: 'capitalize' },
  orderMeta: { marginTop: 4, color: '#B7BDC9', fontWeight: '600' },
  orderActions: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  orderActionRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusPillText: { fontWeight: '800', fontSize: 12, textTransform: 'capitalize' },
  rejectButton: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.14)',
    borderWidth: 1,
    borderColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectButtonText: { color: '#B91C1C', fontWeight: '800' },
  secondaryOrderBtn: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#09090B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryOrderBtnText: { color: '#B7BDC9', fontWeight: '800', fontSize: 13 },
  readyButton: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyButtonText: { color: '#FFFFFF', fontWeight: '800' },
  actionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#09090B',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionChipText: { color: '#B7BDC9', fontWeight: '700', fontSize: 12 },
  acceptButton: {
    marginTop: 4,
    height: 36,
    borderRadius: 10,
    paddingHorizontal: 14,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButtonText: { color: '#FFFFFF', fontWeight: '800' },
  acceptedNote: { color: '#16a34a', fontWeight: '700', marginTop: 8 },
  deleteButton: {
    alignSelf: 'flex-start',
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239,68,68,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: { color: '#B91C1C', fontWeight: '700', fontSize: 12 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 28,
    height: 50,
    borderRadius: 14,
    paddingHorizontal: 16,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.45)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  modalCard: {
    borderRadius: 16,
    backgroundColor: '#09090B',
    padding: 16,
    maxHeight: '88%',
  },
  modalTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 12 },
  input: {
    height: 42,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  row: {
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: { color: '#B7BDC9', fontWeight: '700' },
  cancelButton: {
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
  },
  cancelText: { color: '#7D8493', fontWeight: '700' },
  stripePaymentsSection: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#09090B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 8,
  },
  stripePaymentsTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    color: '#FFFFFF',
  },
  stripePaymentsSub: {
    color: '#7D8493',
    fontWeight: '600',
    fontSize: 14,
    marginTop: 10,
    marginBottom: 12,
    lineHeight: 20,
  },
  stripeBannerDanger: {
    backgroundColor: 'rgba(239,68,68,0.14)',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  stripeBannerWarning: {
    backgroundColor: 'rgba(245,158,11,0.14)',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  stripeBannerSuccess: {
    backgroundColor: 'rgba(34,197,94,0.16)',
    borderWidth: 1,
    borderColor: '#22C55E',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  stripeBannerText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
  },
  stripePaymentsLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  stripePaymentsLoadingText: { color: '#7D8493', fontWeight: '600', fontSize: 14 },
  stripePaymentsConnectBtn: {
    backgroundColor: '#635BFF',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  stripePaymentsFinishBtn: {
    backgroundColor: '#FF6B35',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: 10,
  },
  stripePaymentsBtnDisabled: { opacity: 0.55 },
  stripePaymentsConnectBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
  menuCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#09090B',
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  menuThumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)' },
  menuThumbPlaceholder: { width: 64, height: 64, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)' },
  menuName: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  menuPrice: { color: '#16a34a', marginTop: 4, fontWeight: '700' },
  menuMeta: { color: '#7D8493', marginTop: 3, fontWeight: '600' },
  smallButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#09090B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
  },
  smallButtonText: { color: '#B7BDC9', fontWeight: '700', fontSize: 12 },
});
