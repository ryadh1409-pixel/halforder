import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { DriverDoc } from '@/services/deliveryTracking';

export function DriverInfoCard({
  driver,
  onCallPress,
}: {
  driver: DriverDoc | null;
  onCallPress: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        {driver?.photoUrl ? (
          <Image source={{ uri: driver.photoUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{driver?.name ?? 'Driver assigned soon'}</Text>
          <Text style={styles.meta}>
            ⭐ {driver?.rating?.toFixed(1) ?? '4.8'} · {driver?.vehicle ?? 'Scooter'}
          </Text>
        </View>
        <Pressable style={styles.callButton} onPress={onCallPress}>
          <Text style={styles.callButtonText}>Call</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#E2E8F0' },
  avatarPlaceholder: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  name: { color: '#0F172A', fontSize: 16, fontWeight: '800' },
  meta: { marginTop: 4, color: '#64748B', fontSize: 13, fontWeight: '600' },
  callButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    height: 40,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
});
