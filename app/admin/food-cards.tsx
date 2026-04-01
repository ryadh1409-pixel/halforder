import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { createFoodCard } from '@/services/foodCards';
import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AdminFoodCardsScreen() {
  const [title, setTitle] = useState('');
  const [image, setImage] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [price, setPrice] = useState('');
  const [splitPrice, setSplitPrice] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);

  const onCreate = async () => {
    const p = Number(price);
    const sp = Number(splitPrice);
    if (!title.trim() || !restaurantName.trim() || !image.trim()) {
      Alert.alert('Missing fields', 'Title, restaurant, and image are required.');
      return;
    }
    if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(sp) || sp <= 0) {
      Alert.alert('Invalid price', 'Enter valid numeric prices.');
      return;
    }
    const [latRaw, lngRaw] = location.split(',').map((x) => x.trim());
    const lat = latRaw ? Number(latRaw) : null;
    const lng = lngRaw ? Number(lngRaw) : null;
    setSaving(true);
    try {
      await createFoodCard({
        title,
        image,
        restaurantName,
        price: p,
        splitPrice: sp,
        latitude: Number.isFinite(lat) ? lat : null,
        longitude: Number.isFinite(lng) ? lng : null,
      });
      setTitle('');
      setImage('');
      setRestaurantName('');
      setPrice('');
      setSplitPrice('');
      setLocation('');
      Alert.alert('Created', 'Food card is now live.');
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Could not create card');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Admin Food Cards</Text>
        <View style={styles.card}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            style={styles.input}
            placeholder="Title (Pepperoni Pizza)"
            placeholderTextColor={COLORS.textMuted}
          />
          <TextInput
            value={restaurantName}
            onChangeText={setRestaurantName}
            style={styles.input}
            placeholder="Restaurant name"
            placeholderTextColor={COLORS.textMuted}
          />
          <TextInput
            value={image}
            onChangeText={setImage}
            style={styles.input}
            placeholder="Image URL"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
          />
          <TextInput
            value={price}
            onChangeText={setPrice}
            style={styles.input}
            placeholder="Total price"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="decimal-pad"
          />
          <TextInput
            value={splitPrice}
            onChangeText={setSplitPrice}
            style={styles.input}
            placeholder="Split price"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="decimal-pad"
          />
          <TextInput
            value={location}
            onChangeText={setLocation}
            style={styles.input}
            placeholder="lat,lng (optional)"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.button} onPress={onCreate} disabled={saving}>
            <Text style={styles.buttonText}>{saving ? 'Creating...' : 'Create Card'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16 },
  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 12,
  },
  card: {
    ...adminCardShell,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    color: COLORS.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
    backgroundColor: COLORS.surface,
  },
  button: {
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: COLORS.text, fontWeight: '800' },
});
