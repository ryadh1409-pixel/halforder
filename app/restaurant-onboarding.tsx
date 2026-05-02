import { useAuth } from '../services/AuthContext';
import { createRestaurant, getRestaurant } from '../services/restaurantService';
import { pickAndUploadImage } from '../services/uploadImage';
import { requireRole } from '../utils/requireRole';
import { showError, showSuccess } from '../utils/toast';
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
    TextInput,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RestaurantOnboardingScreen() {
  const { authorized, loading } = requireRole(['restaurant', 'admin']);
  const { user } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'restaurant' | 'food_truck'>('restaurant');
  const [logo, setLogo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(true);
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const placesKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    if (!user?.uid) {
      setChecking(false);
      return;
    }
    let active = true;
    getRestaurant(user.uid)
      .then((profile) => {
        if (!active) return;
        if (profile?.profileCompleted) {
          router.replace('/restaurant-dashboard');
          return;
        }
        setName(profile?.name ?? '');
        setLocation(profile?.location ?? '');
        setDescription(profile?.description ?? '');
        setType(profile?.type ?? 'restaurant');
        setLogo(profile?.logo ?? null);
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
  }, [user?.uid]);

  useEffect(() => {
    if (!placesKey || query.trim().length < 3) {
      setPredictions([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query.trim())}&key=${placesKey}`;
        const response = await fetch(url);
        const json = (await response.json()) as { predictions?: Array<{ description?: string }> };
        const next = (json.predictions ?? [])
          .map((p) => (typeof p.description === 'string' ? p.description : ''))
          .filter(Boolean)
          .slice(0, 5);
        setPredictions(next);
      } catch (error) {
        console.log('[restaurant-onboarding] places autocomplete failed', error);
        setPredictions([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [placesKey, query]);

  const typeLabel = useMemo(
    () => (type === 'food_truck' ? 'Food Truck' : 'Restaurant'),
    [type],
  );

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
      await createRestaurant({
        userId: user.uid,
        name,
        location,
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

  if (!user?.uid) return <Redirect href="/(auth)/login" />;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Restaurant Profile Setup</Text>
            <TextInput
              style={styles.input}
              placeholder="Restaurant name"
              value={name}
              onChangeText={setName}
            />
            <TextInput
              style={styles.input}
              placeholder="Search location"
              value={query}
              onChangeText={(text) => {
                setQuery(text);
                setLocation(text);
              }}
            />
            {searching ? <ActivityIndicator color="#16a34a" style={{ marginBottom: 8 }} /> : null}
            {predictions.map((prediction) => (
              <Pressable
                key={prediction}
                style={styles.suggestion}
                onPress={() => {
                  setQuery(prediction);
                  setLocation(prediction);
                  setPredictions([]);
                }}
              >
                <Text style={styles.suggestionText}>{prediction}</Text>
              </Pressable>
            ))}
            <TextInput
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
                <Text style={[styles.typeChipText, type === 'restaurant' ? styles.typeChipTextActive : null]}>Restaurant</Text>
              </Pressable>
              <Pressable
                style={[styles.typeChip, type === 'food_truck' ? styles.typeChipActive : null]}
                onPress={() => setType('food_truck')}
              >
                <Text style={[styles.typeChipText, type === 'food_truck' ? styles.typeChipTextActive : null]}>Food Truck</Text>
              </Pressable>
            </View>
            <Pressable style={styles.secondaryButton} onPress={pickLogo}>
              <Text style={styles.secondaryText}>{logo ? 'Change Logo' : 'Upload Logo'}</Text>
            </Pressable>
            {logo ? <Image source={{ uri: logo }} style={styles.logoPreview} /> : null}
            <Pressable style={styles.primaryButton} onPress={saveProfile} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Save Restaurant</Text>}
            </Pressable>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },
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
  textArea: {
    minHeight: 88,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  suggestion: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  suggestionText: { color: '#334155', fontWeight: '600' },
  typeLabel: { color: '#0F172A', fontWeight: '700', marginBottom: 8, marginTop: 2 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  typeChip: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    alignItems: 'center',
  },
  typeChipActive: { borderColor: '#16a34a', backgroundColor: '#DCFCE7' },
  typeChipText: { color: '#334155', fontWeight: '700' },
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
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: '#334155', fontWeight: '700' },
  logoPreview: {
    width: 96,
    height: 96,
    borderRadius: 12,
    marginTop: 10,
    marginBottom: 6,
    backgroundColor: '#E2E8F0',
  },
});
