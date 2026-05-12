import { RP } from '@/constants/restaurantPremiumTheme';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

export type DeliveryTimeChoice = 'priority' | 'standard' | 'scheduled';

type Props = {
  value: DeliveryTimeChoice;
  onChange: (v: DeliveryTimeChoice) => void;
};

export function DeliveryTimeSelector({ value, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Delivery time</Text>
      <View style={styles.row}>
        <TimeCard
          label="Priority"
          sub="~20 min"
          price="+$2.49"
          on={value === 'priority'}
          onPress={() => {
            void Haptics.selectionAsync();
            onChange('priority');
          }}
        />
        <TimeCard
          label="Standard"
          sub="30–40 min"
          price="Free"
          on={value === 'standard'}
          onPress={() => {
            void Haptics.selectionAsync();
            onChange('standard');
          }}
        />
        <TimeCard
          label="Scheduled"
          sub="Pick a window"
          price=""
          on={value === 'scheduled'}
          onPress={() => {
            void Haptics.selectionAsync();
            onChange('scheduled');
          }}
        />
      </View>
    </View>
  );
}

function TimeCard({
  label,
  sub,
  price,
  on,
  onPress,
}: {
  label: string;
  sub: string;
  price: string;
  on: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable onPress={onPress} style={styles.cell}>
      <Animated.View style={[styles.card, on && styles.cardOn, anim]}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.sub}>{sub}</Text>
        {price ? <Text style={styles.price}>{price}</Text> : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 22 },
  title: {
    fontSize: 12,
    fontWeight: '800',
    color: RP.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  row: { flexDirection: 'row', gap: 10 },
  cell: { flex: 1 },
  card: {
    borderRadius: RP.radiusM,
    borderWidth: 1,
    borderColor: RP.border,
    backgroundColor: RP.bg,
    padding: 12,
    minHeight: 100,
    shadowColor: RP.shadow,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardOn: {
    borderWidth: 2,
    borderColor: RP.text,
    shadowOpacity: 0.55,
    elevation: 5,
  },
  label: { fontSize: 15, fontWeight: '900', color: RP.text },
  sub: { marginTop: 4, fontSize: 12, fontWeight: '600', color: RP.textSecondary },
  price: { marginTop: 8, fontSize: 12, fontWeight: '800', color: RP.accent },
});
