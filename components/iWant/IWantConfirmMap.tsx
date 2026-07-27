import { LocationScreenMap } from '@/components/location/LocationScreenMap';
import { EMO_AI_PURPLE } from '@/types/emoAi';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

export type IWantMapCoords = {
  latitude: number;
  longitude: number;
};

type Props = {
  latitude: number;
  longitude: number;
  height?: number;
  locating?: boolean;
  onRegionSettled: (coords: IWantMapCoords) => void;
  onPressCurrentLocation: () => void;
  onDragStateChange?: (dragging: boolean) => void;
};

/**
 * Web fallback — preview map via existing LocationScreenMap.
 * Drag-to-adjust pin is native-only; current-location still available.
 */
export function IWantConfirmMap({
  latitude,
  longitude,
  height = 320,
  locating = false,
  onPressCurrentLocation,
}: Props) {
  return (
    <View style={[styles.wrap, { height }]}>
      <LocationScreenMap
        latitude={latitude}
        longitude={longitude}
        height={height}
      />
      <View style={styles.controls}>
        <Pressable
          style={styles.controlBtn}
          onPress={onPressCurrentLocation}
          accessibilityLabel="Use current location"
        >
          {locating ? (
            <ActivityIndicator color={EMO_AI_PURPLE} size="small" />
          ) : (
            <Ionicons name="locate" size={20} color={EMO_AI_PURPLE} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  controls: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    gap: 8,
  },
  controlBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(23, 25, 35, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
