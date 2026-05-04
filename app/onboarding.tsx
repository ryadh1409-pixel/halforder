import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppLogo from '../components/AppLogo';
import { ONBOARDING_COMPLETE_KEY } from '../constants/onboarding';
import { goHome } from '../lib/navigation';
import { useAuth } from '../services/AuthContext';
import { startOnboarding } from '../services/stripeConnect';

const BG = '#0B0F14';
const { width } = Dimensions.get('window');

const GREEN_GRADIENT = ['#1B5E20', '#2E7D32', '#4CAF50'] as const;
const GREEN_GRADIENT_END = ['#2E7D32', '#43A047', '#66BB6A'] as const;

const SLIDES = [
  {
    title: 'Split meals,\npay half',
    description:
      'Share a meal with someone nearby and pay only half the price on every order.',
    icon: '🍽️',
  },
  {
    title: 'Create or join\nin seconds',
    description:
      'Start your own shared order or join an open one from the community.',
    icon: '⚡',
  },
  {
    title: 'Save more,\nevery day',
    description:
      'HalfOrder is free to use — split costs, try new spots, and enjoy more for less.',
    icon: '✨',
  },
] as const;

export default function OnboardingScreen() {
  const flatListRef = useRef<FlatList<(typeof SLIDES)[number]>>(null);
  const [index, setIndex] = useState(0);
  const { user, role, loading: authLoading } = useAuth();
  const [stripeLoading, setStripeLoading] = useState(false);
  const showRestaurantStripeCta =
    !authLoading && !!user?.uid && (role === 'restaurant' || role === 'host' || role === 'admin');

  const handleCompleteStripeSetup = useCallback(async () => {
    if (!user?.uid) return;
    setStripeLoading(true);
    try {
      await startOnboarding(user.uid);
    } catch (e) {
      Alert.alert('Stripe', e instanceof Error ? e.message : 'Could not open Stripe setup.');
    } finally {
      setStripeLoading(false);
    }
  }, [user?.uid]);

  const completeOnboarding = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
    goHome();
  }, []);

  const handleSkip = () => {
    void completeOnboarding();
  };

  const handleNextOrDone = () => {
    if (index < SLIDES.length - 1) {
      const next = index + 1;
      flatListRef.current?.scrollToIndex({ index: next, animated: true });
      setIndex(next);
    } else {
      void completeOnboarding();
    }
  };

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      setIndex(Math.round(x / Math.max(width, 1)));
    },
    [],
  );

  const isLast = index === SLIDES.length - 1;
  const gradientColors =
    index === SLIDES.length - 1 ? GREEN_GRADIENT_END : GREEN_GRADIENT;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBrand}>
        <AppLogo size={56} marginTop={0} />
      </View>

      <FlatList
        ref={flatListRef}
        data={[...SLIDES]}
        horizontal
        pagingEnabled
        decelerationRate="fast"
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        onScrollToIndexFailed={() => {}}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={styles.iconBubble}>
              <Text style={styles.iconEmoji}>{item.icon}</Text>
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.description}>{item.description}</Text>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === index ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>

        {showRestaurantStripeCta ? (
          <Pressable
            style={[styles.stripeOutlineBtn, stripeLoading && styles.stripeOutlineBtnDisabled]}
            disabled={stripeLoading}
            onPress={() => void handleCompleteStripeSetup()}
          >
            {stripeLoading ? (
              <ActivityIndicator color="#81C784" />
            ) : (
              <Text style={styles.stripeOutlineBtnText}>Complete Stripe Setup</Text>
            )}
          </Pressable>
        ) : null}

        <View style={styles.bottomRow}>
          <Pressable
            onPress={handleSkip}
            style={({ pressed }) => [
              styles.skipPress,
              pressed && styles.skipPressed,
            ]}
            hitSlop={12}
          >
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>

          <Pressable
            onPress={handleNextOrDone}
            style={({ pressed }) => [
              styles.ctaPress,
              pressed && { opacity: 0.92 },
            ]}
          >
            <LinearGradient
              colors={[...gradientColors]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.ctaGradient}
            >
              <Text style={styles.ctaText}>{isLast ? 'Done' : 'Next'}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },
  topBrand: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  slide: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBubble: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  iconEmoji: {
    fontSize: 52,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  description: {
    fontSize: 16,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.68)',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 320,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 28,
    paddingTop: 8,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  stripeOutlineBtn: {
    alignSelf: 'stretch',
    marginHorizontal: 8,
    marginBottom: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(129, 199, 132, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  stripeOutlineBtnDisabled: {
    opacity: 0.55,
  },
  stripeOutlineBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#A5D6A7',
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
    backgroundColor: '#4CAF50',
  },
  dotInactive: {
    width: 8,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  skipPress: {
    paddingVertical: 14,
    paddingHorizontal: 4,
    minWidth: 72,
    justifyContent: 'center',
  },
  skipPressed: {
    opacity: 0.7,
  },
  skipText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
  },
  ctaPress: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  ctaGradient: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
