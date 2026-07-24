import { systemConfirm } from '@/components/SystemDialogHost';
import { MenuItemImagePicker } from '@/components/restaurant/MenuItemImagePicker';
import { useMenu } from '@/hooks/useMenu';
import { useMenuItemImageEditor } from '@/hooks/useMenuItemImageEditor';
import { logoutAndResetSession, POST_LOGOUT_ROUTE } from '@/lib/auth/logoutSession';
import { runRootNavigationTask } from '@/lib/router/rootNavigation';
import { useAuth } from '@/services/AuthContext';
import {
  addFoodItem,
  deleteFoodItem,
  updateFoodItem,
  type FoodItem,
} from '@/services/foodService';
import { menuImageDisplayUri } from '@/utils/menuImageUrl';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { requireRole } from '@/utils/requireRole';
import { showError, showSuccess } from '@/utils/toast';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppTextInput } from '@/components/AppTextInput';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

const PRIMARY = '#16a34a';
const PAGE = '#FFFFFF';
const CARD = '#ffffff';

/**
 * Restaurant Menu tab — menu items only. No order listeners or lifecycle logic.
 */
export default function HostMenuScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, loading: authLoading, signOutUser } = useAuth();
  const { authorized, loading: roleLoading } = requireRole(['restaurant', 'host']);
  const uid = user?.uid ?? '';

  const { items: menu, loading: menuLoading } = useMenu(uid || null);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FoodItem | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [savingItem, setSavingItem] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const menuItemImage = useMenuItemImageEditor({
    restaurantId: uid || undefined,
    itemId: editingItem?.id,
    initialImageUrl: editingItem?.image ?? null,
    initialUpdatedAtMs: editingItem?.updatedAtMs ?? null,
    active: itemModalOpen,
  });

  const handleExit = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logoutAndResetSession(signOutUser);
      runRootNavigationTask(() => {
        router.replace(POST_LOGOUT_ROUTE as never);
      });
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setLoggingOut(false);
    }
  }, [loggingOut, signOutUser, router]);

  const openNewItem = () => {
    setEditingItem(null);
    setItemName('');
    setItemPrice('');
    menuItemImage.reset(null, null);
    setItemModalOpen(true);
  };

  const openEditItem = (row: FoodItem) => {
    setEditingItem(row);
    setItemName(row.name);
    setItemPrice(String(row.price));
    menuItemImage.reset(row.image, row.updatedAtMs);
    setItemModalOpen(true);
  };

  const saveMenuItem = async () => {
    if (!uid) return;
    if (!menuItemImage.canSave) return;
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
        const imageUrl = await menuItemImage.finalizeImageForItem(editingItem.id);
        await updateFoodItem(uid, editingItem.id, { name, price, image: imageUrl });
        showSuccess('Item updated.');
      } else {
        const newItemId = await addFoodItem({
          name,
          price,
          image: menuItemImage.committedImageUrl,
          restaurantId: uid,
          available: true,
          description: '',
          category: '',
        });
        await menuItemImage.finalizeImageForItem(newItemId);
        showSuccess('Item added.');
      }
      setItemModalOpen(false);
      setEditingItem(null);
      menuItemImage.reset(null, null);
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
        <Text style={styles.muted}>This screen is only for restaurant or host accounts.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          <Text style={styles.screenTitle}>Menu</Text>
          <TouchableOpacity
            onPress={() => void handleExit()}
            disabled={loggingOut}
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

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Menu items</Text>
            <Text style={styles.menuHint}>
              Add, edit, or remove dishes. Live orders are on the Dashboard tab only.
            </Text>
            {menuLoading ? (
              <ActivityIndicator color={PRIMARY} style={{ marginTop: 12 }} />
            ) : menu.length === 0 ? (
              <Text style={styles.empty}>No menu items yet. Tap + to add your first dish.</Text>
            ) : (
              menu.map((row) => (
                <View key={row.id} style={styles.menuDishCard}>
                  {row.image ? (
                    <Image
                      source={{
                        uri:
                          menuImageDisplayUri(row.image, row.updatedAtMs) ?? row.image,
                      }}
                      style={styles.menuDishImage}
                    />
                  ) : (
                    <View style={[styles.menuDishImage, styles.menuDishImagePh]}>
                      <Ionicons name="fast-food-outline" size={36} color="#7D8493" />
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

          {uid ? (
            <Text style={styles.footerHint}>
              Public menu:{' '}
              <Text
                style={styles.footerLink}
                onPress={() =>
                  router.push(`/restaurant-menu/${encodeURIComponent(uid)}` as never)
                }
              >
                Preview menu link
              </Text>
            </Text>
          ) : null}
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
              <MenuItemImagePicker
                displayUri={menuItemImage.displayUri}
                isPicking={menuItemImage.isPicking}
                isUploading={menuItemImage.isUploading}
                uploadProgress={menuItemImage.uploadProgress}
                disabled={savingItem}
                onPick={() => void menuItemImage.pickImage()}
              />
              <Text style={styles.inputLabel}>Name</Text>
              <AppTextInput
                style={styles.input}
                value={itemName}
                onChangeText={setItemName}
                placeholder="Item name"
                placeholderTextColor="#7D8493"
              />
              <Text style={styles.inputLabel}>Price (USD)</Text>
              <AppTextInput
                style={styles.input}
                value={itemPrice}
                onChangeText={setItemPrice}
                placeholder="0.00"
                placeholderTextColor="#7D8493"
                keyboardType="decimal-pad"
              />
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={saveMenuItem}
                disabled={savingItem || !menuItemImage.canSave}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#B7BDC9',
    backgroundColor: CARD,
  },
  screenTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  topLink: { fontSize: 15, fontWeight: '700', color: PRIMARY },
  scroll: { padding: 16, paddingBottom: 120 },
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  sectionLabel: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', marginBottom: 12 },
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
  },
  menuDishImage: { width: '100%', height: 140, backgroundColor: '#B7BDC9' },
  menuDishImagePh: { alignItems: 'center', justifyContent: 'center' },
  menuDishBody: { padding: 14 },
  menuDishText: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
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
  footerHint: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 8 },
  footerLink: { color: PRIMARY, fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: 18,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    zIndex: 40,
  },
  modalSafe: { flex: 1, backgroundColor: PAGE },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#B7BDC9',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  modalClose: { fontSize: 16, fontWeight: '700', color: PRIMARY },
  modalBody: { padding: 16, paddingBottom: 32 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#64748b', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#B7BDC9',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111',
    marginBottom: 12,
    backgroundColor: '#fafafa',
  },
  primaryBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
