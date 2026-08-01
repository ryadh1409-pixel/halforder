import AppLogo from '@/components/AppLogo';
import { theme } from '@/constants/theme';
import { goHome } from '@/lib/navigation';
import { storePendingDriverReferralCode } from '@/services/driverReferralProgram';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const pal = theme.colors;

export default function DriverInviteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const code = typeof params.code === 'string' ? params.code : '';
  const [status, setStatus] = useState<'loading' | 'saved' | 'invalid'>('loading');

  useEffect(() => {
    let active = true;
    void storePendingDriverReferralCode(code).then((saved) => {
      if (active) setStatus(saved ? 'saved' : 'invalid');
    });
    return () => {
      active = false;
    };
  }, [code]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <AppLogo size={72} />
        <Text style={styles.title}>Your HalfOrder Invite</Text>
        {status === 'loading' ? (
          <>
            <ActivityIndicator color={pal.primary} style={styles.loader} />
            <Text style={styles.subtitle}>Saving your driver referral…</Text>
          </>
        ) : status === 'saved' ? (
          <>
            <Text style={styles.subtitle}>
              Create your new customer account. After your first successful order,
              the driver who invited you may receive a one-time reward.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.replace('/(auth)/register' as never)}
            >
              <Text style={styles.primaryButtonText}>Create account</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkButton} onPress={() => goHome()}>
              <Text style={styles.linkText}>Already have an account?</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>
              This driver referral link is invalid.
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => goHome()}>
              <Text style={styles.primaryButtonText}>Go to Home</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0816' },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    marginTop: 16,
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 12,
    color: '#B7BDC9',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  loader: { marginTop: 20 },
  primaryButton: {
    marginTop: 24,
    minWidth: 190,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: '#A855F7',
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  linkButton: { marginTop: 14, padding: 8 },
  linkText: { color: '#C084FC', fontSize: 15, fontWeight: '700' },
});
