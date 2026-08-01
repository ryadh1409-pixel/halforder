import { goBackFromProfileScreen } from '@/lib/profileBack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const pal = {
  bg: '#0B0816',
  surface: '#151126',
  border: 'rgba(168, 85, 247, 0.22)',
  text: '#FFFFFF',
  textSecondary: '#B7BDC9',
  textTertiary: '#8B93A7',
  primary: '#A855F7',
  onPrimary: '#FFFFFF',
  accent: '#22C55E',
} as const;

/**
 * Shown after a driver or restaurant application is submitted (pending admin review).
 */
export default function PartnerApplicationSubmittedScreen() {
  const router = useRouter();
  const { type: rawType } = useLocalSearchParams<{ type?: string }>();
  const isRestaurant = rawType === 'restaurant';

  const copy = useMemo(() => {
    if (isRestaurant) {
      return {
        title: 'Application submitted',
        body:
          'Your restaurant application has been submitted successfully.\nOur team will review your application.\nYou will receive a notification once it has been approved.',
      };
    }
    return {
      title: 'Application submitted',
      body:
        'Your driver application has been submitted successfully.\nOur team will review your application.\nYou will receive a notification once it has been approved.',
    };
  }, [isRestaurant]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons
            name="check-circle-outline"
            size={56}
            color={pal.accent}
          />
        </View>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>

        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Application Status</Text>
          <Text style={styles.statusValue}>Pending Review</Text>
          <Text style={styles.statusHint}>
            Reviews typically take 1–2 business days. You can keep using HalfOrder
            as a customer while you wait.
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => goBackFromProfileScreen(router)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text style={styles.primaryBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: pal.bg },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
    alignItems: 'center',
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: pal.text,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  body: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    color: pal.textSecondary,
    textAlign: 'center',
  },
  statusCard: {
    marginTop: 28,
    width: '100%',
    backgroundColor: pal.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: pal.border,
    padding: 16,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: pal.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statusValue: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '800',
    color: '#F59E0B',
  },
  statusHint: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: pal.textSecondary,
    fontWeight: '500',
  },
  footer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 8,
  },
  primaryBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: pal.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: pal.onPrimary,
  },
});
