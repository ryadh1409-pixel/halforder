import { AssignDriverModal } from '@/components/AssignDriverModal';
import { MenuItemCard } from '@/components/restaurant/MenuItemCard';
import { OrderCard } from '@/components/restaurant/OrderCard';
import { StatCard } from '@/components/restaurant/StatCard';
import { useDrivers } from '@/hooks/useDrivers';
import { useMenu } from '@/hooks/useMenu';
import { useRestaurantOrders } from '@/hooks/useOrders';
import { pickAndUploadImage } from '@/services/uploadImage';
import { db } from '@/services/firebase';
import { assignDriverToOrder } from '@/services/driverService';
import {
  addMenuItem,
  deleteMenuItem,
  markOrderReady,
  updateMenuItem,
  updateRestaurantOpen,
  type MenuItemDoc,
} from '@/services/restaurantDashboard';
import { requireRole } from '@/utils/requireRole';
import { showError, showSuccess } from '@/utils/toast';
import { useAuth } from '@/services/AuthContext';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type RestaurantView = {
  id: string;
  name: string;
  isOpen: boolean;
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
  const [editingItem, setEditingItem] = useState<MenuItemDoc | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemImage, setItemImage] = useState<string | null>(null);
  const [itemAvailable, setItemAvailable] = useState(true);
  const [savingItem, setSavingItem] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setRestaurant(null);
      setRestaurantLoading(false);
      return;
    }
    setRestaurantLoading(true);
    const unsub = onSnapshot(
      query(collection(db, 'restaurants'), where('ownerId', '==', user.uid)),
      (snap) => {
        if (snap.empty) {
          setRestaurant(null);
          setRestaurantLoading(false);
          return;
        }
        const d = snap.docs[0];
        const data = d.data();
        setRestaurant({
          id: d.id,
          name: typeof data.name === 'string' ? data.name : 'Restaurant',
          isOpen: data.isOpen !== false,
        });
        setRestaurantLoading(false);
      },
      () => setRestaurantLoading(false),
    );
    return () => unsub();
  }, [user?.uid]);

  const completedOrders = orders.filter((o) => o.status === 'picked_up').length;
  const activeOrders = orders.filter((o) => o.status !== 'picked_up').length;
  const revenue = orders.reduce((sum, o) => sum + o.total, 0);

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
    } catch {
      showError('Failed to update restaurant status.');
    }
  }

  async function handleMarkReady(orderId: string) {
    try {
      await markOrderReady(orderId);
    } catch {
      showError('Unable to update order.');
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
        order?.status ?? 'preparing',
      );
      showSuccess('Driver assigned');
      setAssignDriverModalOpen(false);
      setSelectedOrderId(null);
    } catch {
      showError('Could not assign driver.');
    }
  }

  function openAddItemModal() {
    setEditingItem(null);
    setItemName('');
    setItemPrice('');
    setItemImage(null);
    setItemAvailable(true);
    setMenuModalOpen(true);
  }

  function openEditItemModal(item: MenuItemDoc) {
    setEditingItem(item);
    setItemName(item.name);
    setItemPrice(String(item.price));
    setItemImage(item.image);
    setItemAvailable(item.isAvailable);
    setMenuModalOpen(true);
  }

  async function handlePickImage() {
    if (!user?.uid) return;
    const result = await pickAndUploadImage({
      uid: user.uid,
      folder: 'menu-items',
    });
    if (result.error) {
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
        await updateMenuItem(editingItem.id, {
          name: trimmedName,
          price: parsedPrice,
          image: itemImage,
          isAvailable: itemAvailable,
        });
      } else {
        await addMenuItem({
          restaurantId: restaurant.id,
          name: trimmedName,
          price: parsedPrice,
          image: itemImage,
          isAvailable: itemAvailable,
        });
      }
      setMenuModalOpen(false);
      showSuccess('Menu item saved');
    } catch {
      showError('Could not save menu item.');
    } finally {
      setSavingItem(false);
    }
  }

  async function handleDeleteItem(itemId: string) {
    try {
      await deleteMenuItem(itemId);
      showSuccess('Menu item deleted');
    } catch {
      showError('Could not delete menu item.');
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

  if (!restaurant) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <Text style={styles.sectionTitle}>No restaurant profile found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.restaurantName}>
            {restaurant.name || user?.displayName?.trim() || 'Restaurant Dashboard'}
          </Text>
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
        <Text style={styles.sectionTitle}>Active Orders</Text>
        {orders.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No active orders</Text>
            <Text style={styles.emptySub}>New orders will appear here in real-time.</Text>
          </View>
        ) : (
          orders.map((order) => (
            <OrderCard
              key={order.id}
              order={{
                id: order.id,
                items: order.items.join(', ') || 'Order items',
                totalPrice: order.total,
                timeAgo: order.createdAtLabel,
                status: order.status,
              }}
              onMarkReady={handleMarkReady}
              onAssignDriver={openAssignDriverModal}
            />
          ))
        )}
        <Text style={styles.sectionTitle}>Menu Management</Text>
        {menu.map((item) => (
          <View key={item.id}>
            <MenuItemCard
              item={item}
              onToggleAvailability={(id, value) =>
                updateMenuItem(id, { isAvailable: value }).catch(() =>
                  showError('Could not update availability.'),
                )
              }
              onEdit={() => openEditItemModal(item)}
            />
            <Pressable style={styles.deleteButton} onPress={() => handleDeleteItem(item.id)}>
              <Text style={styles.deleteButtonText}>Delete Item</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
      <Pressable style={styles.fab} onPress={openAddItemModal}>
        <Text style={styles.fabText}>+ Add Item</Text>
      </Pressable>

      <Modal visible={menuModalOpen} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
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
            <View style={styles.row}>
              <Text style={styles.label}>Available</Text>
              <Switch value={itemAvailable} onValueChange={setItemAvailable} />
            </View>
            <Pressable style={styles.secondaryButton} onPress={handlePickImage}>
              <Text style={styles.secondaryButtonText}>
                {itemImage ? 'Change Image' : 'Upload Image'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.primaryButton}
              onPress={saveMenuItem}
              disabled={savingItem}
            >
              <Text style={styles.primaryButtonText}>
                {savingItem ? 'Saving...' : 'Save Item'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.cancelButton}
              onPress={() => setMenuModalOpen(false)}
              disabled={savingItem}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <AssignDriverModal
        visible={assignDriverModalOpen}
        drivers={drivers}
        loading={driversLoading}
        onClose={() => setAssignDriverModalOpen(false)}
        onSelectDriver={handleAssignDriver}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  earnings: { color: '#16a34a', marginTop: 4, fontWeight: '700' },
  openToggleWrap: { alignItems: 'center' },
  openLabel: { color: '#334155', fontWeight: '700', marginBottom: 2 },
  content: { paddingHorizontal: 16, paddingBottom: 110 },
  statsRow: { paddingVertical: 10 },
  sectionTitle: { marginTop: 12, marginBottom: 10, color: '#0F172A', fontWeight: '800', fontSize: 20 },
  emptyCard: { borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', padding: 16, marginBottom: 10 },
  emptyTitle: { color: '#0F172A', fontWeight: '800', fontSize: 16 },
  emptySub: { marginTop: 6, color: '#64748B', fontWeight: '600' },
  deleteButton: {
    marginTop: -4,
    marginBottom: 8,
    alignSelf: 'flex-start',
    height: 30,
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
});
