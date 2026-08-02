/**
 * DEV-only end-to-end tracking marker verification.
 * Opens via: halforder://dev/e2e-tracking-verify
 *
 * Creates a brand-new order (forceNew) with DISTINCT restaurant vs customer GPS,
 * then opens Track Order so CustomerTrackingMap logs + screenshots can prove markers.
 */
import { auth, db, ensureAuthReady } from '@/services/firebase';
import { createOrder } from '@/services/orderService';
import { syncDriverLiveLocation } from '@/services/location/driverTracking';
import { doc, getDoc, getDocs, limit, collection, query, where, updateDoc } from 'firebase/firestore';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Distinct Ottawa-area pins (~2km+ apart) so markers cannot overlap. */
const E2E_RESTAURANT = { lat: 45.4115, lng: -75.7082 };
const E2E_CUSTOMER = { lat: 45.4318, lng: -75.6795 };
const E2E_DRIVER = { lat: 45.4215, lng: -75.6972 };

async function resolveRestaurantId(paramId?: string): Promise<string> {
  if (paramId?.trim()) return paramId.trim();
  const uid = auth.currentUser?.uid;
  if (uid) {
    const recent = await getDocs(
      query(
        collection(db, 'orders'),
        where('customerId', '==', uid),
        limit(5),
      ),
    );
    for (const d of recent.docs) {
      const rid = d.data()?.restaurantId;
      if (typeof rid === 'string' && rid.trim()) return rid.trim();
    }
  }
  const restaurants = await getDocs(query(collection(db, 'restaurants'), limit(1)));
  if (!restaurants.empty) return restaurants.docs[0].id;
  throw new Error('No restaurantId available for E2E order');
}

