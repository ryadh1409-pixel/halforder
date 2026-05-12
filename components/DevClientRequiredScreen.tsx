import { isExpoGo } from '@/constants/runtimeEnvironment';
import * as Linking from 'expo-linking';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const DOCS_URL = 'https://docs.expo.dev/develop/development-builds/introduction/';

/**
 * Full-screen gate when the app is opened in **Expo Go**. Native modules in this project
 * require a **development build**; Expo Go cannot load the same native surface.
 */
export function DevClientRequiredScreen() {
  if (Platform.OS === 'web' || !isExpoGo) {
    return null;
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.inner}>
        <Text style={styles.title}>Development build required</Text>
        <Text style={styles.body}>
          This app uses native modules (Stripe, maps, push notifications) that are not available
          in Expo Go. Install a development build from EAS, then run Metro with dev client.
        </Text>
        <Pressable
          style={styles.btn}
          onPress={() => void Linking.openURL(DOCS_URL)}
        >
          <Text style={styles.btnText}>Open Expo dev build docs</Text>
        </Pressable>
        <Text style={styles.mono}>eas build --profile development{'\n'}npx expo start --dev-client</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  inner: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { color: '#f8fafc', fontSize: 22, fontWeight: '800', marginBottom: 12 },
  body: { color: '#94a3b8', fontSize: 15, lineHeight: 22, marginBottom: 20 },
  btn: {
    alignSelf: 'flex-start',
    backgroundColor: '#22c55e',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 20,
  },
  btnText: { color: '#052e16', fontWeight: '800', fontSize: 15 },
  mono: { color: '#64748b', fontSize: 12, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) },
});
