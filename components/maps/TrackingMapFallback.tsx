import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function TrackingMapFallbackCard({
  pickup,
  dropoff,
}: {
  pickup: string;
  dropoff: string;
}) {
  return (
    <LinearGradient
      colors={['#E8F4FF', '#FFFFFF', '#FFF5F0']}
      style={styles.root}
    >
      <Text style={styles.title}>Delivery route</Text>
      <View style={styles.row}>
        <Text style={styles.emoji}>📍</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Pickup</Text>
          <Text style={styles.addr}>{pickup || 'Restaurant address'}</Text>
        </View>
      </View>
      <View style={styles.divider} />
      <View style={styles.row}>
        <Text style={styles.emoji}>🏠</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Dropoff</Text>
          <Text style={styles.addr}>{dropoff || 'Your address'}</Text>
        </View>
      </View>
      <Text style={styles.hint}>Map preview on web — live map on iOS/Android.</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  emoji: { fontSize: 22, marginTop: 2 },
  label: { fontSize: 12, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' },
  addr: { fontSize: 14, color: '#0f172a', fontWeight: '600', marginTop: 2 },
  divider: { height: 1, backgroundColor: 'rgba(15,23,42,0.08)', marginVertical: 10 },
  hint: { fontSize: 12, color: '#64748b', marginTop: 8, fontWeight: '500' },
});
