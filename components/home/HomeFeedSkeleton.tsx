import { ShimmerSkeleton } from '@/components/ShimmerSkeleton';
import { UE } from '@/constants/uberEatsTheme';
import React, { memo } from 'react';
import { Dimensions, ScrollView, StyleSheet, View } from 'react-native';

const CARD_W = Math.round(
  Dimensions.get('window').width * UE.restaurantCardWidthRatio,
);

function RestaurantCardSkeleton() {
  return (
    <View style={[styles.card, { width: CARD_W }]}>
      <ShimmerSkeleton
        width="100%"
        height={Math.round(CARD_W / UE.cardImageRatio)}
        borderRadius={UE.radiusXL + 2}
        tone="light"
      />
      <ShimmerSkeleton
        width="88%"
        height={20}
        borderRadius={8}
        tone="light"
        style={styles.line1}
      />
      <ShimmerSkeleton
        width="62%"
        height={14}
        borderRadius={6}
        tone="light"
        style={styles.line2}
      />
    </View>
  );
}

function SectionSkeleton() {
  return (
    <View style={styles.section}>
      <ShimmerSkeleton
        width={200}
        height={22}
        borderRadius={8}
        tone="light"
        style={styles.sectionTitle}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        <RestaurantCardSkeleton />
        <RestaurantCardSkeleton />
      </ScrollView>
    </View>
  );
}

/** Home feed placeholder while Firestore restaurants load. */
function HomeFeedSkeletonInner() {
  return (
    <View style={styles.wrap}>
      <ShimmerSkeleton
        width={Dimensions.get('window').width - 32}
        height={176}
        borderRadius={UE.radiusXL + 4}
        tone="light"
        style={styles.banner}
      />
      <SectionSkeleton />
      <SectionSkeleton />
    </View>
  );
}

export const HomeFeedSkeleton = memo(HomeFeedSkeletonInner);

const styles = StyleSheet.create({
  wrap: { paddingTop: 8 },
  banner: { marginHorizontal: UE.spaceCard, marginBottom: UE.spaceBlock },
  section: { marginTop: UE.spaceSection },
  sectionTitle: {
    marginHorizontal: UE.spaceCard,
    marginBottom: UE.spaceInline,
  },
  row: { paddingHorizontal: UE.spaceCard, gap: UE.spaceCard },
  card: { marginRight: UE.spaceCard },
  line1: { marginTop: UE.spaceInline },
  line2: { marginTop: 10 },
});
