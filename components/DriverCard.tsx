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
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#000000',
    padding: 12,
    marginBottom: 8,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  phone: { marginTop: 4, color: '#7D8493', fontWeight: '600' },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  onlineBadge: { backgroundColor: '#DCFCE7' },
  offlineBadge: { backgroundColor: '#171923' },
  statusText: { fontWeight: '700', fontSize: 12 },
  onlineText: { color: '#166534' },
  offlineText: { color: '#B7BDC9' },
});
