import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type MapProps = {
  style?: object;
  children?: React.ReactNode;
};

export function Map({ style }: MapProps) {
  return (
    <View style={[styles.wrap, style]}>
      <Text style={styles.text}>Map not supported on web</Text>
    </View>
  );
}

export function MapMarker() {
  return null;
}

export function MapPolyline() {
  return null;
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
  },
  text: { color: '#B7BDC9', fontWeight: '700' },
});
