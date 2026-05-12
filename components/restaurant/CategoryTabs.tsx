import { RP } from '@/constants/restaurantPremiumTheme';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Props = {
  categories: string[];
  active: string;
  onSelect: (c: string) => void;
};

export function CategoryTabs({ categories, active, onSelect }: Props) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {categories.map((c) => {
          const on = c === active;
          return (
            <Pressable
              key={c}
              onPress={() => {
                void Haptics.selectionAsync();
                onSelect(c);
              }}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{c}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: RP.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: RP.border,
    paddingVertical: 10,
  },
  row: { paddingHorizontal: 16, gap: 10, alignItems: 'center' },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: RP.surface,
    borderWidth: 1,
    borderColor: RP.border,
  },
  chipOn: {
    backgroundColor: RP.text,
    borderColor: RP.text,
  },
  chipText: { fontSize: 14, fontWeight: '700', color: RP.textSecondary },
  chipTextOn: { color: RP.bg, fontWeight: '900' },
});
