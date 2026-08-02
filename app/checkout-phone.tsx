/**
 * Checkout phone editor — saves to users/{uid}.phone / phoneNumber / whatsapp.
 */
import { AppTextInput } from '@/components/AppTextInput';
import { CK } from '@/constants/checkoutUi';
import {
  displayFromStoredProfilePhone,
  formatProfileWhatsAppDisplay,
  isCompleteNaProfilePhone,
  isIncompleteNaProfilePhone,
  isProfilePhoneStorageEmpty,
  profilePhoneForFirestore,
  profileWhatsAppOnChangeText,
} from '@/lib/profileWhatsAppPhone';
import { isRegisteredAuthUser } from '@/lib/authSession';
import {
  fetchCheckoutCustomerSnapshot,
  saveCheckoutPhone,
} from '@/services/checkoutCustomerPrefs';
import { useAuth } from '@/services/AuthContext';
import { getUserFriendlyError } from '@/services/errors/userFriendlyErrors';
import { showError, showSuccess } from '@/utils/toast';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CheckoutPhoneScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const uid = isRegisteredAuthUser(user) ? user!.uid : null;
  const [phone, setPhone] = useState('+1 ');
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
        if (!cancelled) {
          setPhone(displayFromStoredProfilePhone(snap.phone || snap.phoneNumber));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const onSave = async () => {
    if (!uid || saving) return;
    const digits = profilePhoneForFirestore(phone);
    if (isProfilePhoneStorageEmpty(digits)) {
      showError('Enter a phone number so the driver can reach you.');
      return;
    }
    if (!isCompleteNaProfilePhone(phone) || isIncompleteNaProfilePhone(phone)) {
      showError('Enter a complete phone number (10 digits after +1).');
      return;
    }
    setSaving(true);
    try {
      const formatted = formatProfileWhatsAppDisplay(digits);
      await saveCheckoutPhone(uid, formatted);
      showSuccess('Phone number saved');
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
        <Text style={styles.title}>Phone Number</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <ActivityIndicator color={CK.accent} style={{ marginTop: 40 }} />
      ) : !uid ? (
        <Text style={styles.muted}>Sign in to edit your phone number.</Text>
      ) : (
        <View style={styles.body}>
          <Text style={styles.help}>
            Drivers use this number if they need to reach you at dropoff.
          </Text>
          <AppTextInput
            value={phone}
            onChangeText={(t) => setPhone(profileWhatsAppOnChangeText(t))}
            keyboardType="phone-pad"
            placeholder="+1 416 555 0199"
            autoFocus
          />
          <Pressable
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={onSave}
            disabled={saving}
          >
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
          </Pressable>
        </View>
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
  body: { padding: 20, gap: 12 },
  help: { color: CK.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 4 },
  muted: { color: CK.textSecondary, padding: 20 },
  saveBtn: {
    marginTop: 12,
    backgroundColor: CK.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
