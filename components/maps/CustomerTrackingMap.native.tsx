/**
 * Customer live tracking map — native only (`react-native-maps` never imported on web).
 */
import { TrackingMapFallbackCard } from '@/components/maps/TrackingMapFallback';
import type { RestaurantOrder } from '@/services/orderService';
import React, { Component, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, {
  AnimatedRegion,
  Marker,
  MarkerAnimated,
  Polyline,
} from 'react-native-maps';

type LatLng = { latitude: number; longitude: number };

function toLatLng(
  loc: { lat: number; lng: number } | null | undefined,
): LatLng | null {
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return null;
  if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return null;
  return { latitude: loc.lat, longitude: loc.lng };
}

class MapErrorBoundary extends Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function TrackingMapInner({
  restaurant,
  dropoff,
  driver,
}: {
  restaurant: LatLng | null;
  dropoff: LatLng | null;
  driver: LatLng | null;
}) {
  const mapRef = useRef<MapView | null>(null);
  const driverAnimRef = useRef<AnimatedRegion | null>(null);
  const seededRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);

  const defaultCenter = restaurant ?? dropoff ?? driver ?? { latitude: 37.7749, longitude: -122.4194 };

  useEffect(() => {
    if (!driverAnimRef.current) {
      driverAnimRef.current = new AnimatedRegion({
        ...defaultCenter,
        latitudeDelta: 0,
        longitudeDelta: 0,
      });
      seededRef.current = false;
    }
  }, [defaultCenter.latitude, defaultCenter.longitude]);

  useEffect(() => {
    if (!driver || !driverAnimRef.current) return;
    const anim = driverAnimRef.current;
    if (!seededRef.current) {
      anim.setValue({ ...driver, latitudeDelta: 0, longitudeDelta: 0 });
      seededRef.current = true;
      return;
    }
    anim
      .timing({
        latitude: driver.latitude,
        longitude: driver.longitude,
        latitudeDelta: 0,
        longitudeDelta: 0,
        duration: 850,
        useNativeDriver: false,
      } as never)
      .start();
  }, [driver?.latitude, driver?.longitude]);

  const polyline = useMemo(() => {
    const pts: LatLng[] = [];
    if (restaurant) pts.push(restaurant);
    if (driver) pts.push(driver);
    if (dropoff) pts.push(dropoff);
    return pts;
  }, [restaurant, driver, dropoff]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || polyline.length < 2) return;
    const t = setTimeout(() => {
      try {
        mapRef.current?.fitToCoordinates?.(polyline, {
          edgePadding: { top: 100, right: 36, bottom: 40, left: 36 },
          animated: true,
        });
      } catch {
        /* ignore */
      }
    }, 450);
    return () => clearTimeout(t);
  }, [mapReady, polyline]);

  const anim = driverAnimRef.current;

  return (
    <MapView
      ref={mapRef}
      style={styles.mapView}
      initialRegion={{
        latitude: defaultCenter.latitude,
        longitude: defaultCenter.longitude,
        latitudeDelta: 0.06,
        longitudeDelta: 0.06,
      }}
      userInterfaceStyle="light"
      showsCompass={false}
      toolbarEnabled={false}
      onMapReady={() => setMapReady(true)}
    >
      {restaurant ? (
        <Marker coordinate={restaurant} tracksViewChanges={false} anchor={{ x: 0.5, y: 1 }}>
          <View style={styles.markerBubble}>
            <Text style={styles.markerEmoji}>📍</Text>
          </View>
        </Marker>
      ) : null}
      {dropoff ? (
        <Marker coordinate={dropoff} tracksViewChanges={false} anchor={{ x: 0.5, y: 1 }}>
          <View style={styles.markerBubble}>
            <Text style={styles.markerEmoji}>🏠</Text>
          </View>
        </Marker>
      ) : null}
      {driver && anim && MarkerAnimated ? (
        <MarkerAnimated coordinate={anim as never} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.driverMarker}>
            <Text style={styles.driverEmoji}>🚗</Text>
          </View>
        </MarkerAnimated>
      ) : driver ? (
        <Marker coordinate={driver} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.driverMarker}>
            <Text style={styles.driverEmoji}>🚗</Text>
          </View>
        </Marker>
      ) : null}
      {polyline.length >= 2 ? (
        <Polyline coordinates={polyline} strokeColor="#FF3008" strokeWidth={4} />
      ) : null}
    </MapView>
  );
}

export function CustomerTrackingMap({ order }: { order: RestaurantOrder }) {
  const restaurant = toLatLng(order.restaurantLocation);
  const dropoff = toLatLng(order.deliveryLocation);
  const driver = order.driverLocation ? toLatLng(order.driverLocation) : null;
  const pickupLabel =
    order.restaurant?.address?.trim() || order.restaurant?.name || 'Restaurant';
  const dropoffLabel =
    order.deliveryLocation?.address?.trim() || order.customer?.address || 'Your address';

  return (
    <MapErrorBoundary
      fallback={<TrackingMapFallbackCard pickup={pickupLabel} dropoff={dropoffLabel} />}
    >
      <TrackingMapInner key={order.id} restaurant={restaurant} dropoff={dropoff} driver={driver} />
    </MapErrorBoundary>
  );
}

const styles = StyleSheet.create({
  mapView: { flex: 1, width: '100%', minHeight: 200 },
  markerBubble: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.12)',
  },
  markerEmoji: { fontSize: 18 },
  driverMarker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FF3008',
  },
  driverEmoji: { fontSize: 22 },
});
