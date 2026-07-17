import { UE } from '@/constants/uberEatsTheme';
import type { HomeBannerDoc } from '@/types/homeBanner';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import React, { memo, useCallback } from 'react';
import {
  Dimensions,
  Linking,
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

type Props = {
  banners: HomeBannerDoc[];
  onNavigate?: (destination: string) => void;
};

function PromoBannerCarouselInner({ banners, onNavigate }: Props) {
  const handlePress = useCallback(
    (banner: HomeBannerDoc) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const dest = banner.buttonDestination.trim();
      if (!dest) return;
      if (/^https?:\/\//i.test(dest)) {
        void Linking.openURL(dest);
        return;
      }
      onNavigate?.(dest);
    },
    [onNavigate],
  );

  if (banners.length === 0) return null;

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
      {banners.map((b) => {
        const hasDestination = b.buttonDestination.trim().length > 0;
        const showButton = b.buttonText.trim().length > 0;

        return (
          <Pressable
            key={b.id}
            accessibilityRole="button"
            disabled={!hasDestination}
            onPress={() => handlePress(b)}
            style={({ pressed }) => [
              styles.card,
              { width: CARD_W },
              pressed && hasDestination && styles.cardPressed,
            ]}
          >
            <Image
              source={{ uri: b.imageUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
            <LinearGradient
              colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.72)']}
              locations={[0.25, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.accentBar} />
            <View style={styles.copy}>
              {b.badgeText ? (
                <Text style={styles.eyebrow} numberOfLines={1}>
                  {b.badgeText}
                </Text>
              ) : null}
              <Text style={styles.title}>{b.headline}</Text>
              {b.subtitle ? <Text style={styles.sub}>{b.subtitle}</Text> : null}
              {showButton ? (
                <View style={styles.ctaPill}>
                  <Text style={styles.ctaTxt}>{b.buttonText}</Text>
                  <Text style={styles.ctaArrow}>›</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      })}
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
    backgroundColor: UE.promo,
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
