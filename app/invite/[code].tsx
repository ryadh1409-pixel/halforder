import AppLogo from '@/components/AppLogo';
import { theme } from '@/constants/theme';
import { goHome } from '@/lib/navigation';
import { storeReferralInvite } from '@/services/friendReferralProgram';
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

export default function InviteReferralScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const code = typeof params.code === 'string' ? params.code : '';
  const [status, setStatus] = useState<'loading' | 'ok' | 'invalid'>('loading');

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!code.trim()) {
        if (mounted) setStatus('invalid');
        return;
      }
      const uid = await storeReferralInvite(code);
      if (!mounted) return;
      setStatus(uid ? 'ok' : 'invalid');
    })();
    return () => {
      mounted = false;
    };
  }, [code]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <AppLogo size={72} />
        <Text style={styles.title}>HalfOrder Invite</Text>
        {status === 'loading' ? (
          <>
            <ActivityIndicator color={pal.primary} style={{ marginTop: 20 }} />
            <Text style={styles.subtitle}>Saving your invite…</Text>
          </>
        ) : status === 'ok' ? (
          <>
            <Text style={styles.subtitle}>
              You were invited to HalfOrder. Sign up or sign in to start ordering
              and help your friend earn rewards.
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.replace('/(auth)/login' as never)}
            >
              <Text style={styles.primaryBtnText}>Continue</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkBtn} onPress={() => goHome()}>
              <Text style={styles.linkText}>Browse restaurants</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>
              This invite link is invalid or expired.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => goHome()}>
              <Text style={styles.primaryBtnText}>Go to Home</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: pal.backgroundDark,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    marginTop: 16,
    fontSize: 24,
    fontWeight: '800',
    color: pal.text,
  },
  subtitle: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    color: pal.textSecondary,
    textAlign: 'center',
  },
  primaryBtn: {
    marginTop: 24,
    backgroundColor: pal.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  primaryBtnText: {
    color: pal.textOnPrimary,
    fontWeight: '800',
    fontSize: 16,
  },
  linkBtn: {
    marginTop: 14,
    padding: 8,
  },
  linkText: {
    color: pal.primary,
    fontWeight: '700',
    fontSize: 15,
  },
});
