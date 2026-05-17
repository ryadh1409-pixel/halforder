import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import React, { memo } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Props = {
  visible: boolean;
  foodTitle: string;
  splitLabel: string;
  onChat: () => void;
  onCheckout: () => void;
  onDismiss: () => void;
};

function SwipeMatchSheetInner({
  visible,
  foodTitle,
  splitLabel,
  onChat,
  onCheckout,
  onDismiss,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        {Platform.OS === 'ios' ? (
          <BlurView
            intensity={60}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.backdropAndroid]} />
        )}
        <View style={styles.sheet}>
          <View style={styles.flameRing}>
            <Ionicons name="flame" size={48} color="#FF6B35" />
          </View>
          <Text style={styles.title}>It&apos;s a food match!</Text>
          <Text style={styles.food}>{foodTitle}</Text>
          <Text style={styles.split}>{splitLabel}</Text>
          <Text style={styles.sub}>
            You and someone nearby want to split this order.
          </Text>
          <Pressable
            style={styles.primary}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onCheckout();
            }}
          >
            <Text style={styles.primaryTxt}>Checkout together</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={onChat}>
            <Text style={styles.secondaryTxt}>Open chat</Text>
          </Pressable>
          <Pressable onPress={onDismiss} hitSlop={12}>
            <Text style={styles.dismiss}>Keep swiping</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export const SwipeMatchSheet = memo(SwipeMatchSheetInner);

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 24 },
  backdropAndroid: { backgroundColor: 'rgba(0,0,0,0.85)' },
  sheet: {
    borderRadius: 28,
    padding: 28,
    alignItems: 'center',
    backgroundColor: 'rgba(22,24,32,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  flameRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,107,53,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: -0.3,
  },
  food: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.9)',
  },
  split: { marginTop: 4, fontSize: 22, fontWeight: '900', color: '#7DFFB8' },
  sub: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    lineHeight: 20,
  },
  primary: {
    marginTop: 24,
    width: '100%',
    height: 54,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryTxt: { fontSize: 17, fontWeight: '900', color: '#0A0A0A' },
  secondary: { marginTop: 12, paddingVertical: 12 },
  secondaryTxt: { fontSize: 16, fontWeight: '800', color: '#FFF' },
  dismiss: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
  },
});
