import { RestaurantCard } from '@/components/home/RestaurantCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { UE } from '@/constants/uberEatsTheme';
import type { PromotionDestinationKey } from '@/lib/promotionBadge';
import type { HomeRestaurant } from '@/types/homeRestaurant';
import React, { memo } from 'react';
import { Dimensions, ScrollView, StyleSheet, View } from 'react-native';

const CARD_W = Math.round(
  Dimensions.get('window').width * UE.restaurantCardWidthRatio,
);
const SNAP = CARD_W + UE.spaceCard;

type Props = {
  title: string;
  subtitle?: string;
  restaurants: HomeRestaurant[];
  onRestaurantPress: (id: string) => void;
  promotionDestination?:
    | PromotionDestinationKey
    | ReadonlyArray<PromotionDestinationKey>;
};

function FeaturedSectionInner({
  title,
  subtitle,
  restaurants,
  onRestaurantPress,
  promotionDestination = ['home', 'featured'],
}: Props) {
  if (restaurants.length === 0) return null;

  return (
    <View style={styles.block}>
      <SectionHeader title={title} subtitle={subtitle} />
      <ScrollView
        horizontal
        decelerationRate="fast"
        snapToInterval={SNAP}
        snapToAlignment="start"
        disableIntervalMomentum
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {restaurants.map((r) => (
          <RestaurantCard
            key={`${title}-${r.id}`}
            restaurant={r}
            width={CARD_W}
            promotionDestination={promotionDestination}
            onPress={() => onRestaurantPress(r.id)}
          />
        ))}
        <View style={styles.trail} />
      </ScrollView>
    </View>
  );
}

export const FeaturedSection = memo(FeaturedSectionInner);

const styles = StyleSheet.create({
  block: { marginBottom: UE.spaceBlock },
  scroll: {
    paddingHorizontal: UE.spaceCard,
    paddingBottom: 8,
    paddingTop: 2,
  },
  trail: { width: UE.spaceCard },
});
