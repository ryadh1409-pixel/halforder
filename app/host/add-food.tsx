import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type FoodItem = {
  id: string;
  name: string;
  price: number;
  image: string | null;
  location: {
    latitude: number | null;
    longitude: number | null;
    label: string | null;
  };
};

export default function HostAddFoodScreen() {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [manualLocation, setManualLocation] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );
  const [items, setItems] = useState<FoodItem[]>([]);

  async function pickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to pick image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setImage(result.assets[0].uri);
    }
  }

  async function useCurrentLocation() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission needed', 'Allow location access to continue.');
      return;
    }
    const current = await Location.getCurrentPositionAsync({});
    const next = {
      latitude: current.coords.latitude,
      longitude: current.coords.longitude,
    };
    setCoords(next);
    setManualLocation('');
  }

  function handleAddFoodItem() {
    const parsedPrice = Number(price);
    if (!name.trim()) {
      Alert.alert('Missing info', 'Please enter food name.');
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      Alert.alert('Invalid price', 'Please enter a valid price.');
      return;
    }
    const food: FoodItem = {
      id: `${Date.now()}`,
      name: name.trim(),
      price: Number(parsedPrice.toFixed(2)),
      image,
      location: {
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        label: manualLocation.trim() || null,
      },
    };
    setItems((prev) => [food, ...prev]);
    console.log({
      name: food.name,
      price: food.price,
      image: food.image,
      location: food.location,
    });
    Alert.alert('Added', 'Food item added locally.');
    setName('');
    setPrice('');
    setImage(null);
    setManualLocation('');
    setCoords(null);
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Host Food Truck</Text>
        <Text style={styles.subtitle}>Add menu items for your truck</Text>

        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Food Name"
          placeholderTextColor="#94A3B8"
        />
        <TextInput
          style={styles.input}
          value={price}
          onChangeText={setPrice}
          placeholder="Price"
          placeholderTextColor="#94A3B8"
          keyboardType="decimal-pad"
        />

        <Pressable style={styles.secondaryButton} onPress={() => void pickImage()}>
          <Text style={styles.secondaryButtonText}>
            {image ? 'Image Selected' : 'Upload Image'}
          </Text>
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={() => void useCurrentLocation()}
        >
          <Text style={styles.secondaryButtonText}>Use Current Location</Text>
        </Pressable>

        <TextInput
          style={styles.input}
          value={manualLocation}
          onChangeText={setManualLocation}
          placeholder="Or enter location manually"
          placeholderTextColor="#94A3B8"
        />

        {coords ? (
          <Text style={styles.coordsText}>
            Current: {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
          </Text>
        ) : null}

        <Pressable style={styles.primaryButton} onPress={handleAddFoodItem}>
          <Text style={styles.primaryButtonText}>Add Food Item</Text>
        </Pressable>

        {items.length > 0 ? (
          <View style={styles.itemsSection}>
            <Text style={styles.itemsTitle}>Local Added Items</Text>
            {items.map((item) => (
              <View key={item.id} style={styles.itemCard}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemMeta}>${item.price.toFixed(2)}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 28 },
  title: { color: '#0F172A', fontSize: 30, fontWeight: '800' },
  subtitle: { color: '#64748B', marginTop: 4, marginBottom: 12, fontWeight: '600' },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    color: '#0F172A',
    marginBottom: 10,
  },
  secondaryButton: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  secondaryButtonText: { color: '#1D4ED8', fontWeight: '700' },
  coordsText: { marginBottom: 10, color: '#475569', fontWeight: '600' },
  primaryButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  itemsSection: { marginTop: 16 },
  itemsTitle: { color: '#0F172A', fontWeight: '800', fontSize: 18, marginBottom: 8 },
  itemCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 12,
    marginBottom: 8,
  },
  itemName: { color: '#0F172A', fontWeight: '700', fontSize: 15 },
  itemMeta: { color: '#64748B', marginTop: 4, fontWeight: '600' },
});
