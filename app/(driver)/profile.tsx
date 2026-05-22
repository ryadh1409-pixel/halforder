import { useAuth } from '@/services/AuthContext';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Driver-stack profile tab — stays inside `/(driver)` (no redirect to `/(tabs)`). */
export default function DriverProfileTab() {
  const { user } = useAuth();

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Text style={styles.title}>Driver profile</Text>
      <Text style={styles.meta}>{user?.displayName?.trim() || 'Driver'}</Text>
      <Text style={styles.meta}>{user?.email ?? user?.phoneNumber ?? ''}</Text>
      <Pressable
        style={styles.btn}
        onPress={() => router.push('/(tabs)/profile' as never)}
      >
        <Text style={styles.btnText}>Account settings</Text>
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
});
