import { EMO_AI_ONLINE, EMO_AI_SURFACE } from '@/types/emoAi';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const AVATAR = require('../../assets/emo-ai/hero.png');

type Props = {
  onInfoPress?: () => void;
};

export function EmoAiHeader({ onInfoPress }: Props) {
  return (
    <View style={styles.row}>
      <Image source={AVATAR} style={styles.avatar} contentFit="cover" />
      <View style={styles.copy}>
        <Text style={styles.name}>Emo AI</Text>
        <View style={styles.onlineRow}>
          <View style={styles.onlineDot} />
          <Text style={styles.onlineText}>Online</Text>
        </View>
        <Text style={styles.subtitle}>Your meal companion</Text>
      </View>
      <TouchableOpacity
        onPress={onInfoPress}
        hitSlop={12}
        accessibilityLabel="About Emo AI"
      >
        <MaterialIcons name="info-outline" size={22} color="#7D8493" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: EMO_AI_SURFACE,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.35)',
  },
  copy: { flex: 1, minWidth: 0 },
  name: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  onlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: EMO_AI_ONLINE,
  },
  onlineText: {
    fontSize: 13,
    fontWeight: '600',
    color: EMO_AI_ONLINE,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500',
    color: '#7D8493',
  },
});
