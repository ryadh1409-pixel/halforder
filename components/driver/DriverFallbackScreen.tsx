import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

type DriverFallbackScreenProps = {
  message?: string;
};

/**
 * Shown when the driver layout is mounted but providers are not yet safe to attach.
 * Prevents blank screens if auth/role is briefly transitional.
 */
export function DriverFallbackScreen({
  message = 'Loading driver workspace…',
}: DriverFallbackScreenProps) {
  return (
    <View style={styles.screen}>
      <ActivityIndicator size="large" color="#00C853" />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    padding: 24,
    gap: 16,
  },
  text: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
