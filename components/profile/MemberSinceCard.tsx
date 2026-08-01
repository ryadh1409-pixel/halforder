import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

const APP_ICON = require('../../assets/icon.png') as number;

type Props = {
  /** Calendar year the member joined (e.g. 2026). */
  year: number;
};

/**
 * Premium loyalty membership card for Profile.
 * Same footprint as peer cards — informational only.
 */
export function MemberSinceCard({ year }: Props) {
  return (
    <View
      style={styles.shell}
      accessibilityRole="summary"
      accessibilityLabel={`Member since ${year}. Thank you for being part of HalfOrder.`}
      importantForAccessibility="yes"
    >
      <LinearGradient
        colors={['#22183A', '#151126', '#100E18']}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.surface}
      >
        {/* Soft mesh / light streak — decorative only */}
        <LinearGradient
          colors={[
            'rgba(168, 85, 247, 0.22)',
            'rgba(168, 85, 247, 0.04)',
            'transparent',
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.85 }}
          style={styles.mesh}
          pointerEvents="none"
        />
        <View style={styles.streak} pointerEvents="none" />

        <View style={styles.row}>
          <View style={styles.logoOuter}>
            <LinearGradient
              colors={['rgba(196,181,253,0.28)', 'rgba(168,85,247,0.08)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logoRing}
            >
              <View style={styles.logoInner}>
                <Image
                  source={APP_ICON}
                  style={styles.icon}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                  accessible={false}
                />
              </View>
            </LinearGradient>
          </View>

          <View style={styles.textCol}>
            <View style={styles.titleRow}>
              <Text style={styles.title} maxFontSizeMultiplier={1.25}>
                {`Member since ${year}`}
              </Text>
              <MaterialIcons
                name="diamond"
                size={14}
                color="#C4B5FD"
                style={styles.badgeIcon}
                accessible={false}
              />
            </View>
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.3}>
              Thank you for being part of HalfOrder.
            </Text>
            <Text style={styles.loyalty} maxFontSizeMultiplier={1.3}>
              {
                "Thank you for choosing HalfOrder. We're excited to have you with us."
              }
            </Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(196, 181, 253, 0.32)',
    marginTop: 24,
    marginBottom: 12,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#A855F7',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 14,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  surface: {
    minHeight: 132,
    paddingTop: 26,
    paddingBottom: 26,
    paddingHorizontal: 22,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  mesh: {
    ...StyleSheet.absoluteFillObject,
  },
  streak: {
    position: 'absolute',
    top: -20,
    right: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(168, 85, 247, 0.12)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  logoOuter: {
    marginTop: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#A855F7',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  logoRing: {
    width: 50,
    height: 50,
    borderRadius: 14,
    padding: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInner: {
    width: '100%',
    height: '100%',
    borderRadius: 12.5,
    overflow: 'hidden',
    backgroundColor: '#0B0816',
  },
  icon: {
    width: '100%',
    height: '100%',
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    marginLeft: 18,
    paddingRight: 6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  title: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.35,
    lineHeight: 22,
  },
  badgeIcon: {
    opacity: 0.9,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    color: '#E8EAF0',
  },
  loyalty: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
    color: '#BFA8F5',
  },
});
