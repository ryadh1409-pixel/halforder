import type { MarketplaceOrdersFeedRow } from '@/components/orders/MarketplaceOrderCard';
import { getOrderListSection, type OrderListSection } from '@/constants/orderStatus';
import { formatOrderListTimeLabel } from '@/lib/orderReceipt';
import { db } from '@/services/firebase';
import { mapDocToRestaurantOrder } from '@/services/orderService';
import { formatAddress } from '@/utils/orderFormatters';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';

const COMPLETED_HISTORY_MS = 7 * 24 * 60 * 60 * 1000;

function sectionFromOrder(data: Record<string, unknown>): OrderListSection {
  // Normalize all status fields to lowercase for reliable comparison.
  const status =
    typeof data.status === 'string' ? data.status.trim().toLowerCase() : '';
  const deliveryStatus =
    typeof data.deliveryStatus === 'string' ? data.deliveryStatus.trim().toLowerCase() : '';
  const orderStatus =
    typeof data.orderStatus === 'string' ? data.orderStatus.trim().toLowerCase() : '';

  // Determine section from each available field, then take the strongest signal.
  // An order is "completed" if ANY terminal field says so — even if another field
  // lags behind (e.g., status still says 'payment_confirmed' but deliveryStatus
  // already says 'delivered').
  const statusSection = getOrderListSection(status);
  const deliverySection = getOrderListSection(deliveryStatus);
  const orderStatusSection = getOrderListSection(orderStatus);

  // Terminal wins: if any field says completed/cancelled, trust that.
  if (
    statusSection === 'completed' ||
    deliverySection === 'completed' ||
    orderStatusSection === 'completed'
  ) {
    return 'completed';
  }
  if (
    statusSection === 'cancelled' ||
    deliverySection === 'cancelled' ||
    orderStatusSection === 'cancelled'
  ) {
    return 'cancelled';
  }

  // No terminal signal → use primary status field.
  return statusSection;
}

function terminalTimeMs(data: Record<string, unknown>): number | null {
  return (
    safeToMillis(data.completedAt) ??
    safeToMillis(data.deliveredAt) ??
    safeToMillis(data.updatedAt) ??
    safeToMillis(data.createdAt)
  );
}

function shouldShowMobileOrder(data: Record<string, unknown>): boolean {
  if (sectionFromOrder(data) !== 'completed') return true;
  const ms = terminalTimeMs(data);
  return ms == null || Date.now() - ms <= COMPLETED_HISTORY_MS;
}

function mapDocToFeedRow(
  d: QueryDocumentSnapshot,
  restaurantImages: Record<string, string | null>,
): MarketplaceOrdersFeedRow {
  const data = d.data() as Record<string, unknown>;
  const status = typeof data.status === 'string' ? data.status : 'awaiting_payment';
  const paymentStatus =
    typeof data.paymentStatus === 'string' ? data.paymentStatus : 'unpaid';
  const section = sectionFromOrder(data);
  const participants: string[] = Array.isArray(data.participants)
    ? data.participants.filter((x): x is string => typeof x === 'string')
    : [];
  const halfUsers: string[] = Array.isArray(data.users)
    ? data.users.filter((x): x is string => typeof x === 'string')
    : [];
  const usesHalf = halfUsers.length > 0;
  const participantCount = usesHalf
    ? Math.max(halfUsers.length, participants.length, 1)
    : Math.max(participants.length, 1);

  // Same source as Track Order: mapDocToRestaurantOrder → restaurant.name
  const mapped = mapDocToRestaurantOrder(d);
  const restaurantId = mapped.restaurant.id || mapped.restaurantId || '';
  const restaurantName = mapped.restaurant.name;

  return {
    id: d.id,
    restaurant: {
      id: restaurantId || null,
      name: restaurantName,
      image:
        mapped.restaurant.image ??
        (restaurantId ? restaurantImages[restaurantId] ?? null : null),
      address: mapped.restaurant.address,
    },
    customer: {
      id: typeof data.userId === 'string' ? data.userId : null,
      name: 'Customer',
      avatar: null,
      address: formatAddress(
        typeof data.deliveryAddress === 'string' ? data.deliveryAddress : null,
      ),
    },
    driver: {
      id: null,
      name: null,
      avatar: null,
      phone: null,
      vehicle: null,
      status: null,
    },
    itemsPreview: [],
    status,
    paymentStatus,
    totalPrice: Number(data.totalPrice ?? data.total ?? 0),
    etaMinutes: null,
    deliveryAddress: formatAddress(
      typeof data.deliveryAddress === 'string' ? data.deliveryAddress : null,
    ),
    driverSummary: null,
    participantCount,
    // Same paidAt source + Toronto formatter as Order Details "Paid At".
    createdAtLabel: formatOrderListTimeLabel({
      paidAt: data.paidAt,
      createdAt: data.createdAt,
    }),
    section,
  };
}

export function useMarketplaceOrdersFeed(uid: string | null): {
  rows: MarketplaceOrdersFeedRow[];
  loading: boolean;
} {
  const [rows, setRows] = useState<MarketplaceOrdersFeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const restaurantImagesRef = useRef<Record<string, string | null>>({});

  const enrichRestaurants = useCallback(async (docs: QueryDocumentSnapshot[]) => {
    const ids = new Set<string>();
    docs.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>;
      const rid =
        typeof data.restaurantId === 'string'
          ? data.restaurantId
          : typeof data.venueId === 'string'
            ? data.venueId
            : '';
      if (rid && restaurantImagesRef.current[rid] === undefined) ids.add(rid);
    });
    await Promise.all(
      [...ids].map(async (rid) => {
        try {
          const snap = await getDoc(doc(db, 'restaurants', rid));
          const d = snap.data() as Record<string, unknown> | undefined;
          restaurantImagesRef.current[rid] =
            typeof d?.image === 'string'
              ? d.image
              : typeof d?.logoUrl === 'string'
                ? d.logoUrl
                : null;
        } catch {
          restaurantImagesRef.current[rid] = null;
        }
      }),
    );
  }, []);

  useEffect(() => {
    if (!uid) {
      setRows([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const ordersRef = collection(db, 'orders');
    const queries = [
      query(ordersRef, where('participants', 'array-contains', uid)),
      query(ordersRef, where('users', 'array-contains', uid)),
      query(ordersRef, where('userId', '==', uid)),
      query(ordersRef, where('customerId', '==', uid)),
    ];

    const buckets: QueryDocumentSnapshot[][] = [[], [], [], []];
    const heard = [false, false, false, false];

    const merge = async () => {
      if (!heard.every(Boolean)) return;
      const map = new Map<string, QueryDocumentSnapshot>();
      buckets.flat().forEach((docSnap) => map.set(docSnap.id, docSnap));
      const merged = [...map.values()].filter((docSnap) =>
        shouldShowMobileOrder(docSnap.data() as Record<string, unknown>),
      ).sort((a, b) => {
        const ma = safeToMillis(a.data()?.createdAt) ?? 0;
        const mb = safeToMillis(b.data()?.createdAt) ?? 0;
        return mb - ma;
      });
      await enrichRestaurants(merged);
      setRows(
        merged.map((d) => mapDocToFeedRow(d, restaurantImagesRef.current)),
      );
      setLoading(false);
    };

    const unsubs = queries.map((q, idx) =>
      onSnapshot(
        q,
        (snap) => {
          buckets[idx] = snap.docs;
          heard[idx] = true;
          void merge();
        },
        () => {
          heard[idx] = true;
          void merge();
        },
      ),
    );

    return () => unsubs.forEach((u) => u());
  }, [enrichRestaurants, uid]);

  return { rows, loading };
}
