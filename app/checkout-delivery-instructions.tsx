/**
 * Checkout delivery instructions editor — persists on users/{uid}.checkoutDeliveryPrefs.
 */
import { AppTextInput } from '@/components/AppTextInput';
import { CK } from '@/constants/checkoutUi';
import { isRegisteredAuthUser } from '@/lib/authSession';
import {
  fetchCheckoutCustomerSnapshot,
  saveCheckoutDeliveryPrefs,
} from '@/services/checkoutCustomerPrefs';
import { useAuth } from '@/services/AuthContext';
import {
  EMPTY_CHECKOUT_DELIVERY_PREFS,
  type CheckoutDeliveryHandoff,
  type CheckoutDeliveryPrefs,
} from '@/types/checkoutCustomerPrefs';
import { getUserFriendlyError } from '@/services/errors/userFriendlyErrors';
import { showError, showSuccess } from '@/utils/toast';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function HandoffChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipOn]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export default function CheckoutDeliveryInstructionsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const uid = isRegisteredAuthUser(user) ? user!.uid : null;
  const [prefs, setPrefs] = useState<CheckoutDeliveryPrefs>({
    ...EMPTY_CHECKOUT_DELIVERY_PREFS,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const snap = await fetchCheckoutCustomerSnapshot(uid);
        if (!cancelled) setPrefs(snap.deliveryPrefs);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const patch = (partial: Partial<CheckoutDeliveryPrefs>) =>
    setPrefs((p) => ({ ...p, ...partial }));

  const setHandoff = (value: CheckoutDeliveryHandoff) => {
    setPrefs((p) => ({
      ...p,
      handoff: p.handoff === value ? null : value,
    }));
  };

  const onSave = async () => {
    if (!uid || saving) return;
    setSaving(true);
    try {
      await saveCheckoutDeliveryPrefs(uid, prefs);
      showSuccess('Delivery instructions saved');
      router.back();
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={CK.text} />
        </Pressable>
        <Text style={styles.title}>Delivery Instructions</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <ActivityIndicator color={CK.accent} style={{ marginTop: 40 }} />
      ) : !uid ? (
        <Text style={styles.muted}>Sign in to edit delivery instructions.</Text>
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.section}>Handoff</Text>
          <View style={styles.chipRow}>
            <HandoffChip
              label="Leave at door"
              selected={prefs.handoff === 'leave_at_door'}
              onPress={() => setHandoff('leave_at_door')}
            />
            <HandoffChip
              label="Hand it to me"
              selected={prefs.handoff === 'hand_it_to_me'}
              onPress={() => setHandoff('hand_it_to_me')}
            />
          </View>

          <Text style={styles.label}>Apartment</Text>
          <AppTextInput
            value={prefs.apartment}
            onChangeText={(apartment) => patch({ apartment })}
            placeholder="e.g. 1204"
          />
          <Text style={styles.label}>Unit</Text>
          <AppTextInput
            value={prefs.unit}
            onChangeText={(unit) => patch({ unit })}
            placeholder="e.g. B"
          />
          <Text style={styles.label}>Floor</Text>
          <AppTextInput
            value={prefs.floor}
            onChangeText={(floor) => patch({ floor })}
            placeholder="e.g. 12"
          />
          <Text style={styles.label}>Buzzer</Text>
          <AppTextInput
            value={prefs.buzzer}
            onChangeText={(buzzer) => patch({ buzzer })}
            placeholder="e.g. 402"
          />
          <Text style={styles.label}>Gate code</Text>
          <AppTextInput
            value={prefs.gateCode}
            onChangeText={(gateCode) => patch({ gateCode })}
            placeholder="e.g. #1234"
          />
          <Text style={styles.label}>Additional notes</Text>
          <AppTextInput
            value={prefs.notes}
            onChangeText={(notes) => patch({ notes })}
            placeholder="Landmarks, building entry tips…"
            multiline
          />

          <Pressable
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={onSave}
            disabled={saving}
          >
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
          </Pressable>
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
  body: { padding: 20, paddingBottom: 48, gap: 6 },
  muted: { color: CK.textSecondary, padding: 20 },
  section: {
    color: CK.text,
    fontWeight: '800',
    fontSize: 15,
    marginBottom: 8,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.35)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipOn: { backgroundColor: CK.accent, borderColor: CK.accent },
  chipText: { color: '#C4B5FD', fontWeight: '700', fontSize: 13 },
  chipTextOn: { color: '#fff' },
  label: { color: '#C4B5FD', fontWeight: '600', marginTop: 10, marginBottom: 4 },
  saveBtn: {
    marginTop: 20,
    backgroundColor: CK.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
