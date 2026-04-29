import { pickAndUploadImage } from '@/services/uploadImage';
import { createRestaurantProfile } from '@/services/restaurantDashboard';
import { requireRole } from '@/utils/requireRole';
import { useAuth } from '@/services/AuthContext';
import { showError, showSuccess } from '@/utils/toast';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RestaurantOnboardingScreen() {
  const { authorized, loading } = requireRole(['restaurant', 'admin']);
  const { user } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function pickLogo() {
    if (!user?.uid) return;
    const result = await pickAndUploadImage({
      uid: user.uid,
      folder: 'restaurants',
    });
    if (result.error) {
      showError(result.error);
      return;
    }
    if (result.url) setLogo(result.url);
  }

  async function saveProfile() {
    if (!user?.uid) return;
    if (!name.trim() || !location.trim()) {
      showError('Please fill restaurant name and location.');
      return;
    }
    setSaving(true);
    try {
      await createRestaurantProfile({
        ownerId: user.uid,
        name,
        location,
        logo,
      });
      showSuccess('Restaurant profile saved');
      router.replace('/(restaurant)/dashboard');
    } catch {
      showError('Could not create restaurant profile.');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !authorized) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#16a34a" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.title}>Restaurant Profile Setup</Text>
        <TextInput
          style={styles.input}
          placeholder="Restaurant name"
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={styles.input}
          placeholder="Location"
          value={location}
          onChangeText={setLocation}
        />
        <Pressable style={styles.secondaryButton} onPress={pickLogo}>
          <Text style={styles.secondaryText}>{logo ? 'Change Logo' : 'Upload Logo'}</Text>
        </Pressable>
        <Pressable style={styles.primaryButton} onPress={saveProfile} disabled={saving}>
          <Text style={styles.primaryText}>{saving ? 'Saving...' : 'Save Restaurant'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16 },
  title: { color: '#0F172A', fontSize: 28, fontWeight: '800', marginBottom: 14 },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
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
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: '#334155', fontWeight: '700' },
});
