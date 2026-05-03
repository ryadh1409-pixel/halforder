import { FoodSwipeCardDetails, type FoodSwipeCardDetailsProps } from '@/components/FoodSwipeCardDetails';
import { Image as ExpoImage } from 'expo-image';
import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';

const CARD_HEIGHT = Dimensions.get('window').height * 0.75;
const IMAGE_HEIGHT = 250;

export type FoodCardProps = {
  imageUri: string;
  details: FoodSwipeCardDetailsProps;
};

/**
 * Single swipe card face — fixed height, no nested scroll, image cover.
 */
export const FoodCard = React.memo(function FoodCard({ imageUri, details }: FoodCardProps) {
  return (
    <View style={[styles.container, { height: CARD_HEIGHT }]}>
      <ExpoImage
        source={{ uri: imageUri }}
        style={styles.image}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
      <View style={styles.info}>
        <FoodSwipeCardDetails {...details} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#11161F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  image: {
    width: '100%',
    height: IMAGE_HEIGHT,
    backgroundColor: '#222',
  },
  info: {
    flex: 1,
    minHeight: 0,
    padding: 16,
    overflow: 'hidden',
  },
});

export { CARD_HEIGHT as FOOD_CARD_HEIGHT, IMAGE_HEIGHT as FOOD_CARD_IMAGE_HEIGHT };
