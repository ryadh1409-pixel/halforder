import { checkoutPressableProps } from '@/constants/checkoutUi';
import React from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { MapRendererProps } from './types';

function openUrl(url: string | undefined) {
  if (!url?.trim()) return;
  void Linking.openURL(url).catch(() => undefined);
}

export default function WebMap({
  style,
  initialRegion,
  markers = [],
  polylines = [],
  webTitle = 'Map preview',
  webSubtitle,
  webEtaText,
  webFromCoordsText,
  webToCoordsText,
  webOpenMapsUrl,
}: MapRendererProps) {
  const center = `${initialRegion.latitude.toFixed(4)}, ${initialRegion.longitude.toFixed(4)}`;
  const firstMarker = markers[0];
  const secondMarker = markers[1];
  const mapsUrl =
    webOpenMapsUrl ||
    (firstMarker
      ? `https://www.google.com/maps/search/?api=1&query=${firstMarker.latitude},${firstMarker.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${initialRegion.latitude},${initialRegion.longitude}`);

  const routeHint =
    polylines.length > 0 && polylines[0].coordinates.length > 1
      ? `${polylines[0].coordinates.length} route points (live map on iOS/Android)`
      : 'Live map on iOS/Android';

  return (
    <View style={[styles.root, style]}>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderTitle}>{webTitle}</Text>
        {webSubtitle ? <Text style={styles.sub}>{webSubtitle}</Text> : null}
        <Text style={styles.muted}>{routeHint}</Text>
        {webEtaText ? <Text style={styles.eta}>{webEtaText}</Text> : null}
        <View style={styles.row}>
          <Text style={styles.label}>Center</Text>
          <Text style={styles.mono}>{center}</Text>
        </View>
        {firstMarker ? (
          <View style={styles.row}>
            <Text style={styles.label}>Point A</Text>
            <Text style={styles.mono}>
              {firstMarker.latitude.toFixed(5)}, {firstMarker.longitude.toFixed(5)}
              {webFromCoordsText ? ` — ${webFromCoordsText}` : ''}
            </Text>
          </View>
        ) : null}
        {secondMarker ? (
          <View style={styles.row}>
            <Text style={styles.label}>Point B</Text>
            <Text style={styles.mono}>
              {secondMarker.latitude.toFixed(5)}, {secondMarker.longitude.toFixed(5)}
              {webToCoordsText ? ` — ${webToCoordsText}` : ''}
            </Text>
          </View>
        ) : null}
        <Pressable {...checkoutPressableProps} style={styles.btn} onPress={() => openUrl(mapsUrl)}>
          <Text style={styles.btnText}>Open in Google Maps</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
    backgroundColor: '#E8EDF3',
    borderRadius: 12,
  },
  placeholder: {
    flex: 1,
    padding: 14,
    justifyContent: 'center',
    gap: 8,
  },
  placeholderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  sub: { fontSize: 14, color: '#334155', fontWeight: '600' },
  muted: { fontSize: 12, color: '#64748b' },
  eta: { fontSize: 13, color: '#0f766e', fontWeight: '700' },
  row: { marginTop: 4 },
  label: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' },
  mono: { fontSize: 12, color: '#0f172a', fontFamily: 'monospace' },
  btn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});

export type { MapRendererProps };
