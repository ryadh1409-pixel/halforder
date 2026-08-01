import { ReferralProgramCard } from '@/components/profile/ReferralProgramCard';
import { goBackFromProfileScreen } from '@/lib/profileBack';
import { isRegisteredAuthUser } from '@/lib/authSession';
import { useAuth } from '@/services/AuthContext';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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
} as const;

/**
 * Dedicated Referral Program screen — hosts the existing ReferralProgramCard.
 */
export default function ReferralProgramScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const registered = isRegisteredAuthUser(user);
  const uid = registered ? (user?.uid ?? null) : null;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => goBackFromProfileScreen(router)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backLink}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Referral Program</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {!uid ? (
          <Text style={styles.muted}>Sign in to view your referral program.</Text>
        ) : (
          <ReferralProgramCard
            uid={uid}
            pal={{
              surface: pal.surface,
              border: pal.border,
              text: pal.text,
              textSecondary: pal.textSecondary,
              textTertiary: pal.textTertiary,
              primary: pal.primary,
              onPrimary: pal.onPrimary,
            }}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: pal.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backLink: {
    fontSize: 16,
    fontWeight: '600',
    color: pal.primary,
  },
  screenTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: pal.text,
    letterSpacing: -0.3,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  muted: {
    marginTop: 24,
    fontSize: 15,
    fontWeight: '500',
    color: pal.textTertiary,
    textAlign: 'center',
  },
});
