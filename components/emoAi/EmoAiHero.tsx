import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View } from 'react-native';

const HERO = require('../../assets/emo-ai/hero.png');

export function EmoAiHero() {
  return (
    <View style={styles.wrap}>
      <Image source={HERO} style={styles.image} contentFit="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    borderRadius: 22,
    overflow: 'hidden',
    height: 200,
    backgroundColor: '#171923',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.22)',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
