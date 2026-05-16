import { RP } from '@/constants/restaurantPremiumTheme';
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

import { MenuCarouselCard } from '@/components/menu/MenuCarouselCard';

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
        ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listPad}
        decelerationRate={Platform.OS === 'ios' ? 'fast' : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: 8 },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 14,
    gap: 10,
  },
  title: { fontSize: 22, fontWeight: '900', color: RP.text, letterSpacing: -0.4, flexShrink: 1 },
  sub: { fontSize: 13, fontWeight: '600', color: RP.textMuted },
  listPad: { paddingHorizontal: 16, paddingBottom: 20 },
});
