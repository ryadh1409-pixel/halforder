import { createMockOrder } from '../../services/mockDeliveryStore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
    Alert,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Meal = {
  id: string;
  name: string;
  price: number;
};

type FoodTruckMenu = {
  name: string;
  meals: Meal[];
};

const MOCK_MENUS: Record<string, FoodTruckMenu> = {
  'tacos-el-jefe': {
    name: 'Tacos El Jefe',
    meals: [
      { id: 'm1', name: 'Beef Tacos', price: 11.99 },
      { id: 'm2', name: 'Chicken Burrito', price: 12.5 },
      { id: 'm3', name: 'Loaded Nachos', price: 9.99 },
    ],
  },
  'curry-express': {
    name: 'Curry Express',
    meals: [
      { id: 'm4', name: 'Butter Chicken Bowl', price: 13.99 },
      { id: 'm5', name: 'Paneer Masala', price: 12.99 },
      { id: 'm6', name: 'Veg Biryani', price: 11.49 },
    ],
  },
  'burger-bus': {
    name: 'Burger Bus',
    meals: [
      { id: 'm7', name: 'Classic Cheeseburger', price: 10.99 },
      { id: 'm8', name: 'Spicy Chicken Burger', price: 11.49 },
      { id: 'm9', name: 'Fries + Drink Combo', price: 8.99 },
    ],
  },
};

export default function FoodTruckMenuScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [showMenu, setShowMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState<string>('Spam');
  const [reportNote, setReportNote] = useState('');
  const truck = useMemo(
    () => (id ? MOCK_MENUS[id] : null) ?? { name: 'Food Truck', meals: [] },
    [id],
  );

  function handleSoloOrder(mealName: string) {
    console.log('Solo order placed');
    const created = createMockOrder({
      restaurantName: truck.name,
      itemName: mealName,
      totalPrice: 24.99,
      pickupLocation: `${truck.name} Pickup Spot`,
      dropoffLocation: 'Customer Destination',
      destination: { latitude: 43.6481, longitude: -79.3974 },
    });
    Alert.alert('Solo order confirmed', `Your order for ${mealName} has been placed.`);
    router.push(`/review-order/${created.id}` as never);
  }

  function handleOpenChat() {
    const chatId = `food-truck-${id ?? 'general'}`;
    router.push(`/chat/${chatId}` as never);
  }

  function handleInviteNearby() {
    Alert.alert('Invite Nearby Users', 'Invite people nearby to join your order');
  }

  function handleSubmitReport() {
    console.log({
      truckId: id ?? 'unknown',
      reason: reportReason,
      note: reportNote.trim() || null,
    });
    setShowReportModal(false);
    setShowMenu(false);
    setReportReason('Spam');
    setReportNote('');
    Alert.alert('Report submitted', 'Thanks, your report has been submitted');
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{truck.name}</Text>
          <Pressable
            style={styles.moreButton}
            onPress={() => setShowMenu((prev) => !prev)}
          >
            <Text style={styles.moreButtonText}>⋯</Text>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>Menu</Text>

        {showMenu ? (
          <View style={styles.menuSheet}>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setShowReportModal(true);
                setShowMenu(false);
              }}
            >
              <Text style={styles.menuText}>Report this food truck</Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                Alert.alert('Blocked', 'This food truck has been blocked.');
              }}
            >
              <Text style={styles.menuText}>Block this food truck</Text>
            </Pressable>
          </View>
        ) : null}

        {truck.meals.map((meal) => (
          <View key={meal.id} style={styles.mealCard}>
            <View>
              <Text style={styles.mealName}>{meal.name}</Text>
              <Text style={styles.mealPrice}>${meal.price.toFixed(2)}</Text>
            </View>
            <Pressable
              style={styles.orderButton}
              onPress={() => handleSoloOrder(meal.name)}
            >
              <Text style={styles.orderButtonText}>Order</Text>
            </Pressable>
          </View>
        ))}

        <View style={styles.socialSection}>
          <Text style={styles.socialTitle}>Connect with others</Text>
          <Pressable style={styles.socialButton} onPress={handleOpenChat}>
            <Text style={styles.socialButtonText}>Open Chat</Text>
          </Pressable>
          <Pressable
            style={[styles.socialButton, styles.inviteButton]}
            onPress={handleInviteNearby}
          >
            <Text style={styles.socialButtonText}>Invite Nearby Users</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        visible={showReportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReportModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Report Food Truck</Text>
            {['Spam', 'Wrong information', 'Offensive content', 'Other'].map(
              (reason) => (
                <Pressable
                  key={reason}
                  style={[
                    styles.reasonChip,
                    reportReason === reason && styles.reasonChipActive,
                  ]}
                  onPress={() => setReportReason(reason)}
                >
                  <Text
                    style={[
                      styles.reasonChipText,
                      reportReason === reason && styles.reasonChipTextActive,
                    ]}
                  >
                    {reason}
                  </Text>
                </Pressable>
              ),
            )}
            <TextInput
              style={styles.noteInput}
              placeholder="Optional note"
              placeholderTextColor="#94A3B8"
              value={reportNote}
              onChangeText={setReportNote}
              multiline
            />
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, styles.cancelBtn]}
                onPress={() => setShowReportModal(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.submitBtn]}
                onPress={handleSubmitReport}
              >
                <Text style={styles.submitBtnText}>Submit</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 28 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 30, color: '#0F172A', fontWeight: '800' },
  subtitle: { marginTop: 4, marginBottom: 12, color: '#64748B', fontWeight: '700' },
  moreButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2E8F0',
  },
  moreButtonText: { fontSize: 20, fontWeight: '700', color: '#334155', marginTop: -2 },
  menuSheet: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
  },
  menuItem: { paddingVertical: 12, paddingHorizontal: 14 },
  menuText: { color: '#0F172A', fontWeight: '600' },
  mealCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mealName: { color: '#0F172A', fontSize: 16, fontWeight: '700' },
  mealPrice: { color: '#64748B', marginTop: 4, fontWeight: '600' },
  orderButton: {
    height: 38,
    borderRadius: 10,
    paddingHorizontal: 16,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderButtonText: { color: '#FFFFFF', fontWeight: '800' },
  socialSection: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 14,
  },
  socialTitle: { color: '#0F172A', fontSize: 17, fontWeight: '800', marginBottom: 10 },
  socialButton: {
    height: 42,
    borderRadius: 10,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  inviteButton: { backgroundColor: '#1D4ED8' },
  socialButtonText: { color: '#FFFFFF', fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  modalTitle: { color: '#0F172A', fontWeight: '800', fontSize: 18, marginBottom: 10 },
  reasonChip: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginBottom: 8,
    backgroundColor: '#F8FAFC',
  },
  reasonChipActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  reasonChipText: { color: '#334155', fontWeight: '600' },
  reasonChipTextActive: { color: '#1D4ED8', fontWeight: '700' },
  noteInput: {
    marginTop: 4,
    minHeight: 84,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: '#0F172A',
    textAlignVertical: 'top',
  },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  modalButton: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: { borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' },
  cancelBtnText: { color: '#334155', fontWeight: '700' },
  submitBtn: { backgroundColor: '#DC2626' },
  submitBtnText: { color: '#FFFFFF', fontWeight: '800' },
});
