import { UE } from '@/constants/uberEatsTheme';
import type { DisplayMenuItem } from '@/utils/menuDisplayEnrich';
import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  MenuCarouselCard,
  MENU_CARD_WIDTH,
} from '@/components/menu/MenuCarouselCard';

const SNAP = MENU_CARD_WIDTH + 14;

type Props = {
  title: string;
  subtitle?: string;
  items: DisplayMenuItem[];
  qtyForItem: (id: string) => number;
  onItemPress: (item: DisplayMenuItem) => void;
  onItemAdd: (item: DisplayMenuItem) => void;
  containerStyle?: StyleProp<ViewStyle>;
};

export function MenuHorizontalCarousel({
  title,
  subtitle,
  items,
  qtyForItem,
  onItemPress,
  onItemAdd,
  containerStyle,
}: Props) {
  if (items.length === 0) return null;

  const renderItem = ({ item }: ListRenderItemInfo<DisplayMenuItem>) => (
    <MenuCarouselCard
      item={item}
      qty={qtyForItem(item.id)}
      onPress={() => onItemPress(item)}
      onAdd={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onItemAdd(item);
      }}
    />
  );

  return (
    <View style={[styles.block, containerStyle]}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      </View>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ width: 14 }} />}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listPad}
        decelerationRate="fast"
        snapToInterval={Platform.OS !== 'web' ? SNAP : undefined}
        snapToAlignment="start"
        disableIntervalMomentum
      />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: UE.spaceBlock },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: UE.spaceCard,
    marginBottom: UE.spaceInline,
    gap: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: UE.text,
    letterSpacing: -0.4,
    flexShrink: 1,
  },
  sub: { fontSize: 14, fontWeight: '600', color: UE.textMuted },
  listPad: { paddingHorizontal: UE.spaceCard, paddingBottom: 24 },
});
