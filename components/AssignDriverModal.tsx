import { DriverCard } from './DriverCard';
import { type DriverProfile } from '../services/driverService';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

type AssignDriverModalProps = {
  visible: boolean;
  drivers: DriverProfile[];
  loading?: boolean;
  onClose: () => void;
  onSelectDriver: (driver: DriverProfile) => void;
};

export function AssignDriverModal({
  visible,
  drivers,
  loading = false,
  onClose,
  onSelectDriver,
}: AssignDriverModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Assign Driver</Text>
          {loading ? (
            <Text style={styles.hint}>Loading drivers...</Text>
          ) : drivers.length === 0 ? (
            <Text style={styles.hint}>No drivers found.</Text>
          ) : (
            drivers.map((driver) => (
              <DriverCard key={driver.id} driver={driver} onSelect={onSelectDriver} />
            ))
          )}
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.45)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  card: { borderRadius: 16, backgroundColor: '#FFFFFF', padding: 16 },
  title: { color: '#0F172A', fontSize: 20, fontWeight: '800', marginBottom: 12 },
  hint: { color: '#64748B', fontWeight: '600', marginBottom: 12 },
  closeButton: { marginTop: 6, alignSelf: 'flex-end', paddingHorizontal: 10, height: 34, justifyContent: 'center' },
  closeText: { color: '#64748B', fontWeight: '700' },
});
