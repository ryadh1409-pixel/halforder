import { AccountLocationPicker } from '@/components/location/AccountLocationPicker';
import { LOCATION_PALETTE_DARK } from '@/components/location/locationPalette';
import { AppTextInput } from '@/components/AppTextInput';
import { useDriverProfileIdentity } from '@/hooks/useDriverProfileIdentity';
import { logoutAndResetSession, POST_LOGOUT_ROUTE } from '@/lib/auth/logoutSession';
import { uploadAndPersistDriverProfilePhoto } from '@/lib/driverProfilePhoto';
import {
  formatVehicleMakeModel,
  normalizeVehicleForSave,
} from '@/lib/driverVehicle';
import {
  persistDriverVehicleInfo,
  uploadAndPersistDriverVehiclePhoto,
} from '@/lib/driverVehiclePhoto';
import { DRIVER_ROUTES } from '@/lib/navigationPaths';
import {
  displayFromStoredProfilePhone,
  formatProfileWhatsAppDisplay,
  isCompleteNaProfilePhone,
  isProfilePhoneStorageEmpty,
  profilePhoneForFirestore,
  profileWhatsAppOnChangeText,
} from '@/lib/profileWhatsAppPhone';
import { useAuth } from '@/services/AuthContext';
import { auth, db, ensureAuthReady } from '@/services/firebase';
import {
  ImagePickerPermissionError,
  pickImageFromLibrary,
} from '@/services/imagePicker';
import { profileFirestoreOp } from '@/services/profileFirestoreLog';
import { getUserFriendlyError, showUserError } from '@/services/errors';
import { moderateUserContent } from '@/utils/contentModeration';
import { logError } from '@/utils/errorLogger';
import { showError, showSuccess } from '@/utils/toast';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const AVATAR_SIZE = 96;
const VEHICLE_PHOTO_H = 140;

