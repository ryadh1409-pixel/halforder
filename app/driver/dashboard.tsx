import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

const LEGACY_DRIVER_HUB = '/(driver)' as never;

export default function LegacyDriverPath() {
  const didReplace = useRef(false);

  useEffect(() => {
    if (didReplace.current) return;
    didReplace.current = true;
    router.replace(LEGACY_DRIVER_HUB);
  }, []);

  return (
    <View style={styles.root}>
      <ActivityIndicator size="large" color="#16A34A" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A' },
});
