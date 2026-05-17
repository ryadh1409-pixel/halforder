import { CategoryChip } from '@/components/ui/CategoryChip';
import { UE } from '@/constants/uberEatsTheme';
import React, { memo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

export const HOME_CATEGORIES = [
  'All',
  'Grocery',
  'Pickup',
  'Offers',
  'Coffee',
  'Burgers',
  'Pizza',
] as const;

export type HomeCategory = (typeof HOME_CATEGORIES)[number];

type Props = {
  active: HomeCategory;
  onChange: (cat: HomeCategory) => void;
};

function CategoryChipsRowInner({ active, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      {HOME_CATEGORIES.map((cat) => (
        <CategoryChip
          key={cat}
          label={cat}
          active={active === cat}
          onPress={() => onChange(cat)}
        />
      ))}
    </ScrollView>
  );
}

export const CategoryChipsRow = memo(CategoryChipsRowInner);

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: UE.spaceCard,
    paddingTop: 4,
    paddingBottom: UE.spaceInline,
  },
});
