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
  restaurantName: string;
  partnerFirstName: string;
  myFirstName: string;
  splitLabel: string;
  onChat: () => void;
  onMatchDetails: () => void;
  onDismiss: () => void;
};

function SwipeMatchSheetInner({
  visible,
  foodTitle,
  restaurantName,
  partnerFirstName,
  myFirstName,
  splitLabel,
  onChat,
  onMatchDetails,
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
          <Text style={styles.title}>It&apos;s a match</Text>
          <Text style={styles.food}>{foodTitle}</Text>
          <Text style={styles.restaurant}>{restaurantName}</Text>
          <Text style={styles.split}>{splitLabel}</Text>
          <View style={styles.avatarRow}>
            <View style={[styles.avatar, styles.avatarWarm]}>
              <Text style={styles.avatarTxt}>
                {myFirstName.slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={[styles.avatar, styles.avatarGreen]}>
              <Text style={styles.avatarTxt}>
                {partnerFirstName.slice(0, 1).toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={styles.sub}>
            You and {partnerFirstName} are splitting one meal. Coordinate in
            chat and track delivery together.
          </Text>
          <Pressable
            style={styles.primary}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onChat();
            }}
          >
            <Text style={styles.primaryTxt}>Complete payment</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={onMatchDetails}>
            <Text style={styles.secondaryTxt}>View match details</Text>
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
  restaurant: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '700',
    color: '#B7BDC9',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  split: { marginTop: 8, fontSize: 20, fontWeight: '900', color: '#7DFFB8' },
  avatarRow: {
    flexDirection: 'row',
    marginTop: 18,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#171922',
  },
  avatarWarm: { backgroundColor: '#FF6B35' },
  avatarGreen: { backgroundColor: '#22C55E', marginLeft: -10 },
  avatarTxt: { color: '#FFF', fontSize: 18, fontWeight: '900' },
  sub: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
    color: '#B7BDC9',
    textAlign: 'center',
    lineHeight: 20,
  },
  primary: {
    marginTop: 24,
    width: '100%',
    height: 54,
    borderRadius: 999,
    backgroundColor: '#09090B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryTxt: { fontSize: 17, fontWeight: '900', color: '#FFFFFF' },
  secondary: { marginTop: 12, paddingVertical: 12 },
  secondaryTxt: { fontSize: 16, fontWeight: '800', color: '#FFF' },
  dismiss: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
    color: '#B7BDC9',
  },
});
