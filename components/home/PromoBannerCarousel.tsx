import { UE } from '@/constants/uberEatsTheme';
import { useHomeMarketplaceLocation } from '@/contexts/HomeMarketplaceLocationContext';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import React, { memo } from 'react';
import {
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const W = Dimensions.get('window').width;
const CARD_W = W - 32;
const SNAP = CARD_W + 14;

type Banner = {
  id: string;
  title: string;
  subtitle: string;
  cta: string;
  imageUri: string;
  accent: string;
};

const DEFAULT_BANNERS: Banner[] = [
  {
    id: 'bogo',
    title: 'Buy 1, get 1 free',
    subtitle: 'On burgers & bowls near you',
    cta: 'Order now',
    imageUri:
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=900&q=80&auto=format&fit=crop',
    accent: '#E11900',
  },
  {
    id: 'sale',
    title: 'Items on sale',
    subtitle: 'Save up to 40% near you',
    cta: 'See deals',
    imageUri:
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=900&q=80&auto=format&fit=crop',
    accent: '#22C55E',
  },
  {
    id: 'zero',
    title: '$0 delivery fee',
    subtitle: 'When you spend $15+',
    cta: 'Browse',
    imageUri:
      'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=900&q=80&auto=format&fit=crop',
    accent: '#000000',
  },
];

type Props = {
  banners?: Banner[];
  onBannerPress?: (id: string) => void;
};

function PromoBannerCarouselInner({
  banners = DEFAULT_BANNERS,
  onBannerPress,
}: Props) {
  const { addressLine } = useHomeMarketplaceLocation();
  const regionEyebrow =
    addressLine && !addressLine.toLowerCase().includes('enable location')
      ? `HalfOrder · ${addressLine.split('·').pop()?.trim() ?? addressLine}`
      : 'HalfOrder';

  return (
    <ScrollView
      horizontal
      decelerationRate="fast"
      snapToInterval={SNAP}
      snapToAlignment="start"
      disableIntervalMomentum
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      {banners.map((b) => (
        <Pressable
          key={b.id}
          accessibilityRole="button"
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onBannerPress?.(b.id);
          }}
          style={({ pressed }) => [
            styles.card,
            { width: CARD_W },
            pressed && styles.cardPressed,
          ]}
        >
          <Image
            source={{ uri: b.imageUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.72)']}
            locations={[0.25, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.accentBar, { backgroundColor: b.accent }]} />
          <View style={styles.copy}>
            <Text style={styles.eyebrow} numberOfLines={1}>
              {regionEyebrow}
            </Text>
            <Text style={styles.title}>{b.title}</Text>
            <Text style={styles.sub}>{b.subtitle}</Text>
            <View style={styles.ctaPill}>
              <Text style={styles.ctaTxt}>{b.cta}</Text>
              <Text style={styles.ctaArrow}>›</Text>
            </View>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export const PromoBannerCarousel = memo(PromoBannerCarouselInner);

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: UE.spaceCard,
    gap: 14,
    paddingTop: 4,
    paddingBottom: UE.spaceBlock,
  },
  card: {
    height: 176,
    borderRadius: UE.radiusXL + 4,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: UE.surface,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.14,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  cardPressed: { opacity: 0.96, transform: [{ scale: 0.99 }] },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  copy: { padding: 20, paddingLeft: 22, zIndex: 1 },
  eyebrow: {
    fontSize: UE.fontMicro,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    lineHeight: 30,
  },
  sub: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 20,
  },
  ctaPill: {
    marginTop: 14,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: UE.radiusPill,
    backgroundColor: '#09090B',
  },
  ctaTxt: { fontSize: 14, fontWeight: '900', color: UE.text },
  ctaArrow: { fontSize: 18, fontWeight: '300', color: UE.text, marginTop: -2 },
});
