import { AssignDriverModal } from '../components/AssignDriverModal';
import AppHeader from '../components/AppHeader';
import { StatCard } from '../components/restaurant/StatCard';
import { useDrivers } from '../hooks/useDrivers';
import { useMenu } from '../hooks/useMenu';
import { useRestaurantOrders } from '../hooks/useOrders';
import { useAuth } from '../services/AuthContext';
import { assignDriverToOrder } from '../services/driverService';
import { db } from '../services/firebase';
import { addFoodItem, deleteFoodItem, updateFoodItem, type FoodItem } from '../services/foodService';
import {
  rejectOrder,
  updateOrderStatus,
  type OrderStatus,
} from '../services/orderService';
import { updateRestaurantOpen } from '../services/restaurantDashboard';
import { createOnboardingLink, createPaymentIntent, createStripeAccount } from '../services/stripeConnect';
import { pickAndUploadImage } from '../services/uploadImage';
import { requireRole } from '../utils/requireRole';
import { showError, showSuccess } from '../utils/toast';
import { Redirect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { doc, onSnapshot } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type RestaurantView = {
  id: string;
  name: string;
  logo: string | null;
  location: string;
  isOpen: boolean;
  profileCompleted: boolean;
  stripeAccountId: string | null;
};

export default function RestaurantDashboardScreen() {
  const { authorized, loading: roleLoading } = requireRole(['restaurant', 'admin']);
  const { user } = useAuth();
  const [restaurant, setRestaurant] = useState<RestaurantView | null>(null);
  const [restaurantLoading, setRestaurantLoading] = useState(true);
  const { orders, loading: ordersLoading } = useRestaurantOrders(restaurant?.id);
  const { drivers, loading: driversLoading } = useDrivers();
  const { items: menu, loading: menuLoading } = useMenu(restaurant?.id);
  const [menuModalOpen, setMenuModalOpen] = useState(false);
  const [assignDriverModalOpen, setAssignDriverModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<FoodItem | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemImage, setItemImage] = useState<string | null>(null);
  const [itemAvailable, setItemAvailable] = useState(true);
  const [itemDescription, setItemDescription] = useState('');
  const [itemCategory, setItemCategory] = useState('');
  const [savingItem, setSavingItem] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);

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
        console.log('[restaurant-dashboard] fetching restaurant for', user.uid);
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
          location: typeof data.location === 'string' ? data.location : '',
          isOpen: data.isOpen !== false,
          profileCompleted: data.profileCompleted === true,
          stripeAccountId:
            typeof data.stripeAccountId === 'string' ? data.stripeAccountId : null,
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

  const completedOrders = orders.filter((o) => o.status === 'delivered').length;
  const activeOrders = orders.filter(
    (o) => o.status !== 'delivered' && o.status !== 'rejected',
  ).length;
  const revenue = orders.reduce((sum, o) => sum + o.totalPrice, 0);

  const stats = useMemo(
    () => [
      { label: 'Orders today', value: `${orders.length}` },
      { label: 'Active orders', value: `${activeOrders}` },
      { label: 'Completed', value: `${completedOrders}` },
      { label: 'Revenue', value: `$${revenue.toFixed(2)}` },
    ],
    [orders.length, activeOrders, completedOrders, revenue],
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

  async function handleOrderStatus(orderId: string, status: OrderStatus) {
    try {
      await updateOrderStatus(orderId, status);
      showSuccess('Order updated');
    } catch (error) {
      console.log('[restaurant-dashboard] failed to update order status', error);
      showError('Unable to update order.');
    }
  }

  async function handleRejectOrder(orderId: string) {
    try {
      await rejectOrder(orderId);
      showSuccess('Order rejected');
    } catch (error) {
      console.log('[restaurant-dashboard] failed to reject order', error);
      showError('Could not reject order.');
    }
  }

  const incomingOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status !== 'awaiting_payment' &&
          ['pending', 'accepted', 'preparing', 'ready'].includes(o.status),
      ),
    [orders],
  );

  function statusBadgeStyle(status: OrderStatus): { bg: string; fg: string } {
    switch (status) {
      case 'awaiting_payment':
        return { bg: '#E2E8F0', fg: '#334155' };
      case 'pending':
        return { bg: '#FEF3C7', fg: '#92400E' };
      case 'accepted':
        return { bg: '#DBEAFE', fg: '#1E40AF' };
      case 'preparing':
        return { bg: '#E0E7FF', fg: '#3730A3' };
      case 'ready':
        return { bg: '#D1FAE5', fg: '#065F46' };
      case 'picked_up':
      case 'on_the_way':
        return { bg: '#CCFBF1', fg: '#0F766E' };
      case 'delivered':
        return { bg: '#ECFDF5', fg: '#166534' };
      case 'rejected':
        return { bg: '#FEE2E2', fg: '#991B1B' };
      default:
        return { bg: '#F1F5F9', fg: '#475569' };
    }
  }

  function openAssignDriverModal(orderId: string) {
    setSelectedOrderId(orderId);
    setAssignDriverModalOpen(true);
  }

  async function handleAssignDriver(driver: (typeof drivers)[number]) {
    if (!selectedOrderId) return;
    const order = orders.find((o) => o.id === selectedOrderId);
    try {
      await assignDriverToOrder(
        selectedOrderId,
        {
          id: driver.id,
          name: driver.name,
          phone: driver.phone,
          isOnline: driver.isOnline,
        },
        order?.status ?? 'pending',
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
    setItemImage(null);
    setItemAvailable(true);
    setItemDescription('');
    setItemCategory('');
    setMenuModalOpen(true);
  }

  function openEditItemModal(item: FoodItem) {
    setEditingItem(item);
    setItemName(item.name);
    setItemPrice(String(item.price));
    setItemImage(item.image);
    setItemAvailable(item.available);
    setItemDescription(item.description ?? '');
    setItemCategory(item.category ?? '');
    setMenuModalOpen(true);
  }

  async function handlePickImage() {
    if (!user?.uid) return;
    const result = await pickAndUploadImage({
      uid: user.uid,
      folder: 'menu-items',
    });
    if (result.error) {
      console.log('[restaurant-dashboard] image upload error', result.error);
      showError(result.error);
      return;
    }
    if (result.url) {
      setItemImage(result.url);
    }
  }

  async function saveMenuItem() {
    if (!restaurant?.id) return;
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
        await updateFoodItem(restaurant.id, editingItem.id, {
          name: trimmedName,
          price: parsedPrice,
          image: itemImage,
          available: itemAvailable,
          description: itemDescription.trim(),
          category: itemCategory.trim(),
        });
      } else {
        await addFoodItem({
          restaurantId: restaurant.id,
          name: trimmedName,
          price: parsedPrice,
          image: itemImage,
          available: itemAvailable,
          description: itemDescription.trim(),
          category: itemCategory.trim(),
        });
      }
      setMenuModalOpen(false);
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

  async function handleRegisterRestaurant() {
    if (!restaurant?.id) return;
    setStripeLoading(true);
    try {
      const accountId = await createStripeAccount(restaurant.id);
      showSuccess(`Stripe account created: ${accountId}`);
    } catch (error) {
      console.log('[restaurant-dashboard] failed to create stripe account', error);
      showError('Could not create Stripe account.');
    } finally {
      setStripeLoading(false);
    }
  }

  async function handleCompleteStripeSetup() {
    if (!restaurant?.stripeAccountId) {
      showError('Please register your Stripe account first.');
      return;
    }
    setStripeLoading(true);
    try {
      const url = await createOnboardingLink(restaurant.id);
      await WebBrowser.openBrowserAsync(url);
    } catch (error) {
      console.log('[restaurant-dashboard] failed to open stripe onboarding', error);
      showError('Could not open Stripe onboarding.');
    } finally {
      setStripeLoading(false);
    }
  }

  async function handleTestPayment() {
    if (!restaurant?.stripeAccountId) {
      showError('Please complete Stripe account setup first.');
      return;
    }
    setStripeLoading(true);
    try {
      const clientSecret = await createPaymentIntent(1200, restaurant.stripeAccountId);
      console.log('[restaurant-dashboard] stripe test payment client secret', clientSecret);
      showSuccess('Payment intent created. Check logs for client secret.');
    } catch (error) {
      console.log('[restaurant-dashboard] failed to create payment intent', error);
      showError('Could not create payment intent.');
    } finally {
      setStripeLoading(false);
    }
  }

  if (roleLoading || !authorized) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#16a34a" />
      </SafeAreaView>
    );
  }

  if (restaurantLoading || ordersLoading || menuLoading) {
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
          <Text style={styles.earnings}>Today: ${revenue.toFixed(2)}</Text>
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
        <Text style={styles.sectionTitle}>Stripe Connect</Text>
        <View style={styles.emptyCard}>
          <Text style={styles.orderMeta}>
            Account: {restaurant.stripeAccountId ?? 'Not connected'}
          </Text>
          <Pressable
            style={[styles.acceptButton, stripeLoading ? styles.disabledButton : null]}
            disabled={stripeLoading}
            onPress={handleRegisterRestaurant}
          >
            <Text style={styles.acceptButtonText}>Register Restaurant</Text>
          </Pressable>
          <Pressable
            style={[styles.smallButton, stripeLoading ? styles.disabledButton : null]}
            disabled={stripeLoading}
            onPress={handleCompleteStripeSetup}
          >
            <Text style={styles.smallButtonText}>Complete Stripe Setup</Text>
          </Pressable>
          <Pressable
            style={[styles.smallButton, stripeLoading ? styles.disabledButton : null]}
            disabled={stripeLoading}
            onPress={handleTestPayment}
          >
            <Text style={styles.smallButtonText}>Test Payment</Text>
          </Pressable>
        </View>
        <Text style={styles.sectionTitle}>Incoming orders (live)</Text>
        {incomingOrders.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No active kitchen orders</Text>
            <Text style={styles.emptySub}>New orders appear here instantly.</Text>
          </View>
        ) : (
          incomingOrders.map((order) => {
            const badge = statusBadgeStyle(order.status);
            return (
              <View key={order.id} style={styles.orderCard}>
                <View style={styles.orderRow}>
                  <Text style={styles.orderId}>#{order.id.slice(0, 8)}…</Text>
                  <View style={[styles.statusPill, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.statusPillText, { color: badge.fg }]}>
                      {order.status.replace('_', ' ')}
                    </Text>
                  </View>
                </View>
                <Text style={styles.orderMeta}>
                  {order.items.map((x) => `${x.qty}× ${x.name}`).join(' · ') || 'No items'}
                </Text>
                <Text style={styles.orderMeta}>
                  Total ${order.totalPrice.toFixed(2)} · Guest {order.userId.slice(0, 6)}…
                </Text>
                <Text style={styles.orderMeta}>Placed {order.createdAtLabel}</Text>
                <View style={styles.orderActionRow}>
                  {order.status === 'pending' ? (
                    <>
                      <Pressable
                        style={styles.acceptButton}
                        onPress={() => handleOrderStatus(order.id, 'accepted')}
                      >
                        <Text style={styles.acceptButtonText}>Accept</Text>
                      </Pressable>
                      <Pressable
                        style={styles.rejectButton}
                        onPress={() => handleRejectOrder(order.id)}
                      >
                        <Text style={styles.rejectButtonText}>Reject</Text>
                      </Pressable>
                    </>
                  ) : null}
                  {order.status === 'accepted' ? (
                    <Pressable
                      style={styles.secondaryOrderBtn}
                      onPress={() => handleOrderStatus(order.id, 'preparing')}
                    >
                      <Text style={styles.secondaryOrderBtnText}>Start preparing</Text>
                    </Pressable>
                  ) : null}
                  {order.status === 'preparing' ? (
                    <Pressable
                      style={styles.readyButton}
                      onPress={() => handleOrderStatus(order.id, 'ready')}
                    >
                      <Text style={styles.readyButtonText}>Mark ready for pickup</Text>
                    </Pressable>
                  ) : null}
                  {order.status === 'ready' ? (
                    <Pressable
                      style={styles.secondaryOrderBtn}
                      onPress={() => openAssignDriverModal(order.id)}
                    >
                      <Text style={styles.secondaryOrderBtnText}>Assign driver (optional)</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
        <Text style={styles.sectionTitle}>Menu Management</Text>
        {menu.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No menu yet</Text>
            <Text style={styles.emptySub}>Add your first item to start receiving orders.</Text>
          </View>
        ) : (
          menu.map((item) => (
            <View key={item.id} style={styles.menuCard}>
              {item.image ? <Image source={{ uri: item.image }} style={styles.menuThumb} /> : <View style={styles.menuThumbPlaceholder} />}
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
                <TextInput
                  style={styles.input}
                  value={itemName}
                  onChangeText={setItemName}
                  placeholder="Item name"
                />
                <TextInput
                  style={styles.input}
                  value={itemPrice}
                  onChangeText={setItemPrice}
                  placeholder="Price"
                  keyboardType="decimal-pad"
                />
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={itemDescription}
                  onChangeText={setItemDescription}
                  placeholder="Description"
                  multiline
                />
                <TextInput
                  style={styles.input}
                  value={itemCategory}
                  onChangeText={setItemCategory}
                  placeholder="Category (e.g. Burgers)"
                />
                <View style={styles.row}>
                  <Text style={styles.label}>Available</Text>
                  <Switch value={itemAvailable} onValueChange={setItemAvailable} />
                </View>
                <Pressable style={styles.secondaryButton} onPress={handlePickImage}>
                  <Text style={styles.secondaryButtonText}>
                    {itemImage ? 'Change Image' : 'Upload Image'}
                  </Text>
                </Pressable>
                {itemImage ? <Image source={{ uri: itemImage }} style={styles.logoPreview} /> : null}
                <Pressable
                  style={styles.primaryButton}
                  onPress={saveMenuItem}
                  disabled={savingItem}
                >
                  {savingItem ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Save Item</Text>}
                </Pressable>
                <Pressable
                  style={styles.cancelButton}
                  onPress={() => setMenuModalOpen(false)}
                  disabled={savingItem}
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
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logoPreview: {
    width: 92,
    height: 92,
    borderRadius: 12,
    marginTop: 10,
    marginBottom: 2,
    backgroundColor: '#E2E8F0',
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
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { color: '#334155', fontWeight: '700' },
  header: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  restaurantName: { color: '#0F172A', fontSize: 26, fontWeight: '800' },
  logoThumb: { width: 44, height: 44, borderRadius: 10, marginTop: 6, backgroundColor: '#E2E8F0' },
  locationText: { color: '#64748B', marginTop: 6, fontWeight: '600' },
  earnings: { color: '#16a34a', marginTop: 4, fontWeight: '700' },
  openToggleWrap: { alignItems: 'center' },
  openLabel: { color: '#334155', fontWeight: '700', marginBottom: 2 },
  content: { paddingHorizontal: 16, paddingBottom: 110 },
  statsRow: { paddingVertical: 10 },
  sectionTitle: { marginTop: 12, marginBottom: 10, color: '#0F172A', fontWeight: '800', fontSize: 20 },
  emptyCard: { borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', padding: 16, marginBottom: 10 },
  emptyTitle: { color: '#0F172A', fontWeight: '800', fontSize: 16 },
  emptySub: { marginTop: 6, color: '#64748B', fontWeight: '600' },
  orderCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 12,
    marginBottom: 10,
  },
  orderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId: { color: '#0F172A', fontWeight: '800' },
  orderStatus: { color: '#1D4ED8', fontWeight: '700', textTransform: 'capitalize' },
  orderMeta: { marginTop: 4, color: '#475569', fontWeight: '600' },
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
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectButtonText: { color: '#B91C1C', fontWeight: '800' },
  secondaryOrderBtn: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryOrderBtnText: { color: '#334155', fontWeight: '800', fontSize: 13 },
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
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionChipText: { color: '#334155', fontWeight: '700', fontSize: 12 },
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
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
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
    backgroundColor: '#FFFFFF',
    padding: 16,
    maxHeight: '88%',
  },
  modalTitle: { color: '#0F172A', fontSize: 20, fontWeight: '800', marginBottom: 12 },
  input: {
    height: 42,
    borderWidth: 1,
    borderColor: '#CBD5E1',
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
  label: { color: '#334155', fontWeight: '700' },
  cancelButton: {
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
  },
  cancelText: { color: '#64748B', fontWeight: '700' },
  disabledButton: { opacity: 0.5 },
  menuCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  menuThumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: '#E2E8F0' },
  menuThumbPlaceholder: { width: 64, height: 64, borderRadius: 12, backgroundColor: '#E2E8F0' },
  menuName: { color: '#0F172A', fontWeight: '800', fontSize: 15 },
  menuPrice: { color: '#16a34a', marginTop: 4, fontWeight: '700' },
  menuMeta: { color: '#64748B', marginTop: 3, fontWeight: '600' },
  smallButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
  },
  smallButtonText: { color: '#334155', fontWeight: '700', fontSize: 12 },
});
