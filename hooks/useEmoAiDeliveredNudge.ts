import { isOrderCompleted } from '@/lib/orderCompletion';
import { TABS_ROUTES } from '@/lib/navigationPaths';
import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { isRegisteredAuthUser } from '@/lib/authSession';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { useEffect, useRef } from 'react';
import Toast from 'react-native-toast-message';

const SEEN_KEY_PREFIX = 'emoAi.deliveredNudge.v1.';

/**
 * Subtle toast when an order newly becomes delivered/completed.
 * Additive listener only — does not change order writes.
 */
export function useEmoAiDeliveredNudge(enabled: boolean): void {
  const { user } = useAuth();
  const router = useRouter();
  const uid = isRegisteredAuthUser(user) ? user!.uid : null;
  const primedRef = useRef(false);
  const knownCompletedRef = useRef<Set<string>>(new Set());
  const initialSnapsRef = useRef(0);

  useEffect(() => {
    if (!enabled || !uid) return undefined;

    primedRef.current = false;
    knownCompletedRef.current = new Set();
    initialSnapsRef.current = 0;
    let cancelled = false;
    const storageKey = `${SEEN_KEY_PREFIX}${uid}`;
    const ordersRef = collection(db, 'orders');
    const expectedInitial = 3;

    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        const arr = raw ? (JSON.parse(raw) as unknown) : [];
        if (Array.isArray(arr)) {
          knownCompletedRef.current = new Set(
            arr.filter((x): x is string => typeof x === 'string'),
          );
        }
      } catch {
        /* ignore */
      }
    })();

    const ingest = (docs: { id: string; data: () => Record<string, unknown> }[]) => {
      if (cancelled) return;

      if (!primedRef.current) {
        for (const d of docs) {
          const data = d.data();
          if (
            isOrderCompleted({
              status: typeof data.status === 'string' ? data.status : null,
              deliveryStatus:
                typeof data.deliveryStatus === 'string'
                  ? data.deliveryStatus
                  : null,
            })
          ) {
            knownCompletedRef.current.add(d.id);
          }
        }
        initialSnapsRef.current += 1;
        if (initialSnapsRef.current < expectedInitial) return;
        primedRef.current = true;
        void AsyncStorage.setItem(
          storageKey,
          JSON.stringify([...knownCompletedRef.current]),
        ).catch(() => undefined);
        return;
      }

      let changed = false;
      for (const d of docs) {
        const data = d.data();
        const completed = isOrderCompleted({
          status: typeof data.status === 'string' ? data.status : null,
          deliveryStatus:
            typeof data.deliveryStatus === 'string'
              ? data.deliveryStatus
              : null,
        });
        if (!completed) continue;
        if (knownCompletedRef.current.has(d.id)) continue;
        knownCompletedRef.current.add(d.id);
        changed = true;

        Toast.show({
          type: 'info',
          text1: '🍕 Emo AI wants to eat with you.',
          text2: 'Tap to open chat',
          position: 'bottom',
          visibilityTime: 4500,
          autoHide: true,
          onPress: () => {
            Toast.hide();
            router.push(TABS_ROUTES.emoAi as never);
          },
        });
      }

      if (changed) {
        void AsyncStorage.setItem(
          storageKey,
          JSON.stringify([...knownCompletedRef.current].slice(-40)),
        ).catch(() => undefined);
      }
    };

    const mapSnap = (snap: { docs: { id: string; data: () => unknown }[] }) =>
      snap.docs.map((d) => ({
        id: d.id,
        data: () => d.data() as Record<string, unknown>,
      }));

    const unsubs = [
      query(ordersRef, where('userId', '==', uid)),
      query(ordersRef, where('customerId', '==', uid)),
      query(ordersRef, where('participants', 'array-contains', uid)),
    ].map((q) =>
      onSnapshot(
        q,
        (snap) => ingest(mapSnap(snap)),
        () => {
          // Count failed/empty listeners so priming still completes.
          if (!primedRef.current) {
            initialSnapsRef.current += 1;
            if (initialSnapsRef.current >= expectedInitial) {
              primedRef.current = true;
            }
          }
        },
      ),
    );

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [enabled, router, uid]);
}
