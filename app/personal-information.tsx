import { AppTextInput } from '@/components/AppTextInput';
import {
  KEYBOARD_TOOLBAR_NATIVE_ID,
  KeyboardToolbar,
} from '@/components/KeyboardToolbar';
import { theme } from '@/constants/theme';
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
import { useAuth } from '@/services/AuthContext';
import { auth, db, ensureAuthReady } from '@/services/firebase';
import {
  ImagePickerPermissionError,
  pickImageFromLibrary,
} from '@/services/imagePicker';
import { profileFirestoreOp } from '@/services/profileFirestoreLog';
import { uploadProfilePhoto } from '@/services/profilePhoto';
import { getUserFriendlyError } from '@/services/errors/userFriendlyErrors';
import { moderateUserContent } from '@/utils/contentModeration';
import { logError } from '@/utils/errorLogger';
import { showError, showSuccess } from '@/utils/toast';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { updateProfile, type User } from '@firebase/auth';
import { Image } from 'expo-image';
import { goBackFromProfileScreen } from '@/lib/profileBack';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  type DocumentData,
} from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

const DEFAULT_AVATAR = require('../assets/default-avatar.png') as number;

const PAL = {
  bg: '#000000',
  surface: '#171923',
  surfaceMuted: '#1E2230',
  text: '#FFFFFF',
  textSecondary: '#B7BDC9',
  textTertiary: '#7D8493',
  border: 'rgba(255,255,255,0.08)',
  inputBg: '#1C2030',
  primary: '#A855F7',
  onPrimary: '#FFFFFF',
  success: '#22C55E',
  danger: '#EF4444',
};

