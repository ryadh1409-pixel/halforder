import {
  formatVehicleMakeModel,
  hasAnyVehicleInfo,
  type DriverVehicleInfo,
} from '@/lib/driverVehicle';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  driverName: string;
  driverPhotoURL?: string | null;
  driverPhone?: string | null;
  vehicle: DriverVehicleInfo;
  /** When true, show phone row (admin). */
  showPhone?: boolean;
  dark?: boolean;
  heading?: string;
};

/**
 * Uber Eats–style courier + vehicle summary for customer tracking / admin map.
 */
export function DriverVehicleInfoCard({
  driverName,
  driverPhotoURL,
  driverPhone,
  vehicle,
  showPhone = false,
  dark = true,
  heading = 'Your courier',
}: Props) {
  const makeModel = formatVehicleMakeModel(vehicle);
  const colors = dark
    ? {
        card: '#111827',
        border: 'rgba(255,255,255,0.1)',
        title: '#FFFFFF',
        muted: '#9CA3AF',
        plateBg: '#1F2937',
        plateText: '#F9FAFB',
        placeholder: '#1F2937',
      }
    : {
        card: '#FFFFFF',
        border: 'rgba(0,0,0,0.08)',
        title: '#111827',
        muted: '#6B7280',
        plateBg: '#F3F4F6',
        plateText: '#111827',
        placeholder: '#E5E7EB',
      };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.heading, { color: colors.muted }]}>{heading}</Text>

      <View style={styles.driverRow}>
        <View style={[styles.avatarWrap, { backgroundColor: colors.placeholder }]}>
          {driverPhotoURL ? (
            <Image
              source={{ uri: driverPhotoURL }}
              style={styles.avatar}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <Ionicons name="person" size={28} color={colors.muted} />
          )}
        </View>
        <View style={styles.driverText}>
          <Text style={[styles.driverName, { color: colors.title }]} numberOfLines={1}>
            {driverName || 'Driver'}
          </Text>
          {showPhone && driverPhone ? (
            <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>
              {driverPhone}
            </Text>
          ) : null}
          {makeModel ? (
            <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>
              {makeModel}
            </Text>
          ) : hasAnyVehicleInfo(vehicle) ? null : (
            <Text style={[styles.meta, { color: colors.muted }]}>Delivery vehicle</Text>
          )}
        </View>
      </View>

      <View style={styles.vehicleRow}>
        <View style={[styles.vehiclePhotoWrap, { backgroundColor: colors.placeholder }]}>
          {vehicle.vehiclePhoto ? (
            <Image
              source={{ uri: vehicle.vehiclePhoto }}
              style={styles.vehiclePhoto}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <Ionicons name="car-sport-outline" size={32} color={colors.muted} />
          )}
        </View>
        <View style={styles.vehicleDetails}>
          {makeModel ? (
            <Text style={[styles.vehicleTitle, { color: colors.title }]} numberOfLines={1}>
              {makeModel}
            </Text>
          ) : (
            <Text style={[styles.vehicleTitle, { color: colors.muted }]}>Vehicle</Text>
          )}
          {vehicle.vehicleColor ? (
            <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>
              {vehicle.vehicleColor}
            </Text>
          ) : null}
          {vehicle.vehicleYear ? (
            <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>
              {vehicle.vehicleYear}
            </Text>
          ) : null}
          {vehicle.licensePlate ? (
            <View style={[styles.plateChip, { backgroundColor: colors.plateBg }]}>
              <Text style={[styles.plateText, { color: colors.plateText }]}>
                {vehicle.licensePlate}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  heading: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  avatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  driverText: { flex: 1, minWidth: 0 },
  driverName: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  meta: { marginTop: 3, fontSize: 14, fontWeight: '600' },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  vehiclePhotoWrap: {
    width: 88,
    height: 64,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  vehiclePhoto: { width: 88, height: 64 },
  vehicleDetails: { flex: 1, minWidth: 0 },
  vehicleTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  plateChip: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  plateText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
});
