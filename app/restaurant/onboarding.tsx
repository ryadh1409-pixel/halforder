import { AccountLocationPicker } from '@/components/location/AccountLocationPicker';
import { LOCATION_PALETTE_LIGHT } from '@/components/location/locationPalette';
import { useAccountSavedLocation } from '@/hooks/useAccountSavedLocation';
import { useAuth } from '@/services/AuthContext';
import { createRestaurant, getRestaurant } from '@/services/restaurantService';
import { pickAndUploadImage } from '@/services/uploadImage';
import { requireRole } from '@/utils/requireRole';
import { showError, showSuccess } from '@/utils/toast';
import { Redirect, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { AppTextInput } from '../../components/AppTextInput';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RestaurantOnboardingScreen() {
  const { authorized, loading } = requireRole(['restaurant', 'admin']);
  const { user } = useAuth();
  const router = useRouter();
  const uid = user?.uid ?? null;
  const { saved: savedVenueLocation } = useAccountSavedLocation('restaurants', uid);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'restaurant' | 'food_truck'>('restaurant');
  const [logo, setLogo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!uid) {
      setChecking(false);
      return;
    }
    let active = true;
    getRestaurant(uid)
      .then((restaurant) => {
        if (!active) return;
        if (restaurant?.profileCompleted) {
          router.replace('/restaurant-dashboard');
          return;
        }
        setName(restaurant?.name ?? '');
        setDescription(restaurant?.description ?? '');
        setType(restaurant?.type ?? 'restaurant');
        setLogo(restaurant?.logo ?? null);
      })
      .catch((error) => {
        console.log('[restaurant-onboarding] failed to check restaurant profile', error);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [uid, router]);

  const typeLabel = useMemo(
    () => (type === 'food_truck' ? 'Food Truck' : 'Restaurant'),
    [type],
  );

  async function pickLogo() {
    if (!uid) return;
    const result = await pickAndUploadImage({
      uid,
      folder: 'restaurants',
    });
    if (result.error) {
      showError(result.error);
      return;
    }
    if (result.url) setLogo(result.url);
  }

  async function saveProfile() {
    if (!uid) return;
    if (!name.trim()) {
      showError('Please enter your restaurant name.');
      return;
    }
    if (!savedVenueLocation?.address?.trim()) {
      showError('Save your restaurant location before continuing.');
      return;
    }
    setSaving(true);
    try {
      await createRestaurant({
        userId: uid,
        name,
        savedLocation: savedVenueLocation,
        logo,
        description,
        type,
        profileCompleted: true,
      });
      showSuccess('Restaurant profile saved');
      router.replace('/restaurant-dashboard');
    } catch {
      showError('Could not create restaurant profile.');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !authorized || checking) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#16a34a" />
      </SafeAreaView>
    );
  }

  if (!uid) return <Redirect href="/(auth)/login" />;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Restaurant Profile Setup</Text>
            <AppTextInput
              style={styles.input}
              placeholder="Restaurant name"
              value={name}
              onChangeText={setName}
            />

            <AccountLocationPicker
              role="restaurant"
              accountId={uid}
              palette={LOCATION_PALETTE_LIGHT}
            />

            <AppTextInput
              style={[styles.input, styles.textArea]}
              placeholder="Short description"
              value={description}
              onChangeText={setDescription}
              multiline
            />
            <Text style={styles.typeLabel}>Type: {typeLabel}</Text>
            <View style={styles.typeRow}>
              <Pressable
                style={[styles.typeChip, type === 'restaurant' ? styles.typeChipActive : null]}
                onPress={() => setType('restaurant')}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    type === 'restaurant' ? styles.typeChipTextActive : null,
                  ]}
                >
                  Restaurant
                </Text>
              </Pressable>
              <Pressable
                style={[styles.typeChip, type === 'food_truck' ? styles.typeChipActive : null]}
                onPress={() => setType('food_truck')}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    type === 'food_truck' ? styles.typeChipTextActive : null,
                  ]}
                >
                  Food Truck
                </Text>
              </Pressable>
            </View>
            <Pressable style={styles.secondaryButton} onPress={pickLogo}>
              <Text style={styles.secondaryText}>{logo ? 'Change Logo' : 'Upload Logo'}</Text>
            </Pressable>
            {logo ? <Image source={{ uri: logo }} style={styles.logoPreview} /> : null}
            <Pressable style={styles.primaryButton} onPress={saveProfile} disabled={saving}>
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryText}>Save Restaurant</Text>
              )}
            </Pressable>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#171923' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40, gap: 4 },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', marginBottom: 14 },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    backgroundColor: '#000000',
  },
  textArea: {
    minHeight: 88,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  typeLabel: { color: '#FFFFFF', fontWeight: '700', marginBottom: 8, marginTop: 2 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  typeChip: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#000000',
    paddingVertical: 10,
    alignItems: 'center',
  },
  typeChipActive: { borderColor: '#16a34a', backgroundColor: '#DCFCE7' },
  typeChipText: { color: '#B7BDC9', fontWeight: '700' },
  typeChipTextActive: { color: '#166534' },
  primaryButton: {
    marginTop: 10,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#FFFFFF', fontWeight: '800' },
  secondaryButton: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: '#B7BDC9', fontWeight: '700' },
  logoPreview: {
    width: 96,
    height: 96,
    borderRadius: 12,
    marginTop: 10,
    marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
});
