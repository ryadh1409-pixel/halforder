import { CK } from '@/constants/checkoutUi';
import React, { memo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

// Metro resolves `./maps` → `maps/index.native.ts` | `maps/index.web.ts`; eslint import resolver does not.
// eslint-disable-next-line import/no-unresolved -- platform entrypoints
import MapRenderer from '@/components/maps';

export type DeliveryMapPin = {
  id: string;
  latitude: number;
  longitude: number;
};

type Props = {
  height?: number;
  center: { latitude: number; longitude: number };
  markers: DeliveryMapPin[];
  addressPrimary: string;
  addressSecondary?: string;
  onEditPin: () => void;
  /** Web fallback copy */
  mapTitle?: string;
  mapSubtitle?: string;
};

/**
 * Large rounded preview map card + floating “Edit pin” — uses platform `MapRenderer`.
 */
function DeliveryMapCardInner({
  height = 218,
  center,
  markers,
  addressPrimary,
  addressSecondary,
  onEditPin,
  mapTitle = 'Delivery area',
  mapSubtitle = 'Dropoff pin',
}: Props) {
  return (
    <View style={[styles.shell, { minHeight: height }]}>
      <View style={[styles.clip, { height }]}>
        <MapRenderer
          style={styles.mapFill}
          pointerEvents="none"
          initialRegion={{
            latitude: center.latitude,
            longitude: center.longitude,
            latitudeDelta: 0.012,
            longitudeDelta: 0.012,
          }}
          markers={markers.map((m) => ({
            id: m.id,
            latitude: m.latitude,
            longitude: m.longitude,
            pinColor: '#111827',
          }))}
          webTitle={mapTitle}
          webSubtitle={mapSubtitle}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit delivery pin"
          onPress={onEditPin}
          style={({ pressed }) => [styles.fabEdit, pressed && styles.fabEditPressed]}
        >
          <Text style={styles.fabTxt}>Edit pin</Text>
        </Pressable>
      </View>
      <View style={styles.addressBlock}>
        <Text style={styles.addrMain} numberOfLines={2}>
          {addressPrimary}
        </Text>
        {addressSecondary ? (
          <Text style={styles.addrSub} numberOfLines={2}>
            {addressSecondary}
          </Text>
        ) : null}
      </View>
      {Platform.OS === 'web' ? (
        <Text style={styles.webHint}>Map preview — native apps show full gesture map.</Text>
      ) : null}
    </View>
  );
}

export const DeliveryMapCard = memo(DeliveryMapCardInner);

const styles = StyleSheet.create({
  shell: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: CK.mapRadius,
    borderWidth: 1,
    borderColor: CK.border,
    overflow: 'hidden',
    backgroundColor: CK.bg,
    shadowColor: CK.shadow,
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  clip: { borderTopLeftRadius: CK.mapRadius, borderTopRightRadius: CK.mapRadius, overflow: 'hidden', position: 'relative' },
  mapFill: { ...StyleSheet.absoluteFillObject },
  fabEdit: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    backgroundColor: CK.bg,
    paddingHorizontal: 18,
    paddingVertical: Platform.select({ ios: 11, android: 10, web: 10 }),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(12,12,14,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  fabEditPressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  fabTxt: { fontSize: 14, fontWeight: '900', color: CK.text },
  addressBlock: { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: CK.bg },
  addrMain: { fontSize: 16, fontWeight: '900', color: CK.text, letterSpacing: -0.2, lineHeight: 22 },
  addrSub: { marginTop: 4, fontSize: 14, fontWeight: '600', color: CK.textSecondary, lineHeight: 19 },
  webHint: { paddingHorizontal: 16, paddingBottom: 10, fontSize: 11, fontWeight: '600', color: CK.textMuted },
});