/** Driver profile tab — unique route name avoids collision with `app/(tabs)/profile.tsx`. */
export default function DriverProfileTab() {
  const { user, signOutUser, reloadAuthUser } = useAuth();
  const uid = user?.uid ?? null;
  const identity = useDriverProfileIdentity(uid);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingVehiclePhoto, setUploadingVehiclePhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [phoneDraft, setPhoneDraft] = useState('+1 ');
  const [makeDraft, setMakeDraft] = useState('');
  const [modelDraft, setModelDraft] = useState('');
  const [yearDraft, setYearDraft] = useState('');
  const [colorDraft, setColorDraft] = useState('');
  const [plateDraft, setPlateDraft] = useState('');
  const [vehiclePhotoDraft, setVehiclePhotoDraft] = useState<string | null>(null);
  const hydratedRef = useRef(false);
  const vehicleHydratedRef = useRef(false);

  useEffect(() => {
    if (identity.loading) {
      hydratedRef.current = false;
      vehicleHydratedRef.current = false;
      return;
    }
    if (!hydratedRef.current) {
      setNameDraft(
        identity.displayName !== 'Driver' ? identity.displayName : '',
      );
      setPhoneDraft(
        identity.phoneRaw
          ? displayFromStoredProfilePhone(identity.phoneRaw)
          : '+1 ',
      );
      hydratedRef.current = true;
    }
    if (!vehicleHydratedRef.current) {
      setMakeDraft(identity.vehicle.vehicleMake ?? '');
      setModelDraft(identity.vehicle.vehicleModel ?? '');
      setYearDraft(identity.vehicle.vehicleYear ?? '');
      setColorDraft(identity.vehicle.vehicleColor ?? '');
      setPlateDraft(identity.vehicle.licensePlate ?? '');
      setVehiclePhotoDraft(identity.vehicle.vehiclePhoto);
      vehicleHydratedRef.current = true;
    }
  }, [
    identity.loading,
    identity.displayName,
    identity.phoneRaw,
    identity.vehicle,
  ]);

  const profileDirty = useMemo(() => {
    if (identity.loading || !hydratedRef.current) return false;
    const savedName =
      identity.displayName && identity.displayName !== 'Driver'
        ? identity.displayName.trim()
        : '';
    const nameChanged = nameDraft.trim() !== savedName;
    const savedPhone = identity.phoneRaw
      ? profilePhoneForFirestore(identity.phoneRaw)
      : '';
    const phoneChanged =
      profilePhoneForFirestore(phoneDraft) !== savedPhone &&
      !(isProfilePhoneStorageEmpty(phoneDraft) && savedPhone === '');
    return nameChanged || phoneChanged;
  }, [
    identity.loading,
    identity.displayName,
    identity.phoneRaw,
    nameDraft,
    phoneDraft,
  ]);

  const vehicleDirty = useMemo(() => {
    if (identity.loading || !vehicleHydratedRef.current) return false;
    const v = identity.vehicle;
    return (
      makeDraft.trim() !== (v.vehicleMake ?? '') ||
      modelDraft.trim() !== (v.vehicleModel ?? '') ||
      yearDraft.trim() !== (v.vehicleYear ?? '') ||
      colorDraft.trim() !== (v.vehicleColor ?? '') ||
      plateDraft.trim().toUpperCase() !== (v.licensePlate ?? '') ||
      (vehiclePhotoDraft ?? null) !== (v.vehiclePhoto ?? null)
    );
  }, [
    identity.loading,
    identity.vehicle,
    makeDraft,
    modelDraft,
    yearDraft,
    colorDraft,
    plateDraft,
    vehiclePhotoDraft,
  ]);

  const vehiclePreviewLabel = useMemo(() => {
    return formatVehicleMakeModel({
      vehiclePhoto: vehiclePhotoDraft,
      vehicleMake: makeDraft.trim() || null,
      vehicleModel: modelDraft.trim() || null,
      vehicleYear: yearDraft.trim() || null,
      vehicleColor: colorDraft.trim() || null,
      licensePlate: plateDraft.trim() || null,
    });
  }, [vehiclePhotoDraft, makeDraft, modelDraft, yearDraft, colorDraft, plateDraft]);

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

  const handleVehiclePhotoPress = useCallback(async () => {
    if (!uid || uploadingVehiclePhoto) return;
    await ensureAuthReady();
    let imageUri: string | null;
    try {
      imageUri = await pickImageFromLibrary({ quality: 0.8 });
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

    setUploadingVehiclePhoto(true);
    try {
      const url = await uploadAndPersistDriverVehiclePhoto(uid, imageUri);
      setVehiclePhotoDraft(url);
      showSuccess('Vehicle photo updated.');
    } catch (error) {
      logError(error);
      showError(getUserFriendlyError(error));
    } finally {
      setUploadingVehiclePhoto(false);
    }
  }, [uid, uploadingVehiclePhoto]);

  const handleSave = useCallback(async () => {
    if (!uid || saving || !profileDirty) return;
    const trimmedName = nameDraft.trim();
    if (!trimmedName) {
      showError('Enter your name.');
      return;
    }

    const nameMod = moderateUserContent(trimmedName, { maxLength: 80 });
    if (!nameMod.ok) {
      showError(nameMod.reason);
      return;
    }

    const phoneTreatEmpty = isProfilePhoneStorageEmpty(phoneDraft);
    if (!phoneTreatEmpty && !isCompleteNaProfilePhone(phoneDraft)) {
      showError('Enter a complete phone number (10 digits after +1).');
      return;
    }
    const phoneForFirestore = phoneTreatEmpty
      ? ''
      : formatProfileWhatsAppDisplay(profilePhoneForFirestore(phoneDraft));

    await ensureAuthReady();
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.uid !== uid) {
      showError('Please sign in again.');
      return;
    }

    setSaving(true);
    try {
      await updateProfile(currentUser, { displayName: nameMod.text });
      try {
        await currentUser.reload();
      } catch (reloadError) {
        logError(reloadError);
      }

      await profileFirestoreOp(
        {
          file: 'app/(driver)/driver-profile.tsx',
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
          file: 'app/(driver)/driver-profile.tsx',
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

      setNameDraft(nameMod.text);
      setPhoneDraft(
        phoneForFirestore ? displayFromStoredProfilePhone(phoneForFirestore) : '+1 ',
      );
      hydratedRef.current = true;
      showSuccess('Profile saved.');
    } catch (error) {
      logError(error);
      showError(getUserFriendlyError(error));
    } finally {
      setSaving(false);
    }
  }, [nameDraft, phoneDraft, profileDirty, saving, uid]);

  const handleSaveVehicle = useCallback(async () => {
    if (!uid || savingVehicle || !vehicleDirty) return;
    if (yearDraft.trim() && !/^\d{4}$/.test(yearDraft.trim())) {
      showError('Enter a 4-digit vehicle year.');
      return;
    }

    await ensureAuthReady();
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.uid !== uid) {
      showError('Please sign in again.');
      return;
    }

    setSavingVehicle(true);
    try {
      const payload = normalizeVehicleForSave({
        vehiclePhoto: vehiclePhotoDraft,
        vehicleMake: makeDraft,
        vehicleModel: modelDraft,
        vehicleYear: yearDraft,
        vehicleColor: colorDraft,
        licensePlate: plateDraft,
      });
      await persistDriverVehicleInfo(uid, payload);
      setMakeDraft(payload.vehicleMake ?? '');
      setModelDraft(payload.vehicleModel ?? '');
      setYearDraft(payload.vehicleYear ?? '');
      setColorDraft(payload.vehicleColor ?? '');
      setPlateDraft(payload.licensePlate ?? '');
      setVehiclePhotoDraft(payload.vehiclePhoto);
      vehicleHydratedRef.current = true;
      showSuccess('Vehicle information saved.');
    } catch (error) {
      logError(error);
      showError(getUserFriendlyError(error));
    } finally {
      setSavingVehicle(false);
    }
  }, [
    uid,
    savingVehicle,
    vehicleDirty,
    vehiclePhotoDraft,
    makeDraft,
    modelDraft,
    yearDraft,
    colorDraft,
    plateDraft,
  ]);

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

          <Text style={styles.fieldLabel}>Driver Name</Text>
          <AppTextInput
            style={styles.profileInput}
            value={identity.loading ? '' : nameDraft}
            onChangeText={setNameDraft}
            placeholder="Your name"
            placeholderTextColor="#7D8493"
            autoCapitalize="words"
            editable={!identity.loading && !saving}
          />

          <Text style={styles.fieldLabel}>Phone Number</Text>
          <AppTextInput
            style={styles.profileInput}
            value={identity.loading ? '' : phoneDraft}
            onChangeText={(text) => setPhoneDraft(profileWhatsAppOnChangeText(text))}
            placeholder="+1 (555) 555-5555"
            placeholderTextColor="#7D8493"
            keyboardType="phone-pad"
            editable={!identity.loading && !saving}
          />

          {profileDirty ? (
            <Pressable
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              disabled={saving}
              onPress={() => void handleSave()}
            >
              {saving ? (
                <ActivityIndicator color="#052e1b" />
              ) : (
                <Text style={styles.saveBtnText}>Save</Text>
              )}
            </Pressable>
          ) : null}
        </View>

        <View style={styles.vehicleCard}>
          <Text style={styles.vehicleCardTitle}>Vehicle Information</Text>
          <Text style={styles.vehicleCardSub}>
            Customers and admins see this while tracking your deliveries
          </Text>

          <Pressable
            style={styles.vehiclePhotoBtn}
            onPress={() => void handleVehiclePhotoPress()}
            accessibilityRole="button"
            accessibilityLabel="Upload vehicle photo"
          >
            {uploadingVehiclePhoto ? (
              <View style={styles.vehiclePhotoFallback}>
                <ActivityIndicator color="#00C853" />
              </View>
            ) : vehiclePhotoDraft ? (
              <Image
                source={{ uri: vehiclePhotoDraft }}
                style={styles.vehiclePhoto}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={styles.vehiclePhotoFallback}>
                <Ionicons name="car-sport-outline" size={40} color="#86EFAC" />
                <Text style={styles.vehiclePhotoHint}>Add vehicle photo</Text>
              </View>
            )}
            <View style={styles.vehiclePhotoBadge}>
              <Ionicons name="camera" size={14} color="#052e1b" />
              <Text style={styles.vehiclePhotoBadgeText}>
                {vehiclePhotoDraft ? 'Change' : 'Upload'}
              </Text>
            </View>
          </Pressable>

          {(vehiclePreviewLabel || colorDraft.trim() || plateDraft.trim()) ? (
            <View style={styles.previewBox}>
              <Text style={styles.previewLabel}>Preview</Text>
              {vehiclePreviewLabel ? (
                <Text style={styles.previewTitle}>{vehiclePreviewLabel}</Text>
              ) : null}
              {colorDraft.trim() ? (
                <Text style={styles.previewMeta}>{colorDraft.trim()}</Text>
              ) : null}
              {plateDraft.trim() ? (
                <Text style={styles.previewPlate}>
                  {plateDraft.trim().toUpperCase()}
                </Text>
              ) : null}
            </View>
          ) : null}

          <Text style={styles.fieldLabel}>Vehicle Make</Text>
          <AppTextInput
            style={styles.profileInput}
            value={identity.loading ? '' : makeDraft}
            onChangeText={setMakeDraft}
            placeholder="Toyota, Honda, Ford…"
            placeholderTextColor="#7D8493"
            autoCapitalize="words"
            editable={!identity.loading && !savingVehicle}
          />

          <Text style={styles.fieldLabel}>Vehicle Model</Text>
          <AppTextInput
            style={styles.profileInput}
            value={identity.loading ? '' : modelDraft}
            onChangeText={setModelDraft}
            placeholder="Corolla, Civic…"
            placeholderTextColor="#7D8493"
            autoCapitalize="words"
            editable={!identity.loading && !savingVehicle}
          />

          <Text style={styles.fieldLabel}>Vehicle Year</Text>
          <AppTextInput
            style={styles.profileInput}
            value={identity.loading ? '' : yearDraft}
            onChangeText={setYearDraft}
            placeholder="2022"
            placeholderTextColor="#7D8493"
            keyboardType="number-pad"
            maxLength={4}
            editable={!identity.loading && !savingVehicle}
          />

          <Text style={styles.fieldLabel}>Vehicle Color</Text>
          <AppTextInput
            style={styles.profileInput}
            value={identity.loading ? '' : colorDraft}
            onChangeText={setColorDraft}
            placeholder="White"
            placeholderTextColor="#7D8493"
            autoCapitalize="words"
            editable={!identity.loading && !savingVehicle}
          />

          <Text style={styles.fieldLabel}>License Plate Number</Text>
          <AppTextInput
            style={styles.profileInput}
            value={identity.loading ? '' : plateDraft}
            onChangeText={setPlateDraft}
            placeholder="ABCD-123"
            placeholderTextColor="#7D8493"
            autoCapitalize="characters"
            editable={!identity.loading && !savingVehicle}
          />

          <Pressable
            style={[
              styles.saveBtn,
              (!vehicleDirty || savingVehicle) && styles.saveBtnDisabled,
            ]}
            disabled={!vehicleDirty || savingVehicle}
            onPress={() => void handleSaveVehicle()}
          >
            {savingVehicle ? (
              <ActivityIndicator color="#052e1b" />
            ) : (
              <Text style={styles.saveBtnText}>Save vehicle</Text>
            )}
          </Pressable>
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
    width: '100%',
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
  fieldLabel: {
    marginTop: 14,
    alignSelf: 'stretch',
    color: '#7D8493',
    fontSize: 13,
    fontWeight: '600',
  },
  profileInput: {
    marginTop: 6,
    alignSelf: 'stretch',
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A3A5A',
    backgroundColor: '#22223A',
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  vehicleCard: {
    alignSelf: 'stretch',
    marginBottom: 20,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#22223A',
  },
  vehicleCardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  vehicleCardSub: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: 13,
    fontWeight: '600',
    color: '#7D8493',
    lineHeight: 18,
  },
  vehiclePhotoBtn: {
    alignSelf: 'stretch',
    height: VEHICLE_PHOTO_H,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 83, 0.35)',
    backgroundColor: '#132B1E',
  },
  vehiclePhoto: {
    width: '100%',
    height: VEHICLE_PHOTO_H,
  },
  vehiclePhotoFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  vehiclePhotoHint: {
    color: '#86EFAC',
    fontWeight: '700',
    fontSize: 14,
  },
  vehiclePhotoBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#00C853',
  },
  vehiclePhotoBadgeText: {
    color: '#052e1b',
    fontWeight: '800',
    fontSize: 12,
  },
  previewBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#00C853',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  previewMeta: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '600',
    color: '#B7BDC9',
  },
  previewPlate: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#111827',
    color: '#F9FAFB',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  saveBtn: {
    marginTop: 16,
    alignSelf: 'stretch',
    height: 48,
    borderRadius: 12,
    backgroundColor: '#00C853',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#052e1b', fontWeight: '800', fontSize: 15 },
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
  btnText: { color: 'rgba(255,255,255,0.1)', fontWeight: '700', fontSize: 15 },
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
  signOutText: { color: '#EF4444', fontWeight: '700', fontSize: 15 },
});