export default function E2eTrackingVerifyScreen() {
  const params = useLocalSearchParams<{ restaurantId?: string }>();
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);

  const append = useCallback((line: string) => {
    console.log(line);
    setLog((prev) => [...prev, line]);
  }, []);

  const runPhase = useCallback(
    async (withDriver: boolean) => {
      if (!__DEV__) {
        append('BLOCKED: E2E harness is __DEV__ only');
        return;
      }
      setBusy(true);
      try {
        await ensureAuthReady();
        const uid = auth.currentUser?.uid;
        if (!uid) throw new Error('Not signed in');

        const restaurantId = await resolveRestaurantId(
          typeof params.restaurantId === 'string' ? params.restaurantId : undefined,
        );
        append(`[E2E] restaurantId=${restaurantId}`);

        const customerLocation = {
          latitude: E2E_CUSTOMER.lat,
          longitude: E2E_CUSTOMER.lng,
          timestamp: Date.now(),
        };
        const deliveryLocation = {
          lat: E2E_CUSTOMER.lat,
          lng: E2E_CUSTOMER.lng,
          address: 'E2E Customer Dropoff — 100 Queen St, Ottawa',
        };
        const restaurantLocation = {
          lat: E2E_RESTAURANT.lat,
          lng: E2E_RESTAURANT.lng,
        };

        append('[E2E VERIFY] BEFORE createOrder()');
        append(JSON.stringify({ customerLocation, deliveryLocation, restaurantLocation }, null, 2));

        const orderId = await createOrder({
          userId: uid,
          restaurantId,
          items: [
            {
              id: `e2e-${Date.now()}`,
              name: 'E2E Tracking Verify Item',
              price: 1,
              qty: 1,
              image: null,
            },
          ],
          totalPrice: 1,
          foodSubtotal: 1,
          tax: 0,
          deliveryFee: 0,
          serviceFee: 0,
          deliveryType: 'delivery',
          deliveryLocation,
          customerLocation,
          restaurantLocation,
          forceNew: true,
          seedDriverLocation: withDriver
            ? { latitude: E2E_DRIVER.lat, longitude: E2E_DRIVER.lng }
            : null,
        });

        setLastOrderId(orderId);
        append(`[E2E] created orderId=${orderId} withDriver=${withDriver}`);

        const snap = await getDoc(doc(db, 'orders', orderId));
        const data = snap.data() ?? {};
        append('[E2E VERIFY] exact Firestore doc locations:');
        append(
          JSON.stringify(
            {
              customerLocation: data.customerLocation,
              deliveryLocation: data.deliveryLocation,
              restaurantLocation: data.restaurantLocation,
              driverLocation: data.driverLocation ?? null,
              driverId: data.driverId ?? null,
            },
            null,
            2,
          ),
        );

        if (withDriver) {
          append('[E2E] opening Track Order (3 markers seeded)…');
          router.replace({
            pathname: '/track-order/[orderId]',
            params: {
              orderId,
              e2eCapture: '1',
              e2ePhase: 'three_markers',
            },
          } as never);
          return;
        }

        // Phase A: open Track with driver == null first (2 markers).
        append('[E2E] opening Track Order (2 markers, driver=null)…');
        router.replace({
          pathname: '/track-order/[orderId]',
          params: {
            orderId,
            e2eCapture: '1',
            e2ePhase: 'two_markers',
          },
        } as never);

        // Phase B: after map settles, assign driver GPS and let Track re-render.
        setTimeout(() => {
          void (async () => {
            try {
              append('[E2E] assigning driver after 2-marker proof…');
              await updateDoc(doc(db, 'orders', orderId), {
                driverId: uid,
                assignedDriverId: uid,
              });
              append('[E2E] assign driverId via updateDoc: OK');
              await syncDriverLiveLocation(
                orderId,
                uid,
                {
                  latitude: E2E_DRIVER.lat,
                  longitude: E2E_DRIVER.lng,
                  heading: 90,
                  speed: 5,
                },
                { force: true },
              );
              append('[E2E] syncDriverLiveLocation: OK — expect 3 markers next');
            } catch (err) {
              append(
                `[E2E] post-track driver assign failed: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              );
            }
          })();
        }, 3500);
      } catch (err) {
        append(`[E2E] FAILED: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setBusy(false);
      }
    },
    [append, params.restaurantId],
  );

  if (!__DEV__) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.title}>E2E Verify (dev only)</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <Text style={styles.title}>E2E Tracking Marker Verify</Text>
      <Text style={styles.sub}>
        Creates a brand-new order with distinct restaurant/customer GPS (no unpaid reuse).
      </Text>

      <Pressable
        style={[styles.btn, busy && styles.btnDisabled]}
        disabled={busy}
        onPress={() => void runPhase(false)}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>1. New order → 2 markers (no driver)</Text>
        )}
      </Pressable>

      <Pressable
        style={[styles.btn, styles.btnSecondary, busy && styles.btnDisabled]}
        disabled={busy}
        onPress={() => void runPhase(true)}
      >
        <Text style={styles.btnText}>2. New order → 3 markers (seed driver GPS)</Text>
      </Pressable>

      {lastOrderId ? (
        <Pressable
          style={styles.link}
          onPress={() =>
            router.push({
              pathname: '/track-order/[orderId]',
              params: { orderId: lastOrderId, e2eCapture: '1' },
            } as never)
          }
        >
          <Text style={styles.linkText}>Re-open last: {lastOrderId}</Text>
        </Pressable>
      ) : null}

      <ScrollView style={styles.logBox} contentContainerStyle={{ paddingBottom: 40 }}>
        {log.map((line, i) => (
          <Text key={`${i}-${line.slice(0, 12)}`} style={styles.logLine}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0F172A', padding: 16 },
  title: { color: '#F8FAFC', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  sub: { color: '#94A3B8', fontSize: 13, marginBottom: 16, lineHeight: 18 },
  btn: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnSecondary: { backgroundColor: '#334155' },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  link: { paddingVertical: 8 },
  linkText: { color: '#A78BFA', fontSize: 13 },
  logBox: { flex: 1, marginTop: 12, backgroundColor: '#020617', borderRadius: 8, padding: 10 },
  logLine: { color: '#CBD5E1', fontSize: 11, fontFamily: 'Courier', marginBottom: 4 },
});
