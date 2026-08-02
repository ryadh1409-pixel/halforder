/**
 * Professional app loading screen — shown on resume/cold start while
 * auth + onboarding state resolves. Replaces the bare ActivityIndicator.
 */
import AppLogo from '@/components/AppLogo';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

// ── Animated dot ─────────────────────────────────────────────────────────────

function Dot({ delay }: { delay: number }) {
  const scale = useRef(new Animated.Value(0.4)).current;
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1,
            duration: 500,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 500,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 0.4,
            duration: 500,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.3,
            duration: 500,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(300),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [delay, scale, opacity]);

  return (
    <Animated.View
      style={[styles.dot, { transform: [{ scale }], opacity }]}
    />
  );
}

// ── Glow ring behind logo ─────────────────────────────────────────────────────

function GlowRing() {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [anim]);

  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.4] });
  const scale   = anim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.1] });

  return (
    <Animated.View
      style={[styles.glowRing, { opacity, transform: [{ scale }] }]}
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AppLoadingScreen() {
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 400,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [fadeIn]);

  return (
    <LinearGradient
      colors={['#0B0816', '#130D24', '#0B0816']}
      locations={[0, 0.5, 1]}
      style={styles.root}
    >
      <Animated.View style={[styles.content, { opacity: fadeIn }]}>

        {/* Logo + glow */}
        <View style={styles.logoWrap}>
          <GlowRing />
          <AppLogo size={110} marginTop={0} />
        </View>

        {/* App name */}
        <Text style={styles.appName}>HalfOrder</Text>
        <Text style={styles.tagline}>Share food. Save more.</Text>

        {/* Animated dots */}
        <View style={styles.dotsRow}>
          <Dot delay={0} />
          <Dot delay={180} />
          <Dot delay={360} />
        </View>

      </Animated.View>
    </LinearGradient>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const PURPLE = '#7C3AED';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    gap: 0,
  },

  // Logo
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  glowRing: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: PURPLE,
  },

  // Text
  appName: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  tagline: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.3,
    marginBottom: 48,
  },

  // Dots
  dotsRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: PURPLE,
  },
});
