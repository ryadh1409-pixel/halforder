import { goHome } from '../lib/navigation';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TestNavigationScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.title}>Test Screen</Text>
        <Text style={styles.subtitle}>
          If you can stay here without being forced back to admin, redirect loop is fixed.
        </Text>
        <Pressable style={styles.button} onPress={goHome}>
          <Text style={styles.buttonText}>Go Home</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#171923' },
  content: { flex: 1, padding: 16, justifyContent: 'center' },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#7D8493', marginTop: 8, fontWeight: '600' },
  button: {
    marginTop: 16,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#FFFFFF', fontWeight: '800' },
});
