import { CK, checkoutPressableProps } from '@/constants/checkoutUi';
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
 * Map preview that integrates with the address list — light chrome, no heavy card.
 */
function DeliveryMapCardInner({
  height = 168,
  center,
  markers,
  addressPrimary,
  addressSecondary,
  onEditPin,
  mapTitle = 'Delivery area',
  mapSubtitle = 'Dropoff pin',
}: Props) {
  return (
    <View style={styles.shell}>
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
            pinColor: '#171923',
          }))}
          webTitle={mapTitle}
          webSubtitle={mapSubtitle}
        />
        <Pressable
          {...checkoutPressableProps}
          accessibilityLabel="Edit delivery pin"
          onPress={onEditPin}
          style={({ pressed }) => [
            styles.fabEdit,
            pressed && styles.fabEditPressed,
          ]}
        >
          <Text style={styles.fabTxt}>Edit</Text>
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
        <Text style={styles.webHint}>
          Map preview — native apps show full gesture map.
        </Text>
      ) : null}
    </View>
  );
}

export const DeliveryMapCard = memo(DeliveryMapCardInner);

const styles = StyleSheet.create({
  shell: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  clip: {
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  mapFill: { ...StyleSheet.absoluteFillObject },
  fabEdit: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    backgroundColor: 'rgba(23,25,35,0.88)',
    paddingHorizontal: 14,
    paddingVertical: Platform.select({ ios: 8, android: 8, web: 8 }),
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  fabEditPressed: { opacity: 0.88 },
  fabTxt: { fontSize: 13, fontWeight: '700', color: CK.text },
  addressBlock: {
    paddingHorizontal: 2,
    paddingTop: 12,
    paddingBottom: 4,
  },
  addrMain: {
    fontSize: 15,
    fontWeight: '700',
    color: CK.text,
    letterSpacing: -0.15,
    lineHeight: 20,
  },
  addrSub: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '500',
    color: CK.textSecondary,
    lineHeight: 18,
  },
  webHint: {
    paddingHorizontal: 2,
    paddingBottom: 4,
    fontSize: 11,
    fontWeight: '600',
    color: CK.textMuted,
  },
});
