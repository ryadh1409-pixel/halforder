import { useMenu } from '../../hooks/useMenu';
import { db } from '../../services/firebase';
import { useAuth } from '../../services/AuthContext';
import { useCart } from '../../services/CartContext';
import { showError } from '../../utils/toast';
import { Image as ExpoImage } from 'expo-image';
import { doc, onSnapshot } from 'firebase/firestore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type VenueHeader = {
  name: string;
  logo: string | null;
  location: string;
  isOpen: boolean;
};

export default function FoodTruckMenuScreen() {
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id?: string }>();
  const restaurantId = typeof rawId === 'string' ? rawId : '';
  const { user } = useAuth();
  const { items: menu, loading: menuLoading } = useMenu(restaurantId || null);
  const { items: cart, addToCart, removeFromCart } = useCart();

  const [venue, setVenue] = useState<VenueHeader | null>(null);
  const [venueLoading, setVenueLoading] = useState(Boolean(restaurantId));

  const [showMenu, setShowMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState<string>('Spam');
  const [reportNote, setReportNote] = useState('');

  useEffect(() => {
    if (!restaurantId) {
      setVenue(null);
      setVenueLoading(false);
      return;
    }
    setVenueLoading(true);
    setVenue(null);
    const unsub = onSnapshot(
      doc(db, 'restaurants', restaurantId),
      (snap) => {
        if (!snap.exists()) {
          setVenue(null);
          setVenueLoading(false);
          return;
        }
        const data = snap.data();
        setVenue({
          name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Venue',
          logo: typeof data.logo === 'string' && data.logo.trim() ? data.logo.trim() : null,
          location:
            typeof data.location === 'string' && data.location.trim()
              ? data.location.trim()
              : '',
          isOpen: data.isOpen !== false,
        });
        setVenueLoading(false);
      },
      () => {
        setVenue(null);
        setVenueLoading(false);
      },
    );
    return () => unsub();
  }, [restaurantId]);

  const cartItems = useMemo(
    () => cart.filter((row) => row.restaurantId === restaurantId),
    [cart, restaurantId],
  );

  const totalPrice = useMemo(
    () => cartItems.reduce((sum, row) => sum + row.price * row.qty, 0),
    [cartItems],
  );

  function openCart() {
    if (!user?.uid) {
      showError('Please sign in first.');
      return;
    }
    if (cartItems.length === 0) {
      showError('Cart is empty.');
      return;
    }
    router.push(
      `/restaurant-menu/cart?restaurantId=${encodeURIComponent(restaurantId)}` as never,
    );
  }

  function handleSubmitReport() {
    setShowReportModal(false);
    setShowMenu(false);
    setReportReason('Spam');
    setReportNote('');
  }

  const menuBlockLoading = menuLoading;

  if (!restaurantId) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Venue</Text>
          <Text style={styles.subtitle}>Missing venue link.</Text>
          <Pressable style={styles.secondaryBtn} onPress={() => router.back()}>
            <Text style={styles.secondaryBtnText}>Go back</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (venueLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.fullCenter}>
          <ActivityIndicator size="large" color="#16A34A" />
          <Text style={styles.loadingHint}>Loading venue…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!venue) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Venue</Text>
          <Text style={styles.subtitle}>
            This venue is not available or you do not have access.
          </Text>
          <Pressable style={styles.secondaryBtn} onPress={() => router.back()}>
            <Text style={styles.secondaryBtnText}>Go back</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={styles.title} numberOfLines={2}>
              {venue.name}
            </Text>
            <Text style={styles.locationLine} numberOfLines={3}>
              {venue.location || 'Location not listed'}
            </Text>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusPill,
                  venue.isOpen ? styles.statusOpen : styles.statusClosed,
                ]}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    venue.isOpen ? styles.statusOpenText : styles.statusClosedText,
                  ]}
                >
                  {venue.isOpen ? 'Open' : 'Closed'}
                </Text>
              </View>
            </View>
          </View>
          <Pressable
            style={styles.moreButton}
            onPress={() => setShowMenu((prev) => !prev)}
          >
            <Text style={styles.moreButtonText}>⋯</Text>
          </Pressable>
        </View>

        {venue.logo ? (
          <ExpoImage
            source={{ uri: venue.logo }}
            style={styles.heroLogo}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
        ) : null}

        {showMenu ? (
          <View style={styles.menuSheet}>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setShowReportModal(true);
                setShowMenu(false);
              }}
            >
              <Text style={styles.menuText}>Report this venue</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Menu</Text>
        {menuBlockLoading ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator size="large" color="#16A34A" />
            <Text style={styles.loadingHint}>Loading menu…</Text>
          </View>
        ) : menu.length === 0 ? (
          <Text style={styles.emptyMenu}>No menu items published yet.</Text>
        ) : (
          menu.map((meal) => (
            <View key={meal.id} style={styles.mealCard}>
              {meal.image ? (
                <ExpoImage
                  source={{ uri: meal.image }}
                  style={styles.mealImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ) : (
                <View style={[styles.mealImage, styles.mealImagePh]} />
              )}
              <View style={styles.mealBody}>
                <Text style={styles.mealName} numberOfLines={2}>
                  {meal.name}
                </Text>
                <Text style={styles.mealPrice}>${meal.price.toFixed(2)}</Text>
                <View style={styles.qtyRow}>
                  <Pressable
                    style={styles.qtyBtn}
                    onPress={() => removeFromCart(meal.id)}
                    disabled={
                      !cart.find(
                        (row) => row.id === meal.id && row.restaurantId === restaurantId,
                      )
                    }
                  >
                    <Text style={styles.qtyBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.qtyValue}>
                    {cartItems.find((row) => row.id === meal.id)?.qty ?? 0}
                  </Text>
                  <Pressable
                    style={styles.qtyBtn}
                    onPress={() =>
                      addToCart({
                        id: meal.id,
                        name: meal.name,
                        price: meal.price,
                        image: meal.image,
                        restaurantId,
                      })
                    }
                  >
                    <Text style={styles.qtyBtnText}>+</Text>
                  </Pressable>
                  <Pressable
                    style={styles.addCompact}
                    onPress={() =>
                      addToCart({
                        id: meal.id,
                        name: meal.name,
                        price: meal.price,
                        image: meal.image,
                        restaurantId,
                      })
                    }
                  >
                    <Text style={styles.addCompactText}>Add</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))
        )}

        <View style={styles.socialSection}>
          <Text style={styles.socialTitle}>Connect</Text>
          <Pressable
            style={styles.socialButton}
            onPress={() =>
              router.push(`/chat/venue-${encodeURIComponent(restaurantId)}` as never)
            }
          >
            <Text style={styles.socialButtonText}>Open chat</Text>
          </Pressable>
        </View>
      </ScrollView>

      <View style={styles.cartBar}>
        <Text style={styles.cartText}>Total: ${totalPrice.toFixed(2)}</Text>
        <Pressable
          style={[styles.placeBtn, cartItems.length === 0 && styles.placeBtnDisabled]}
          onPress={openCart}
          disabled={cartItems.length === 0}
        >
          <Text style={styles.placeText}>View cart</Text>
        </Pressable>
      </View>

      <Modal
        visible={showReportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReportModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Report venue</Text>
            {['Spam', 'Wrong information', 'Offensive content', 'Other'].map((reason) => (
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
            ))}
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
  content: { padding: 16, paddingBottom: 120 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  title: { fontSize: 26, color: '#0F172A', fontWeight: '800', lineHeight: 30 },
  locationLine: {
    marginTop: 8,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
    lineHeight: 20,
  },
  statusRow: { marginTop: 10, flexDirection: 'row' },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusOpen: { backgroundColor: 'rgba(22, 163, 74, 0.12)' },
  statusClosed: { backgroundColor: 'rgba(148, 163, 184, 0.25)' },
  statusPillText: { fontSize: 12, fontWeight: '800' },
  statusOpenText: { color: '#15803D' },
  statusClosedText: { color: '#475569' },
  heroLogo: {
    width: '100%',
    height: 120,
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  moreButton: {
    width: 40,
    height: 40,
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
    marginTop: 10,
    overflow: 'hidden',
  },
  menuItem: { paddingVertical: 12, paddingHorizontal: 14 },
  menuText: { color: '#0F172A', fontWeight: '600' },
  sectionTitle: {
    marginTop: 18,
    marginBottom: 10,
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: { marginTop: 8, color: '#64748B', fontWeight: '600', lineHeight: 20 },
  fullCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingBlock: { paddingVertical: 24, alignItems: 'center' },
  loadingHint: { marginTop: 10, color: '#64748B', fontWeight: '600' },
  emptyMenu: { color: '#64748B', fontWeight: '600', marginBottom: 8 },
  mealCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    gap: 12,
  },
  mealImage: {
    width: 88,
    height: 88,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
  },
  mealImagePh: { alignItems: 'center', justifyContent: 'center' },
  mealBody: { flex: 1, minWidth: 0 },
  mealName: { color: '#0F172A', fontSize: 16, fontWeight: '800' },
  mealPrice: { color: '#16A34A', marginTop: 6, fontWeight: '800' },
  qtyRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  qtyBtnText: { color: '#334155', fontWeight: '900', fontSize: 18, marginTop: -1 },
  qtyValue: { minWidth: 22, textAlign: 'center', color: '#0F172A', fontWeight: '800' },
  addCompact: {
    marginLeft: 'auto',
    height: 34,
    borderRadius: 8,
    paddingHorizontal: 14,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCompactText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
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
  },
  socialButtonText: { color: '#FFFFFF', fontWeight: '700' },
  cartBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cartText: { color: '#0F172A', fontWeight: '800', fontSize: 16 },
  placeBtn: {
    marginLeft: 'auto',
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 16,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeBtnDisabled: { opacity: 0.45 },
  placeText: { color: '#FFFFFF', fontWeight: '800' },
  secondaryBtn: {
    marginTop: 16,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  secondaryBtnText: { color: '#334155', fontWeight: '800' },
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
