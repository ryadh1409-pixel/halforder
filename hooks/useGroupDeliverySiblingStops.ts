/**
 * Map-only: load same-group sibling orders so shared-delivery maps can show
 * every customer stop. Read-only — does not change lifecycle or writes.
 */
import {
  activeDeliveryToStopSource,
  type DeliveryStopSource,
} from '@/lib/maps/deliveryStops';
import { db } from '@/services/firebase';
import {
  collection,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type QuerySnapshot,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';

function millisFromUnknown(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in value &&
    typeof (value as { toMillis: () => number }).toMillis === 'function'
  ) {
    try {
      const ms = (value as { toMillis: () => number }).toMillis();
      return Number.isFinite(ms) ? ms : null;
    } catch {
      return null;
    }
  }
  return null;
}

function stopSourceFromDoc(
  id: string,
  data: DocumentData,
): DeliveryStopSource {
  return activeDeliveryToStopSource({
    id,
    groupId: typeof data.groupId === 'string' ? data.groupId : null,
    status: data.status,
    deliveryStatus: data.deliveryStatus,
    restaurantName:
      typeof data.restaurantName === 'string'
        ? data.restaurantName
        : data.restaurant &&
            typeof data.restaurant === 'object' &&
            typeof (data.restaurant as { name?: unknown }).name === 'string'
          ? String((data.restaurant as { name: string }).name)
          : null,
    restaurantLocation: data.restaurantLocation,
    customerName:
      typeof data.customerName === 'string'
        ? data.customerName
        : data.customer &&
            typeof data.customer === 'object' &&
            typeof (data.customer as { name?: unknown }).name === 'string'
          ? String((data.customer as { name: string }).name)
          : null,
    customerLocation:
      data.customerLocation ?? data.userLocation ?? data.deliveryLocation,
    deliveryAddress:
      typeof data.deliveryAddress === 'string' ? data.deliveryAddress : null,
    dropoffName: typeof data.dropoffName === 'string' ? data.dropoffName : null,
    dropoffLat: typeof data.dropoffLat === 'number' ? data.dropoffLat : null,
    dropoffLng: typeof data.dropoffLng === 'number' ? data.dropoffLng : null,
    pickupName: typeof data.pickupName === 'string' ? data.pickupName : null,
    pickupLat: typeof data.pickupLat === 'number' ? data.pickupLat : null,
    pickupLng: typeof data.pickupLng === 'number' ? data.pickupLng : null,
    restaurantLat:
      typeof data.restaurantLat === 'number' ? data.restaurantLat : null,
    restaurantLng:
      typeof data.restaurantLng === 'number' ? data.restaurantLng : null,
    deliveryLat:
      typeof data.deliveryLat === 'number' ? data.deliveryLat : null,
    deliveryLng:
      typeof data.deliveryLng === 'number' ? data.deliveryLng : null,
    createdAtMs: millisFromUnknown(data.createdAt),
    deliveryStops: data.deliveryStops,
    dropoffs: data.dropoffs,
    customers: data.customers,
  });
}

export function useGroupDeliverySiblingStops(
  groupId: string | null | undefined,
  excludeOrderId: string | null | undefined,
): DeliveryStopSource[] {
  const [siblings, setSiblings] = useState<DeliveryStopSource[]>([]);

  useEffect(() => {
    const gid = typeof groupId === 'string' ? groupId.trim() : '';
    if (!gid) {
      setSiblings([]);
      return undefined;
    }

    const q = query(collection(db, 'orders'), where('groupId', '==', gid));
    const unsub = onSnapshot(
      q,
      (snap: QuerySnapshot<DocumentData>) => {
        const rows: DeliveryStopSource[] = [];
        for (const docSnap of snap.docs) {
          if (excludeOrderId && docSnap.id === excludeOrderId) continue;
          rows.push(stopSourceFromDoc(docSnap.id, docSnap.data()));
        }
        setSiblings(rows);
      },
      () => {
        setSiblings([]);
      },
    );
    return unsub;
  }, [groupId, excludeOrderId]);

  return siblings;
}
