import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { adminRoutes } from '../constants/adminRoutes';
import { ONBOARDING_COMPLETE_KEY } from '../constants/onboarding';
import { goHome } from '../lib/navigation';
import { useAuth } from '../services/AuthContext';
import {
  DEFAULT_ONBOARDING_SLIDES,
  fetchOnboardingConfig,
  type OnboardingSlideAdmin,
} from '../services/onboardingAdmin';
import { startOnboarding } from '../services/stripeConnect';
import { alertFriendly } from '../utils/friendlyAlert';

const BG = '#000000';
const { width } = Dimensions.get('window');

const GREEN_GRADIENT = ['#1B5E20', '#2E7D32', '#4CAF50'] as const;
const GREEN_GRADIENT_END = ['#2E7D32', '#43A047', '#66BB6A'] as const;

const FALLBACK_ICONS = ['🍽️', '⚡', '✨'] as const;

type SlideView = {
  id: string;
  title: string;
  description: string;
  imageUri: string;
  icon: string;
};

function toSlideView(s: OnboardingSlideAdmin, index: number): SlideView {
  return {
    id: s.id,
    title: s.title,
    description: s.subtitle,
    imageUri: s.imageUri,
    icon: FALLBACK_ICONS[index % FALLBACK_ICONS.length] ?? '✨',
  };
}

export default function OnboardingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ adminPreview?: string }>();
  const adminPreview =
    params.adminPreview === '1' || params.adminPreview === 'true';
  const flatListRef = useRef<FlatList<SlideView>>(null);
  const [index, setIndex] = useState(0);
  const { user, role, loading: authLoading } = useAuth();
  const [stripeLoading, setStripeLoading] = useState(false);
  const [slides, setSlides] = useState<SlideView[]>(
    DEFAULT_ONBOARDING_SLIDES.filter((s) => s.enabled).map(toSlideView),
  );
  const showRestaurantStripeCta =
    !adminPreview &&
    !authLoading &&
    !!user?.uid &&
    (role === 'restaurant' || role === 'host' || role === 'admin');

  useEffect(() => {
    let cancelled = false;
    void fetchOnboardingConfig()
      .then((cfg) => {
        if (cancelled) return;
        const enabled = cfg.slides.filter((s) => s.enabled);
        setSlides(
          (enabled.length ? enabled : DEFAULT_ONBOARDING_SLIDES).map(toSlideView),
        );
      })
      .catch(() => {
        /* keep DEFAULT_ONBOARDING_SLIDES — appConfig may be unavailable offline */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCompleteStripeSetup = useCallback(async () => {
    if (!user?.uid) return;
    setStripeLoading(true);
    try {
      const { url } = await startOnboarding(user.uid);
      if (url) {
        await Linking.openURL(url);
      }
    } catch (e) {
      alertFriendly('Payout setup', e, 'payment');
    } finally {
      setStripeLoading(false);
    }
  }, [user?.uid]);

  const completeOnboarding = useCallback(async () => {
    // Admin test session: do not persist completion flags; return to manager.
    if (adminPreview) {
      router.replace(adminRoutes.onboardingManager as never);
      return;
    }
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
    if (user?.uid) {
      await AsyncStorage.setItem(
        `${ONBOARDING_COMPLETE_KEY}:login:${user.uid}`,
        'true',
      );
    }
    goHome();
  }, [adminPreview, router, user?.uid]);

  const handleSkip = () => {
    void completeOnboarding();
  };

  const handleNextOrDone = () => {
    if (index < slides.length - 1) {
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

  const isLast = index === Math.max(slides.length - 1, 0);
  const gradientColors =
    isLast ? GREEN_GRADIENT_END : GREEN_GRADIENT;

  const listData = useMemo(() => slides, [slides]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBrand}>
        <AppLogo size={56} marginTop={0} />
      </View>

      <FlatList
        ref={flatListRef}
        data={listData}
        horizontal
        pagingEnabled
        decelerationRate="fast"
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        onScrollToIndexFailed={() => {}}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            {item.imageUri ? (
              <Image
                source={{ uri: item.imageUri }}
                style={styles.heroImage}
                contentFit="cover"
              />
            ) : (
              <View style={styles.iconBubble}>
                <Text style={styles.iconEmoji}>{item.icon}</Text>
              </View>
            )}
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.description}>{item.description}</Text>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {listData.map((s, i) => (
            <View
              key={s.id}
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
  heroImage: {
    width: width - 64,
    height: 200,
    borderRadius: 20,
    marginBottom: 28,
    backgroundColor: '#171923',
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
    color: '#B7BDC9',
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
