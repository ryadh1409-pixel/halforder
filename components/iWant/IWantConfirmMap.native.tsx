import { getNativeMapProvider } from '@/lib/maps/iosMapProvider';
import { EMO_AI_PURPLE } from '@/types/emoAi';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

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

const DELTA = 0.006;

/**
 * Uber-style delivery pin: map pans under a fixed center pin.
 * Reuses react-native-maps + the app's Google/Apple provider stack.
 */
export function IWantConfirmMap({
  latitude,
  longitude,
  height = 320,
  locating = false,
  onRegionSettled,
  onPressCurrentLocation,
  onDragStateChange,
}: Props) {
  const mapRef = useRef<MapView | null>(null);
  const skipNextSettle = useRef(true);
  const programmaticMove = useRef(false);
  const [ready, setReady] = useState(false);
  const pinLift = useSharedValue(0);

  useEffect(() => {
    if (!ready) return;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    programmaticMove.current = true;
    skipNextSettle.current = true;
    mapRef.current?.animateToRegion(
      {
        latitude,
        longitude,
        latitudeDelta: DELTA,
        longitudeDelta: DELTA,
      },
      380,
    );
    const t = setTimeout(() => {
      programmaticMove.current = false;
    }, 420);
    return () => clearTimeout(t);
  }, [latitude, longitude, ready]);

  const onRegionChange = useCallback(() => {
    if (programmaticMove.current) return;
    pinLift.value = withSpring(-10, { damping: 16, stiffness: 220 });
  }, [pinLift]);

  const onRegionChangeComplete = useCallback(
    (region: Region) => {
      pinLift.value = withSpring(0, { damping: 14, stiffness: 200 });
      onDragStateChange?.(false);
      if (programmaticMove.current) return;
      if (skipNextSettle.current) {
        skipNextSettle.current = false;
        return;
      }
      if (!Number.isFinite(region.latitude) || !Number.isFinite(region.longitude)) {
        return;
      }
      onRegionSettled({
        latitude: region.latitude,
        longitude: region.longitude,
      });
    },
    [onDragStateChange, onRegionSettled, pinLift],
  );

  const pinStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pinLift.value }],
  }));

  const zoomBy = useCallback((factor: number) => {
    mapRef.current?.getCamera().then((camera) => {
      const next = {
        ...camera,
        altitude:
          typeof camera.altitude === 'number'
            ? Math.max(200, camera.altitude * factor)
            : camera.altitude,
        zoom:
          typeof camera.zoom === 'number'
            ? Math.max(3, Math.min(20, camera.zoom + (factor < 1 ? 1 : -1)))
            : camera.zoom,
      };
      mapRef.current?.animateCamera(next, { duration: 220 });
    }).catch(() => {
      /* camera API unavailable on some providers */
    });
  }, []);

  return (
    <View style={[styles.card, { height }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={getNativeMapProvider()}
        initialRegion={{
          latitude,
          longitude,
          latitudeDelta: DELTA,
          longitudeDelta: DELTA,
        }}
        onMapReady={() => setReady(true)}
        onPanDrag={() => onDragStateChange?.(true)}
        onRegionChange={onRegionChange}
        onRegionChangeComplete={onRegionChangeComplete}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        userInterfaceStyle="dark"
      />

      <View pointerEvents="none" style={styles.pinLayer}>
        <Animated.View style={[styles.pinWrap, pinStyle]}>
          <View style={styles.pinHead}>
            <Ionicons name="location" size={22} color="#FFFFFF" />
          </View>
          <View style={styles.pinPoint} />
        </Animated.View>
        <View style={styles.pinShadow} />
      </View>

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
        <Pressable
          style={styles.controlBtn}
          onPress={() => zoomBy(0.55)}
          accessibilityLabel="Zoom in"
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
        </Pressable>
        <Pressable
          style={styles.controlBtn}
          onPress={() => zoomBy(1.8)}
          accessibilityLabel="Zoom out"
        >
          <Ionicons name="remove" size={20} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.28)',
    backgroundColor: '#151126',
  },
  pinLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinWrap: {
    alignItems: 'center',
    marginBottom: 28,
  },
  pinHead: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: EMO_AI_PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  pinPoint: {
    width: 0,
    height: 0,
    marginTop: -2,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: EMO_AI_PURPLE,
  },
  pinShadow: {
    position: 'absolute',
    width: 14,
    height: 6,
    borderRadius: 7,
    backgroundColor: 'rgba(0,0,0,0.35)',
    bottom: '46%',
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
