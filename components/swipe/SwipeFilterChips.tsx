import {
  SWIPE_FILTER_CHIPS,
  type SwipeFilterKey,
} from '@/constants/swipeDiscovery';
import { BlurView } from 'expo-blur';
import React, { memo } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Props = {
  active: SwipeFilterKey;
  onChange: (key: SwipeFilterKey) => void;
};

function SwipeFilterChipsInner({ active, onChange }: Props) {
  const chips = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      {SWIPE_FILTER_CHIPS.map((c) => {
        const on = active === c.key;
        return (
          <Pressable
            key={c.key}
            onPress={() => onChange(c.key)}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{c.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  if (Platform.OS === 'ios') {
    return (
      <BlurView intensity={48} tint="dark" style={styles.bar}>
        {chips}
      </BlurView>
    );
  }
  return <View style={[styles.bar, styles.barAndroid]}>{chips}</View>;
}

export const SwipeFilterChips = memo(SwipeFilterChipsInner);

const styles = StyleSheet.create({
  bar: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 12,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  barAndroid: {
    backgroundColor: 'rgba(18,22,30,0.88)',
  },
  scroll: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginRight: 8,
  },
  chipOn: {
    backgroundColor: '#FFFFFF',
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.72)',
  },
  labelOn: {
    color: '#0A0A0A',
    fontWeight: '900',
  },
});
