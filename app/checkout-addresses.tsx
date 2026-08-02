/**
 * Checkout address book — choose / add / edit / delete / set default.
 * Uses the existing `/location` picker for add & edit, then syncs into Firestore.
 */
import { CK } from '@/constants/checkoutUi';
import { isRegisteredAuthUser } from '@/lib/authSession';
import {
  defaultCheckoutAddress,
  deleteCheckoutAddress,
  fetchCheckoutCustomerSnapshot,
  setDefaultCheckoutAddress,
  upsertCheckoutAddress,
} from '@/services/checkoutCustomerPrefs';
import {
  setPendingCheckoutAddressEdit,
  takePendingCheckoutAddressEdit,
} from '@/services/checkoutAddressEditSession';
import { useAuth } from '@/services/AuthContext';
import { fetchSavedLocationFromServer } from '@/services/location/savedLocationFirestore';
import type { CheckoutAddressBookEntry } from '@/types/checkoutCustomerPrefs';
import { getUserFriendlyError } from '@/services/errors/userFriendlyErrors';
import { showError, showSuccess } from '@/utils/toast';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CheckoutAddressesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const uid = isRegisteredAuthUser(user) ? user!.uid : null;
  const [book, setBook] = useState<CheckoutAddressBookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!uid) {
      setBook([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const pendingEdit = takePendingCheckoutAddressEdit();
      if (pendingEdit) {
        const saved = await fetchSavedLocationFromServer('users', uid);
        if (saved.location) {
          const next = await upsertCheckoutAddress(uid, {
            id: pendingEdit.mode === 'edit' ? pendingEdit.id : undefined,
            location: saved.location,
            label: pendingEdit.mode === 'add' ? 'Saved address' : undefined,
            makeDefault: true,
          });
          setBook(next);
          return;
        }
      }
      const snap = await fetchCheckoutCustomerSnapshot(uid);
      // Seed book from profile location when empty.
      if (snap.addressBook.length === 0) {
        const saved = await fetchSavedLocationFromServer('users', uid);
        if (saved.location) {
          const next = await upsertCheckoutAddress(uid, {
            location: saved.location,
            label: 'Home',
            makeDefault: true,
          });
          setBook(next);
          return;
        }
      }
      setBook(snap.addressBook);
    } catch (e) {
      showError(getUserFriendlyError(e));
      try {
        const snap = await fetchCheckoutCustomerSnapshot(uid);
        setBook(snap.addressBook);
      } catch {
        /* ignore */
      }
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const openPicker = (editId: string | null) => {
    setPendingCheckoutAddressEdit(
      editId ? { mode: 'edit', id: editId } : { mode: 'add' },
    );
    router.push('/location' as never);
  };

  const onSelect = async (id: string) => {
    if (!uid || busy) return;
    setBusy(true);
    try {
      const next = await setDefaultCheckoutAddress(uid, id);
      setBook(next);
      showSuccess('Delivery address updated');
      router.back();
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = (entry: CheckoutAddressBookEntry) => {
    if (!uid) return;
    Alert.alert('Delete address', `Remove ${entry.address}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              const next = await deleteCheckoutAddress(uid, entry.id);
              setBook(next);
              showSuccess('Address deleted');
            } catch (e) {
              showError(getUserFriendlyError(e));
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  const selected = defaultCheckoutAddress(book);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={CK.text} />
        </Pressable>
        <Text style={styles.title}>Addresses</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <ActivityIndicator color={CK.accent} style={{ marginTop: 40 }} />
      ) : !uid ? (
        <Text style={styles.muted}>Sign in to manage delivery addresses.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Pressable style={styles.addBtn} onPress={() => openPicker(null)}>
            <MaterialIcons name="add" size={20} color="#fff" />
            <Text style={styles.addText}>Add new address</Text>
          </Pressable>

          {book.length === 0 ? (
            <Text style={styles.muted}>
              No saved addresses yet. Add one to use at checkout.
            </Text>
          ) : (
            book.map((entry) => {
              const isDefault = entry.id === selected?.id;
              return (
                <View key={entry.id} style={styles.card}>
                  <Pressable
                    onPress={() => void onSelect(entry.id)}
                    disabled={busy}
                    style={styles.cardMain}
                  >
                    <View style={styles.cardTop}>
                      <Text style={styles.label}>{entry.label}</Text>
                      {isDefault ? (
                        <Text style={styles.badge}>Default</Text>
                      ) : null}
                    </View>
                    <Text style={styles.address}>{entry.address}</Text>
                    <Text style={styles.hint}>
                      {isDefault ? 'Selected for delivery' : 'Tap to use for delivery'}
                    </Text>
                  </Pressable>
                  <View style={styles.actions}>
                    <Pressable
                      onPress={() => openPicker(entry.id)}
                      style={styles.actionBtn}
                    >
                      <Text style={styles.actionText}>Edit</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => onDelete(entry)}
                      style={styles.actionBtn}
                    >
                      <Text style={[styles.actionText, styles.danger]}>Delete</Text>
                    </Pressable>
                    {!isDefault ? (
                      <Pressable
                        onPress={() => void onSelect(entry.id)}
                        style={styles.actionBtn}
                      >
                        <Text style={styles.actionText}>Set default</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CK.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CK.headerHairline,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: CK.text, fontSize: 17, fontWeight: '800' },
  body: { padding: 16, paddingBottom: 48, gap: 12 },
  muted: { color: CK.textSecondary, fontSize: 14, lineHeight: 20 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: CK.accent,
    borderRadius: 14,
    paddingVertical: 14,
  },
  addText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  card: {
    backgroundColor: CK.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  cardMain: { padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  label: { color: CK.text, fontWeight: '800', fontSize: 14 },
  badge: {
    color: CK.accent,
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  address: { color: CK.textSecondary, fontSize: 14, lineHeight: 20 },
  hint: { color: '#7D8493', fontSize: 12, marginTop: 6 },
  actions: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  actionBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  actionText: { color: '#C4B5FD', fontWeight: '700', fontSize: 13 },
  danger: { color: '#F87171' },
});
