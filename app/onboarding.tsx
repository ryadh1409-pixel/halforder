import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ONBOARDING_KEY = 'onboarding_done';
const { width } = Dimensions.get('window');

const SLIDES = [
  {
    title: 'Order food',
    description: 'Create or join an order for the food you want.',
    icon: '🍽️',
  },
  {
    title: 'Pay half',
    description: 'Split the cost — everyone pays their share.',
    icon: '💰',
  },
  {
    title: 'Share the meal',
    description: 'Pick up together and enjoy your food.',
    icon: '🍴',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);

  const handleGetStarted = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={{ width, flex: 1, paddingHorizontal: 32, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 64, marginBottom: 24 }}>{item.icon}</Text>
            <Text style={{ fontSize: 24, fontWeight: '700', color: '#22223b', marginBottom: 12, textAlign: 'center' }}>
              {item.title}
            </Text>
            <Text style={{ fontSize: 16, color: '#64748b', textAlign: 'center', lineHeight: 24 }}>
              {item.description}
            </Text>
          </View>
        )}
      />
      <View style={{ paddingHorizontal: 24, paddingBottom: 32 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i === index ? '#2563eb' : '#e2e8f0',
              }}
            />
          ))}
        </View>
        <TouchableOpacity
          onPress={handleGetStarted}
          style={{
            backgroundColor: '#2563eb',
            paddingVertical: 14,
            borderRadius: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Get Started</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
