import React from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

export type DashboardMenuItem = {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
};

type MenuItemCardProps = {
  item: DashboardMenuItem;
  onToggleAvailability: (id: string, value: boolean) => void;
  onEdit: (id: string) => void;
};

export function MenuItemCard({
  item,
  onToggleAvailability,
  onEdit,
}: MenuItemCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.info}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.price}>${item.price.toFixed(2)}</Text>
      </View>
      <View style={styles.controls}>
        <Switch
          value={item.isAvailable}
          onValueChange={(v) => onToggleAvailability(item.id, v)}
          trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
          thumbColor={item.isAvailable ? '#16A34A' : '#94A3B8'}
        />
        <Pressable style={styles.editButton} onPress={() => onEdit(item.id)}>
          <Text style={styles.editText}>Edit</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  info: { flex: 1, paddingRight: 12 },
  name: { color: '#0F172A', fontWeight: '700', fontSize: 16 },
  price: { color: '#64748B', fontWeight: '600', marginTop: 4 },
  controls: { alignItems: 'flex-end', gap: 8 },
  editButton: {
    height: 34,
    minWidth: 64,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  editText: { color: '#334155', fontWeight: '700' },
});
