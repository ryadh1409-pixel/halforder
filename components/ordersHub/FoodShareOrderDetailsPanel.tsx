import {
  FOOD_SHARE_TRACK_STEPS,
  foodShareDeliveryStatusLabel,
  foodShareTrackStepIndex,
} from '@/lib/foodShareOrderFollowUp';
import { formatShareCurrency } from '@/lib/foodSharePricing';
import { USER_ROUTES } from '@/lib/navigationPaths';
import type { FoodShareHubItem } from '@/lib/ordersHubStatus';
import { db } from '@/services/firebase';
import { useAuth } from '@/services/AuthContext';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import * as Linking from 'expo-linking';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

const c = theme.colors;

function formatPaidDate(ms: number | null): string {
  if (ms == null || ms <= 0) return '—';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

type Props = {
  item: FoodShareHubItem;
};

/**
 * Collapsible post-payment follow-up: receipt, delivery status, track steps, contact driver.
 * Read-only — snapshots orders/{orderId} for driverPhone when available.
 */
export function FoodShareOrderDetailsPanel({ item }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const myUid = user?.uid ?? '';
  const [expanded, setExpanded] = useState(false);
  const [driverPhone, setDriverPhone] = useState<string | null>(null);

  const orderId = item.orderId || item.matchId || '';
  const lifecycle = item.lifecycle ?? item.match?.lifecycle ?? null;
  const deliveryStatus = item.match?.deliveryStatus ?? null;
  const trackIndex = foodShareTrackStepIndex(lifecycle, deliveryStatus);
  const statusLabel = foodShareDeliveryStatusLabel(lifecycle, deliveryStatus);

  const amountPaid = useMemo(() => {
    if (item.totalPaid != null) return item.totalPaid;
    const pay = myUid ? item.match?.userPayments?.[myUid] : null;
    if (pay?.paymentStatus === 'PAID' && typeof pay.amount === 'number') {
      return pay.amount / 100;
    }
    return item.totalPerUser;
  }, [item.match?.userPayments, item.totalPaid, item.totalPerUser, myUid]);

  const paidAtMs = item.joinedAtMs ?? item.match?.createdAtMs ?? null;

  useEffect(() => {
    if (!orderId || !expanded) return;
    const unsub = onSnapshot(
      doc(db, 'orders', orderId),
      (snap) => {
        if (!snap.exists()) {
          setDriverPhone(null);
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        const phone =
          (typeof data.driverPhone === 'string' && data.driverPhone.trim()) ||
          (data.driver &&
          typeof data.driver === 'object' &&
          typeof (data.driver as Record<string, unknown>).phone === 'string'
            ? String((data.driver as Record<string, unknown>).phone).trim()
            : '');
        setDriverPhone(phone || null);
      },
      () => setDriverPhone(null),
    );
    return unsub;
  }, [expanded, orderId]);

  const contactDriver = () => {
    if (driverPhone) {
      void Linking.openURL(`tel:${driverPhone}`).catch(() => {
        Alert.alert('Unable to call', 'Could not open the phone dialer.');
      });
      return;
    }
    Alert.alert(
      'Driver not available',
      'A driver phone number is not available yet. Try again once a driver is assigned, or use Driver Chat from the order card.',
    );
  };

  const trackOrder = () => {
    if (!orderId) return;
    router.push(USER_ROUTES.trackOrder(orderId) as never);
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.toggle}
        onPress={(e) => {
          e.stopPropagation?.();
          setExpanded((v) => !v);
        }}
      >
        <Text style={styles.toggleLabel}>Order Details</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="rgba(255,255,255,0.75)"
        />
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          <Text style={styles.sectionTitle}>Receipt</Text>
          <Row label="Food" value={item.foodName} />
          <Row label="Amount paid" value={formatShareCurrency(amountPaid)} />
          <Row label="Payment date" value={formatPaidDate(paidAtMs)} />

          <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Delivery status</Text>
          <Text style={styles.statusValue}>{statusLabel}</Text>

          <Pressable
            style={styles.trackRow}
            onPress={(e) => {
              e.stopPropagation?.();
              trackOrder();
            }}
          >
            <View style={styles.trackHeader}>
              <Text style={styles.trackTitle}>Track Order</Text>
              <Ionicons name="chevron-forward" size={16} color="#C084FC" />
            </View>
            <View style={styles.steps}>
              {FOOD_SHARE_TRACK_STEPS.map((step, i) => {
                const done = i <= trackIndex;
                const current = i === trackIndex;
                return (
                  <View key={step} style={styles.stepCol}>
                    <View
                      style={[
                        styles.stepDot,
                        done && styles.stepDotDone,
                        current && styles.stepDotCurrent,
                      ]}
                    />
                    <Text
                      style={[
                        styles.stepLabel,
                        done && styles.stepLabelDone,
                        current && styles.stepLabelCurrent,
                      ]}
                      numberOfLines={2}
                    >
                      {step}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Pressable>

          <Pressable
            style={styles.contactBtn}
            onPress={(e) => {
              e.stopPropagation?.();
              contactDriver();
            }}
          >
            <Ionicons name="call-outline" size={16} color="#FFF" />
            <Text style={styles.contactBtnText}>
              {driverPhone ? `Contact Driver · ${driverPhone}` : 'Contact Driver'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    overflow: 'hidden',
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.9)',
  },
  body: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#7D8493',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  sectionSpaced: { marginTop: 12 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 4,
  },
  rowLabel: { fontSize: 13, fontWeight: '600', color: '#B7BDC9' },
  rowValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
    textAlign: 'right',
  },
  statusValue: {
    fontSize: 15,
    fontWeight: '800',
    color: c.primary,
    marginBottom: 4,
  },
  trackRow: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(168,85,247,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.28)',
  },
  trackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  trackTitle: { fontSize: 13, fontWeight: '800', color: '#E9D5FF' },
  steps: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  stepCol: { flex: 1, alignItems: 'center', gap: 6 },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  stepDotDone: { backgroundColor: '#A855F7' },
  stepDotCurrent: {
    backgroundColor: '#C084FC',
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  stepLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#7D8493',
    textAlign: 'center',
  },
  stepLabelDone: { color: 'rgba(255,255,255,0.75)' },
  stepLabelCurrent: { color: '#E9D5FF' },
  contactBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 11,
    backgroundColor: 'rgba(59,130,246,0.85)',
  },
  contactBtnText: { fontSize: 13, fontWeight: '800', color: '#FFF' },
});
