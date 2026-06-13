import { AccountLocationPicker } from '@/components/location/AccountLocationPicker';
import { LOCATION_PALETTE_DARK } from '@/components/location/locationPalette';
import { useDriverProfileIdentity } from '@/hooks/useDriverProfileIdentity';
import { logoutAndResetSession, POST_LOGOUT_ROUTE } from '@/lib/auth/logoutSession';
import { uploadAndPersistDriverProfilePhoto } from '@/lib/driverProfilePhoto';
import { DRIVER_ROUTES } from '@/lib/navigationPaths';
import { useAuth } from '@/services/AuthContext';
import { ensureAuthReady } from '@/services/firebase';
import {
  ImagePickerPermissionError,
  pickImageFromLibrary,
} from '@/services/imagePicker';
import { getUserFriendlyError, showUserError } from '@/services/errors';
import { logError } from '@/utils/errorLogger';
import { showError, showSuccess } from '@/utils/toast';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const AVATAR_SIZE = 96;

/** Driver profile tab — unique route name avoids collision with `app/(tabs)/profile.tsx`. */
export default function DriverProfileTab() {
  const { user, signOutUser, reloadAuthUser } = useAuth();
  const uid = user?.uid ?? null;
  const identity = useDriverProfileIdentity(uid);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const handleSignOut = useCallback(async () => {
    await logoutAndResetSession(signOutUser);
    router.replace(POST_LOGOUT_ROUTE as never);
  }, [signOutUser]);

  const handleAvatarPress = useCallback(async () => {
    if (!uid || uploadingPhoto) return;
    await ensureAuthReady();
    let imageUri: string | null;
    try {
      imageUri = await pickImageFromLibrary({ quality: 0.7 });
    } catch (error) {
      if (error instanceof ImagePickerPermissionError) {
        showUserError(error);
        return;
      }
      logError(error);
      showError('Could not open your photo library.');
      return;
    }
    if (!imageUri) return;

    setUploadingPhoto(true);
    try {
      await uploadAndPersistDriverProfilePhoto(uid, imageUri);
      try {
        await reloadAuthUser();
      } catch (reloadError) {
        logError(reloadError);
      }
      showSuccess('Profile photo updated.');
    } catch (error) {
      logError(error);
      showError(getUserFriendlyError(error));
    } finally {
      setUploadingPhoto(false);
    }
  }, [reloadAuthUser, uid, uploadingPhoto]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.profileHeader}>
          <Pressable
            style={styles.avatarButton}
            onPress={() => void handleAvatarPress()}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
          >
            {uploadingPhoto ? (
              <View style={styles.avatarFallback}>
                <ActivityIndicator color="#00C853" />
              </View>
            ) : identity.photoURL ? (
              <Image
                source={{ uri: identity.photoURL }}
                style={styles.avatarImage}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={styles.avatarFallback}>
                <Ionicons name="person" size={44} color="#86EFAC" />
              </View>
            )}
          </Pressable>
          <Text style={styles.driverName}>
            {identity.loading ? '…' : identity.displayName}
          </Text>
          <Text style={styles.driverPhone}>
            {identity.loading ? '…' : identity.phoneDisplay}
          </Text>
        </View>

        <AccountLocationPicker
          role="driver"
          accountId={uid}
          palette={LOCATION_PALETTE_DARK}
          title="Home Base"
        />

        <Pressable
          style={styles.btn}
          onPress={() => router.push(DRIVER_ROUTES.accountSettings as never)}
        >
          <Text style={styles.btnText}>Account Settings</Text>
        </Pressable>
        <Pressable style={styles.signOutBtn} onPress={() => void handleSignOut()}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#1a1a2e' },
  scroll: { padding: 20, paddingBottom: 40, gap: 4 },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
    paddingTop: 8,
  },
  avatarButton: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(0, 200, 83, 0.45)',
    backgroundColor: '#132B1E',
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#132B1E',
  },
  driverName: {
    marginTop: 14,
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  driverPhone: {
    marginTop: 6,
    color: '#9CA3AF',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  btn: {
    marginTop: 20,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#22223A',
    borderWidth: 1,
    borderColor: '#3A3A5A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: '#E5E7EB', fontWeight: '700', fontSize: 15 },
  signOutBtn: {
    marginTop: 12,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#3B1C1C',
    borderWidth: 1,
    borderColor: '#7F1D1D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutText: { color: '#FCA5A5', fontWeight: '700', fontSize: 15 },
});