function resolvePhotoURL(
  data: DocumentData | undefined,
  authUser: User | null,
): string | null {
  const keys = ['photo', 'photoURL', 'avatar'] as const;
  for (const key of keys) {
    const value = data?.[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  const authUrl = authUser?.photoURL;
  if (typeof authUrl === 'string' && authUrl.trim().length > 0) {
    return authUrl.trim();
  }
  return null;
}

export default function PersonalInformationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, reloadAuthUser } = useAuth();

  const registered = isRegisteredAuthUser(user);
  const uid = registered ? (user?.uid ?? null) : null;

  const [displayNameInput, setDisplayNameInput] = useState('');
  const [phone, setPhone] = useState('');
  const [emailFromFirestore, setEmailFromFirestore] = useState<string | null>(
    null,
  );
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [initialDisplayName, setInitialDisplayName] = useState('');
  const [initialPhone, setInitialPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [focusedInputIndex, setFocusedInputIndex] = useState<number | null>(
    null,
  );

  const feedbackClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!uid || user?.isAnonymous) {
      setLoading(false);
      return undefined;
    }
    const userRef = doc(db, 'users', uid);
    let cancelled = false;

    const applyUserDoc = (data: DocumentData | undefined) => {
      const authUser = auth.currentUser;
      const nameFromDoc =
        typeof data?.name === 'string' ? data.name.trim() : '';
      const displayFromDoc =
        typeof data?.displayName === 'string' ? data.displayName.trim() : '';
      const authDisplay = authUser?.displayName?.trim() ?? '';
      const resolvedName = nameFromDoc || displayFromDoc || authDisplay;
      const emailRaw = data?.email;
      const email =
        typeof emailRaw === 'string' && emailRaw.trim().length > 0
          ? emailRaw.trim()
          : null;
      const storedPhone =
        typeof data?.phone === 'string' && data.phone.trim().length > 0
          ? data.phone.trim()
          : '';
      const phoneDisp = displayFromStoredProfilePhone(storedPhone);

      setDisplayNameInput(resolvedName);
      setInitialDisplayName(resolvedName);
      setEmailFromFirestore(email);
      setPhotoURL(resolvePhotoURL(data, authUser));
      setPhone(phoneDisp);
      setInitialPhone(phoneDisp);
      setLoading(false);
    };

    setLoading(true);
    void (async () => {
      try {
        const snap = await getDoc(userRef);
        if (cancelled) return;
        applyUserDoc(snap.exists() ? (snap.data() as DocumentData) : undefined);
      } catch {
        if (cancelled) return;
        applyUserDoc(undefined);
      }
    })();

    const unsubscribe = onSnapshot(
      userRef,
      (snap) => {
        if (cancelled) return;
        applyUserDoc(snap.exists() ? (snap.data() as DocumentData) : undefined);
      },
      () => {
        if (cancelled) return;
        applyUserDoc(undefined);
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [uid, user?.isAnonymous]);

  useEffect(() => {
    return () => {
      if (feedbackClearRef.current != null) {
        clearTimeout(feedbackClearRef.current);
      }
    };
  }, []);

  const emailLabel = emailFromFirestore ?? user?.email ?? 'Not set';

  const canUpdate =
    !saving &&
    displayNameInput.trim().length > 0 &&
    (displayNameInput.trim() !== initialDisplayName.trim() ||
      phone.trim() !== initialPhone.trim());

  const updateButtonLabel = saving
    ? 'Updating…'
    : saved
      ? 'Updated ✓'
      : 'Update';

  const handleUpdate = async () => {
    if (saving || !uid) return;
    const trimmed = displayNameInput.trim();

    const phoneDigits = profilePhoneForFirestore(phone);
    const initialDigits = profilePhoneForFirestore(initialPhone);
    const phoneChanged = phoneDigits !== initialDigits;
    const phoneTreatEmpty = isProfilePhoneStorageEmpty(phone);

    if (phoneChanged && !phoneTreatEmpty && !isCompleteNaProfilePhone(phone)) {
      showError(
        'Enter a complete WhatsApp number (10 digits after +1), or clear the field to only +1.',
      );
      return;
    }

    const trimmedPhoneDigits = phoneChanged
      ? phoneTreatEmpty
        ? ''
        : phoneDigits
      : isProfilePhoneStorageEmpty(initialDigits)
        ? ''
        : initialDigits;
    const phoneForFirestore = trimmedPhoneDigits
      ? formatProfileWhatsAppDisplay(trimmedPhoneDigits)
      : '';

    const currentUser = auth.currentUser;
    if (!currentUser) {
      showError('Not signed in. Please sign in again.');
      return;
    }
    if (!trimmed) {
      showError('Display name cannot be empty.');
      return;
    }
    const mod = moderateUserContent(trimmed, { maxLength: 80 });
    if (!mod.ok) {
      showError(mod.reason);
      return;
    }

    if (feedbackClearRef.current != null) {
      clearTimeout(feedbackClearRef.current);
      feedbackClearRef.current = null;
    }
    setSaving(true);
    setSaved(false);
    try {
      const userRef = doc(db, 'users', uid);
      await updateProfile(currentUser, { displayName: mod.text });
      await currentUser.reload();
      await profileFirestoreOp(
        {
          file: 'app/personal-information.tsx',
          operation: 'setDoc(merge)',
          path: `users/${uid}`,
        },
        () =>
          setDoc(
            userRef,
            {
              displayName: mod.text,
              name: mod.text,
              avatar: currentUser.photoURL ?? null,
              phone: phoneForFirestore,
              whatsapp: phoneForFirestore,
              dateOfBirth: deleteField(),
            },
            { merge: true },
          ),
      );
      setDisplayNameInput(mod.text);
      setInitialDisplayName(mod.text);
      const nextDisp = displayFromStoredProfilePhone(phoneForFirestore);
      setPhone(nextDisp);
      setInitialPhone(nextDisp);
      setSaved(true);
      showSuccess('Personal info updated');
      feedbackClearRef.current = setTimeout(() => {
        setSaved(false);
        feedbackClearRef.current = null;
      }, 2000);
    } catch (err) {
      logError(err);
      showError(getUserFriendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const handlePickPhoto = async () => {
    if (!uid || uploadingPhoto) return;
    await ensureAuthReady();
    const currentUser = auth.currentUser;
    if (!currentUser) {
      showError('Authentication is still initializing.');
      return;
    }
    let imageUri: string | null;
    try {
      imageUri = await pickImageFromLibrary({ quality: 0.7 });
    } catch (e) {
      if (e instanceof ImagePickerPermissionError) {
        showError(getUserFriendlyError(e));
        return;
      }
      if (e instanceof Error && e.message === 'PICKER_LAUNCH_FAILED') {
        showError('Could not open your photo library. Please try again.');
        return;
      }
      logError(e);
      showError('Could not open your photo library. Please try again.');
      return;
    }
    if (!imageUri) return;

    setUploadingPhoto(true);
    try {
      const downloadURL = await uploadProfilePhoto(imageUri);
      await updateProfile(currentUser, { photoURL: downloadURL });
      const userRef = doc(db, 'users', uid);
      await profileFirestoreOp(
        {
          file: 'app/personal-information.tsx',
          operation: 'setDoc(merge)',
          path: `users/${uid}`,
        },
        () =>
          setDoc(
            userRef,
            { photoURL: downloadURL, avatar: downloadURL, photo: downloadURL },
            { merge: true },
          ),
      );
      try {
        await reloadAuthUser();
      } catch (e) {
        logError(e);
      }
      setPhotoURL(downloadURL);
      showSuccess('Your profile picture has been saved.');
    } catch (e) {
      logError(e);
      showError(getUserFriendlyError(e));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const styles = useMemo(() => createStyles(), []);

  if (!uid) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <StatusBar style="light" />
        <Text style={styles.bodyMuted}>
          Sign in to manage your personal information.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="light" />
      <KeyboardToolbar focusedIndex={focusedInputIndex} totalInputs={2} />

      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => goBackFromProfileScreen(router)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <MaterialIcons name="arrow-back" size={24} color={PAL.text} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Personal Information</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={[styles.centered, { flex: 1 }]}>
          <ActivityIndicator size="large" color={PAL.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom + 40, 56) },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.avatarSection}>
            <TouchableOpacity
              style={styles.avatarWrap}
              onPress={() => void handlePickPhoto()}
              activeOpacity={0.85}
              disabled={uploadingPhoto}
              accessibilityLabel="Change profile photo"
            >
              {uploadingPhoto ? (
                <ActivityIndicator size="large" color={PAL.primary} />
              ) : (
                <Image
                  key={photoURL ?? 'default'}
                  source={photoURL ? { uri: photoURL } : DEFAULT_AVATAR}
                  style={styles.avatarImage}
                  contentFit="cover"
                  transition={200}
                  cachePolicy="memory-disk"
                />
              )}
              <View style={styles.avatarBadge}>
                <MaterialIcons name="photo-camera" size={16} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void handlePickPhoto()}
              disabled={uploadingPhoto}
            >
              <Text style={styles.changePhotoText}>Change photo</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Display name</Text>
            <AppTextInput
              style={styles.input}
              value={displayNameInput}
              onChangeText={setDisplayNameInput}
              placeholder="Your name"
              placeholderTextColor={PAL.textTertiary}
              editable={!saving}
              inputAccessoryViewID={
                Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
              }
              onFocus={() => setFocusedInputIndex(0)}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.readonlyField}>
              <MaterialIcons
                name="mail-outline"
                size={20}
                color={PAL.textSecondary}
              />
              <Text style={styles.readonlyValue} numberOfLines={1}>
                {emailLabel}
              </Text>
              <MaterialIcons name="lock" size={16} color={PAL.textTertiary} />
            </View>
            <Text style={styles.hint}>Read-only — managed by your login</Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Phone number</Text>
            <View style={styles.phoneFieldShell}>
              <MaterialCommunityIcons
                name="whatsapp"
                size={24}
                color="#25D366"
                style={styles.phoneFieldIcon}
              />
              <AppTextInput
                style={styles.phoneFieldInput}
                value={phone}
                onChangeText={(t) => setPhone(profileWhatsAppOnChangeText(t))}
                placeholder="+1 437 000 0000"
                placeholderTextColor={PAL.textTertiary}
                keyboardType="phone-pad"
                editable={!saving}
                inputAccessoryViewID={
                  Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
                }
                onFocus={() => setFocusedInputIndex(1)}
              />
            </View>
            <Text style={styles.hint}>
              Used only to coordinate pickup
              {isIncompleteNaProfilePhone(phone)
                ? ' · Enter all 10 digits after +1.'
                : ''}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.primaryButton,
              saved && { backgroundColor: PAL.success },
              !canUpdate && !saved && styles.buttonDisabled,
            ]}
            disabled={!canUpdate}
            onPress={() => void handleUpdate()}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator size="small" color={PAL.onPrimary} />
            ) : (
              <Text style={styles.primaryButtonText}>{updateButtonLabel}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function createStyles() {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: PAL.bg,
    },
    centered: {
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: PAL.border,
    },
    backBtn: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    topBarTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 18,
      fontWeight: '800',
      color: PAL.text,
      letterSpacing: -0.3,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 24,
    },
    avatarSection: {
      alignItems: 'center',
      marginBottom: 32,
      gap: 12,
    },
    avatarWrap: {
      width: 112,
      height: 112,
      borderRadius: 56,
      backgroundColor: PAL.surfaceMuted,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.18)',
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'visible',
    },
    avatarImage: {
      width: 112,
      height: 112,
      borderRadius: 56,
    },
    avatarBadge: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: PAL.primary,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 3,
      borderColor: PAL.bg,
    },
    changePhotoText: {
      fontSize: 15,
      fontWeight: '700',
      color: PAL.primary,
      letterSpacing: -0.2,
    },
    fieldGroup: {
      marginBottom: 24,
    },
    label: {
      fontSize: 13,
      fontWeight: '700',
      color: PAL.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 10,
    },
    input: {
      borderWidth: 1,
      borderColor: PAL.border,
      borderRadius: theme.radius.input,
      padding: 16,
      fontSize: 16,
      color: PAL.text,
      backgroundColor: PAL.inputBg,
    },
    readonlyField: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: PAL.border,
      borderRadius: theme.radius.input,
      padding: 16,
      backgroundColor: PAL.surface,
    },
    readonlyValue: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      color: PAL.text,
    },
    phoneFieldShell: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: PAL.border,
      borderRadius: theme.radius.input,
      backgroundColor: PAL.inputBg,
      paddingHorizontal: 14,
      minHeight: 54,
    },
    phoneFieldIcon: {
      marginRight: 4,
    },
    phoneFieldInput: {
      flex: 1,
      paddingVertical: 14,
      paddingLeft: 6,
      fontSize: 16,
      color: PAL.text,
    },
    hint: {
      fontSize: 12,
      fontWeight: '500',
      color: PAL.textTertiary,
      marginTop: 8,
      lineHeight: 17,
    },
    primaryButton: {
      backgroundColor: PAL.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 54,
      marginTop: 8,
    },
    primaryButtonText: {
      color: PAL.onPrimary,
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    buttonDisabled: {
      opacity: 0.55,
    },
    bodyMuted: {
      fontSize: 14,
      color: PAL.textSecondary,
      lineHeight: 20,
      textAlign: 'center',
    },
  });
}
