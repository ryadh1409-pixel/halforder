import { RP } from '@/constants/restaurantPremiumTheme';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  restaurantName: string;
  imageUri: string | null;
  itemCount: number;
  children: React.ReactNode;
};

export function CheckoutSummary({ restaurantName, imageUri, itemCount, children }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => {
          void Haptics.selectionAsync();
          setOpen((o) => !o);
        }}
        style={styles.head}
      >
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbPh]}>
            <Text style={styles.thumbTxt}>{restaurantName.charAt(0)}</Text>
          </View>
        )}
        <View style={styles.headMid}>
          <Text style={styles.name} numberOfLines={1}>
            {restaurantName}
          </Text>
          <Text style={styles.sub}>
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </Text>
        </View>
        <Text style={styles.chev}>{open ? '▾' : '▸'}</Text>
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 18,
    borderRadius: RP.radiusM,
    borderWidth: 1,
    borderColor: RP.border,
    backgroundColor: RP.bg,
    overflow: 'hidden',
    shadowColor: RP.shadow,
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  head: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  thumb: { width: 48, height: 48, borderRadius: 12, backgroundColor: RP.surface2 },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  thumbTxt: { fontSize: 18, fontWeight: '900', color: RP.text },
  headMid: { flex: 1, minWidth: 0 },
  name: { fontSize: 17, fontWeight: '900', color: RP.text },
  sub: { marginTop: 2, fontSize: 13, fontWeight: '600', color: RP.textSecondary },
  chev: { fontSize: 18, color: RP.textMuted, fontWeight: '700' },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: RP.border,
    gap: 8,
  },
});
