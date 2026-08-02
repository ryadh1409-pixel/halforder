import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const PAL = {
  backdrop: 'rgba(8, 6, 18, 0.72)',
  card: '#151126',
  border: 'rgba(168, 85, 247, 0.28)',
  text: '#FFFFFF',
  muted: '#B7BDC9',
  primary: '#A855F7',
  onPrimary: '#FFFFFF',
  secondaryBg: 'rgba(168,85,247,0.12)',
} as const;

export type EnableLiveLocationModalProps = {
  visible: boolean;
  busy?: boolean;
  onEnable: () => void;
  onNotNow: () => void;
};

/**
 * Post-accept professional prompt — Enable Live Location for the active delivery.
 */
export function EnableLiveLocationModal({
  visible,
  busy = false,
  onEnable,
  onNotNow,
}: EnableLiveLocationModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!busy) onNotNow();
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.iconWrap}>
            <MaterialIcons name="my-location" size={32} color={PAL.primary} />
          </View>
          <Text style={styles.title}>Enable Live Location</Text>
          <Text style={styles.body}>
            HalfOrder uses your live location only while you are actively delivering an
            order. This allows the customer, restaurant, and HalfOrder to track delivery
            progress in real time.
          </Text>

          <Pressable
            style={[styles.primaryBtn, busy && styles.disabled]}
            onPress={onEnable}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Enable Live Location"
          >
            {busy ? (
              <ActivityIndicator color={PAL.onPrimary} />
            ) : (
              <Text style={styles.primaryText}>Enable Live Location</Text>
            )}
          </Pressable>

          <Pressable
            style={[styles.secondaryBtn, busy && styles.disabled]}
            onPress={onNotNow}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Not Now"
          >
            <Text style={styles.secondaryText}>Not Now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: PAL.backdrop,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: PAL.card,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PAL.border,
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 20,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: PAL.secondaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    color: PAL.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 10,
  },
  body: {
    color: PAL.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 22,
  },
  primaryBtn: {
    backgroundColor: PAL.primary,
    borderRadius: 14,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  primaryText: {
    color: PAL.onPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryBtn: {
    borderRadius: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PAL.secondaryBg,
  },
  secondaryText: {
    color: PAL.muted,
    fontSize: 15,
    fontWeight: '700',
  },
  disabled: { opacity: 0.6 },
});
