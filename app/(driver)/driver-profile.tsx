import { logoutAndResetSession, POST_LOGOUT_ROUTE } from '@/lib/auth/logoutSession';
import { TABS_ROUTES } from '@/lib/navigationPaths';
import { useAuth } from '@/services/AuthContext';
import { router } from 'expo-router';
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Driver profile tab — unique route name avoids collision with `app/(tabs)/profile.tsx`. */
export default function DriverProfileTab() {
  const { user, signOutUser } = useAuth();

  const handleSignOut = useCallback(async () => {
    await logoutAndResetSession(signOutUser);
    router.replace(POST_LOGOUT_ROUTE as never);
  }, [signOutUser]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Text style={styles.title}>Driver profile</Text>
      <Text style={styles.meta}>{user?.displayName?.trim() || 'Driver'}</Text>
      <Text style={styles.meta}>{user?.email ?? user?.phoneNumber ?? ''}</Text>
      <Pressable
        style={styles.btn}
        onPress={() => router.push(TABS_ROUTES.profile as never)}
      >
        <Text style={styles.btnText}>Account settings</Text>
      </Pressable>
      <Pressable style={styles.signOutBtn} onPress={() => void handleSignOut()}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#1a1a2e', padding: 20 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  meta: { color: '#9CA3AF', marginTop: 8, fontWeight: '600' },
  btn: {
    marginTop: 20,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#22223A',
    borderWidth: 1,
    borderColor: '#3A3A5A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: '#E5E7EB', fontWeight: '700' },
  signOutBtn: {
    marginTop: 12,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#3B1C1C',
    borderWidth: 1,
    borderColor: '#7F1D1D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutText: { color: '#FCA5A5', fontWeight: '700' },
});
