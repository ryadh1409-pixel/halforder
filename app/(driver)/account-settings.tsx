import { AppTextInput } from '@/components/AppTextInput';
import {
  displayFromStoredProfilePhone,
  formatProfileWhatsAppDisplay,
  isCompleteNaProfilePhone,
  isProfilePhoneStorageEmpty,
  profilePhoneForFirestore,
  profileWhatsAppOnChangeText,
} from '@/lib/profileWhatsAppPhone';
import { theme, Colors } from '@/constants/theme';
import { useDriverProfileIdentity } from '@/hooks/useDriverProfileIdentity';
import { useAuth } from '@/services/AuthContext';
import { auth, db, ensureAuthReady } from '@/services/firebase';
import { profileFirestoreOp } from '@/services/profileFirestoreLog';
import { moderateUserContent } from '@/utils/contentModeration';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { logError } from '@/utils/errorLogger';
import { showError, showSuccess } from '@/utils/toast';
import { Ionicons } from '@expo/vector-icons';
import { updateProfile } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DriverAccountSettingsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const screenBackground = useMemo(
    () =>
      colorScheme === 'dark' ? Colors.dark.background : theme.colors.background,
    [colorScheme],
  );
  const palette = useMemo(
    () => ({
      text: isDark ? '#FFFFFF' : theme.colors.text,
      textMuted: isDark ? '#9CA3AF' : theme.colors.textMuted,
      inputBg: isDark ? '#22223A' : theme.colors.lightGray,
      inputBorder: isDark ? '#3A3A5A' : theme.colors.border,
      label: isDark ? '#D1FAE5' : theme.colors.textSlateDark,
    }),
    [isDark],
  );
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const identity = useDriverProfileIdentity(uid);

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const phoneHydratedRef = useRef(false);

  // Hydrate phone once when identity finishes loading — do not overwrite while editing.
  useEffect(() => {
    if (identity.loading) {
      phoneHydratedRef.current = false;
      return;
    }
    if (!phoneHydratedRef.current) {
      setDisplayName(identity.displayName);
      setPhone(
        identity.phoneRaw
          ? displayFromStoredProfilePhone(identity.phoneRaw)
          : '+1 ',
      );
      phoneHydratedRef.current = true;
    }
  }, [identity.loading, identity.displayName, identity.phoneRaw]);

  const handleSave = useCallback(async () => {
    if (!uid || saving) return;
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      showError('Display name cannot be empty.');
      return;
    }

    const nameMod = moderateUserContent(trimmedName, { maxLength: 80 });
    if (!nameMod.ok) {
      showError(nameMod.reason);
      return;
    }

    const phoneDigits = profilePhoneForFirestore(phone);
    const phoneTreatEmpty = isProfilePhoneStorageEmpty(phone);
    if (!phoneTreatEmpty && !isCompleteNaProfilePhone(phone)) {
      showError('Enter a complete phone number (10 digits after +1).');
      return;
    }
    const phoneForFirestore = phoneTreatEmpty
      ? ''
      : formatProfileWhatsAppDisplay(phoneDigits);

    await ensureAuthReady();
    const currentUser = auth.currentUser;
    if (!currentUser) {
      showError('Please sign in again.');
      return;
    }

    setSaving(true);
    try {
      await updateProfile(currentUser, { displayName: nameMod.text });
      await currentUser.reload();

      // Contact phone lives on Firestore (Auth phoneNumber requires SMS verification).
      await profileFirestoreOp(
        {
          file: 'app/(driver)/account-settings.tsx',
          operation: 'setDoc(merge)',
          path: `users/${uid}`,
        },
        () =>
          setDoc(
            doc(db, 'users', uid),
            {
              displayName: nameMod.text,
              name: nameMod.text,
              phone: phoneForFirestore,
              phoneNumber: phoneForFirestore || null,
              whatsapp: phoneForFirestore,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          ),
      );

      await profileFirestoreOp(
        {
          file: 'app/(driver)/account-settings.tsx',
          operation: 'setDoc(merge)',
          path: `drivers/${uid}`,
        },
        () =>
          setDoc(
            doc(db, 'drivers', uid),
            {
              name: nameMod.text,
              phone: phoneForFirestore || null,
              phoneNumber: phoneForFirestore || null,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          ),
      );

      phoneHydratedRef.current = true;
      setPhone(
        phoneForFirestore ? displayFromStoredProfilePhone(phoneForFirestore) : '+1 ',
      );
      showSuccess('Account settings saved.');
      router.back();
    } catch (error) {
      logError(error);
      showError(getUserFriendlyError(error));
    } finally {
      setSaving(false);
    }
  }, [displayName, phone, saving, uid]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: screenBackground }]} edges={['top']}>
      <View style={styles.headerRow}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={palette.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: palette.text }]}>Account Settings</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        style={styles.scrollView}
        keyboardShouldPersistTaps="handled"
      >
        {identity.loading ? (
          <ActivityIndicator color="#00C853" style={styles.loader} />
        ) : (
          <>
            <Text style={[styles.label, { color: palette.label }]}>Display name</Text>
            <AppTextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your name"
              placeholderTextColor={palette.textMuted}
              style={[
                styles.input,
                {
                  backgroundColor: palette.inputBg,
                  borderColor: palette.inputBorder,
                  color: palette.text,
                },
              ]}
              autoCapitalize="words"
            />

            <Text style={[styles.label, { color: palette.label }]}>Phone number</Text>
            <AppTextInput
              value={phone}
              onChangeText={(text) => setPhone(profileWhatsAppOnChangeText(text))}
              placeholder="+1 (555) 555-5555"
              placeholderTextColor={palette.textMuted}
              style={[
                styles.input,
                {
                  backgroundColor: palette.inputBg,
                  borderColor: palette.inputBorder,
                  color: palette.text,
                },
              ]}
              keyboardType="phone-pad"
            />
            <Text style={[styles.hint, { color: palette.textMuted }]}>
              Used for customer and restaurant contact during deliveries.
            </Text>

            <Pressable
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              disabled={saving}
              onPress={() => void handleSave()}
            >
              {saving ? (
                <ActivityIndicator color="#052e1b" />
              ) : (
                <Text style={styles.saveBtnText}>Save changes</Text>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollView: { flex: 1, backgroundColor: 'transparent' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  scroll: { padding: 20, paddingBottom: 40 },
  loader: { marginTop: 24 },
  label: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  hint: {
    fontSize: 13,
    marginTop: 8,
    lineHeight: 18,
  },
  saveBtn: {
    marginTop: 28,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#00C853',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#052e1b', fontWeight: '900', fontSize: 16 },
});
