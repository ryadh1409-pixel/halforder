import { goBackSafe, goHome } from '../lib/navigation';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

type AppHeaderProps = {
  title: string;
  showBack?: boolean;
  showHome?: boolean;
};

export default function AppHeader({
  title,
  showBack = true,
  showHome = true,
}: AppHeaderProps) {
  const handleBack = () => {
    if (__DEV__) {
      console.log('[AppHeader] Back press');
    }
    goBackSafe();
  };

  const handleHome = () => {
    if (__DEV__) {
      console.log('[AppHeader] Home press');
    }
    goHome();
  };

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.side} pointerEvents="box-none">
        {showBack ? (
          <Pressable
            style={styles.button}
            onPress={handleBack}
            hitSlop={12}
            android_ripple={
              Platform.OS === 'android'
                ? { color: 'rgba(168,85,247,0.2)' }
                : undefined
            }
          >
            <Text style={styles.buttonText}>Back</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.title} numberOfLines={1} pointerEvents="none">
        {title}
      </Text>
      <View style={[styles.side, styles.right]} pointerEvents="box-none">
        {showHome ? (
          <Pressable
            style={styles.button}
            onPress={handleHome}
            hitSlop={12}
            android_ripple={
              Platform.OS === 'android'
                ? { color: 'rgba(168,85,247,0.2)' }
                : undefined
            }
          >
            <Text style={styles.buttonText}>Home</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 20,
    elevation: 6,
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(168, 85, 247, 0.22)',
    backgroundColor: '#000000',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  side: { width: 70, zIndex: 2 },
  right: { alignItems: 'flex-end' },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    paddingHorizontal: 8,
    letterSpacing: -0.3,
  },
  button: {
    zIndex: 3,
    minHeight: 40,
    minWidth: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.35)',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#171923',
  },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
});
