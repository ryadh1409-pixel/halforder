import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

const CARD = '#ffffff';
const TEXT = '#0f172a';
const MUTED = '#64748b';
const PRIMARY = '#16a34a';

export type FoodCardProps = {
  imageUri: string | null;
  title: string;
  priceLabel: string;
  active: boolean;
  onPress: () => void;
  onActiveChange: (value: boolean) => void;
  activeDisabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function FoodCard({
  imageUri,
  title,
  priceLabel,
  active,
  onPress,
  onActiveChange,
  activeDisabled,
  style,
}: FoodCardProps) {
  return (
    <View style={[styles.shell, style]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
      >
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePh]} />
        )}
        <Text style={styles.title} numberOfLines={2}>
          {title || 'Untitled'}
        </Text>
        <Text style={styles.price}>{priceLabel}</Text>
      </Pressable>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Active</Text>
        <Switch
          value={active}
          onValueChange={onActiveChange}
          disabled={activeDisabled}
          trackColor={{
            false: 'rgba(148, 163, 184, 0.45)',
            true: 'rgba(22, 163, 74, 0.45)',
          }}
          thumbColor={active ? PRIMARY : '#f1f5f9'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: CARD,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  pressable: {
    paddingBottom: 4,
  },
  pressed: {
    opacity: 0.92,
  },
  image: {
    width: '100%',
    height: 96,
    backgroundColor: '#e2e8f0',
  },
  imagePh: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    fontWeight: '700',
    color: TEXT,
    minHeight: 36,
  },
  price: {
    paddingHorizontal: 10,
    marginTop: 2,
    fontSize: 15,
    fontWeight: '700',
    color: PRIMARY,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15, 23, 42, 0.08)',
  },
  switchLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: MUTED,
  },
});
