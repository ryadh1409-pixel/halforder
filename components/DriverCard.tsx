import { type DriverProfile } from '../services/driverService';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type DriverCardProps = {
  driver: DriverProfile;
  onSelect: (driver: DriverProfile) => void;
};

export function DriverCard({ driver, onSelect }: DriverCardProps) {
  return (
    <Pressable style={styles.card} onPress={() => onSelect(driver)}>
      <View style={styles.row}>
        <Text style={styles.name}>{driver.name}</Text>
        <View
          style={[
            styles.statusBadge,
            driver.isOnline ? styles.onlineBadge : styles.offlineBadge,
          ]}
        >
          <Text
            style={[
              styles.statusText,
              driver.isOnline ? styles.onlineText : styles.offlineText,
            ]}
          >
            {driver.isOnline ? 'Online' : 'Offline'}
          </Text>
        </View>
      </View>
      <Text style={styles.phone}>{driver.phone ?? 'No phone'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 12,
    marginBottom: 8,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { color: '#0F172A', fontWeight: '700', fontSize: 16 },
  phone: { marginTop: 4, color: '#64748B', fontWeight: '600' },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  onlineBadge: { backgroundColor: '#DCFCE7' },
  offlineBadge: { backgroundColor: '#F1F5F9' },
  statusText: { fontWeight: '700', fontSize: 12 },
  onlineText: { color: '#166534' },
  offlineText: { color: '#334155' },
});
