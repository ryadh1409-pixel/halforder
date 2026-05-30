import { getOrderTimestamp } from '@/lib/userOrderFreshness';
import { db } from '@/services/firebase';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type FirestoreError,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const ORDERS_LIMIT = 15;
const BASE_RETRY_MS = 15000;
const MAX_RETRY_MS = 120000;

export type ProfileOrderRow = {
  id: string;
  status: string;
  deliveryStatus: string;
  paymentStatus: string;
  restaurantName: string;
  totalPrice: number;
  subtotal: number;
  fees: number;
  deliveryAddress: string;
  driverName: string | null;
  driverPhone: string | null;
  itemsCount: number;
  createdAtMs: number;
  createdAt?: unknown;
  updatedAtMs?: number | null;
  imageUrl: string | null;
};

function parseOrderRow(id: string, d: DocumentData): ProfileOrderRow {
  const items = Array.isArray(d?.items) ? d.items : [];
  const firstItem = items[0] as Record<string, unknown> | undefined;
  const imageFromItem =
    typeof firstItem?.image === 'string' ? firstItem.image : null;
  const imageFromRestaurant =
    d?.restaurant && typeof d.restaurant === 'object'
      ? typeof (d.restaurant as Record<string, unknown>).image === 'string'
        ? String((d.restaurant as Record<string, unknown>).image)
        : null
      : null;

  return {
    id,
    status: typeof d?.status === 'string' ? d.status : 'pending',
    deliveryStatus: typeof d?.deliveryStatus === 'string' ? d.deliveryStatus : '',
    paymentStatus: typeof d?.paymentStatus === 'string' ? d.paymentStatus : 'unpaid',
    restaurantName:
      (typeof d?.restaurantName === 'string' && d.restaurantName.trim()) ||
      (d?.restaurant &&
      typeof d.restaurant === 'object' &&
      typeof (d.restaurant as Record<string, unknown>).name === 'string'
        ? String((d.restaurant as Record<string, unknown>).name).trim()
        : '') ||
      'Restaurant',
    totalPrice:
      typeof d?.totalPrice === 'number'
        ? d.totalPrice
        : typeof d?.total === 'number'
          ? d.total
          : 0,
    subtotal: typeof d?.subtotal === 'number' ? d.subtotal : 0,
    fees:
      (typeof d?.deliveryFee === 'number' ? d.deliveryFee : 0) +
      (typeof d?.tax === 'number' ? d.tax : 0),
    deliveryAddress:
      (typeof d?.deliveryAddress === 'string' && d.deliveryAddress.trim()) ||
      (d?.deliveryLocation &&
      typeof d.deliveryLocation === 'object' &&
      typeof (d.deliveryLocation as Record<string, unknown>).address === 'string'
        ? String((d.deliveryLocation as Record<string, unknown>).address)
        : '') ||
      '—',
    driverName: typeof d?.driverName === 'string' ? d.driverName : null,
    driverPhone: typeof d?.driverPhone === 'string' ? d.driverPhone : null,
    itemsCount: items.reduce((acc: number, item: unknown) => {
      const qty = Number((item as { qty?: unknown })?.qty ?? 1);
      return acc + (Number.isFinite(qty) && qty > 0 ? qty : 1);
    }, 0),
    createdAtMs:
      safeToMillis(d?.createdAtMs) ??
      safeToMillis(d?.createdAt) ??
      0,
    createdAt: d?.createdAt,
    updatedAtMs:
      safeToMillis(d?.updatedAtMs) ?? safeToMillis(d?.updatedAt) ?? null,
    imageUrl: imageFromItem || imageFromRestaurant,
  };
}

function primaryUidFromOrderDoc(d: DocumentData): string {
  const candidate =
    (typeof d?.userId === 'string' && d.userId) ||
    (typeof d?.customerId === 'string' && d.customerId) ||
    (typeof d?.createdBy === 'string' && d.createdBy) ||
    (typeof d?.creatorId === 'string' && d.creatorId) ||
    '';
  return candidate.trim();
}

async function fetchOrdersFor(
  uid: string,
  field: 'userId' | 'customerId' | 'createdBy' | 'creatorId',
): Promise<ProfileOrderRow[]> {
  const snap = await getDocs(
    query(
      collection(db, 'orders'),
      where(field, '==', uid),
      orderBy('createdAt', 'desc'),
      limit(ORDERS_LIMIT),
    ),
  );
  return snap.docs
    .filter((s) => primaryUidFromOrderDoc(s.data()) === uid)
    .map((s) => parseOrderRow(s.id, s.data()));
}

async function fetchLegacyOrders(uid: string): Promise<ProfileOrderRow[]> {
  const [customerRows, createdByRows, creatorRows] = await Promise.all([
    fetchOrdersFor(uid, 'customerId'),
    fetchOrdersFor(uid, 'createdBy'),
    fetchOrdersFor(uid, 'creatorId'),
  ]);
  return [...customerRows, ...createdByRows, ...creatorRows];
}

export function useProfileOrders(uid: string | null) {
  const [rows, setRows] = useState<ProfileOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [indexBuilding, setIndexBuilding] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayMsRef = useRef(BASE_RETRY_MS);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const scheduleRetry = useCallback((forceBaseInterval: boolean = false) => {
    clearRetryTimer();
    const waitMs = forceBaseInterval ? BASE_RETRY_MS : retryDelayMsRef.current;
    retryTimerRef.current = setTimeout(() => {
      setRetryTick((n) => n + 1);
    }, waitMs);
    retryDelayMsRef.current = forceBaseInterval
      ? BASE_RETRY_MS
      : Math.min(waitMs * 2, MAX_RETRY_MS);
  }, [clearRetryTimer]);

  const mergeRows = useCallback(
    (input: ProfileOrderRow[]): ProfileOrderRow[] => {
      const dedup = new Map<string, ProfileOrderRow>();
      input.forEach((r) => dedup.set(r.id, r));
      return [...dedup.values()]
        .sort((a, b) => getOrderTimestamp(b) - getOrderTimestamp(a))
        .slice(0, ORDERS_LIMIT);
    },
    [],
  );

  const runRefresh = useCallback(async () => {
    if (!uid) return;
    setRefreshing(true);
    try {
      const [primaryRows, legacyRows] = await Promise.all([
        fetchOrdersFor(uid, 'userId'),
        fetchLegacyOrders(uid),
      ]);
      setRows(mergeRows([...primaryRows, ...legacyRows]));
      setErrorMessage(null);
      setIndexBuilding(false);
      retryDelayMsRef.current = BASE_RETRY_MS;
      clearRetryTimer();
    } catch (e) {
      const err = e as FirestoreError;
      const msg = err?.message ?? (e instanceof Error ? e.message : 'Could not load orders.');
      const isIndexBuild =
        err?.code === 'failed-precondition' &&
        /requires an index|index is currently building/i.test(msg);
      setIndexBuilding(isIndexBuild);
      setErrorMessage(
        isIndexBuild ? "We're optimizing your order history. This usually takes a few minutes." : msg,
      );
      if (isIndexBuild) {
        scheduleRetry(true);
      }
    } finally {
      setRefreshing(false);
    }
  }, [clearRetryTimer, mergeRows, scheduleRetry, uid]);

  useEffect(() => {
    if (!uid) {
      setRows([]);
      setLoading(false);
      setErrorMessage(null);
      setIndexBuilding(false);
      clearRetryTimer();
      return;
    }
    setLoading(true);
    const unsubscribePrimary = onSnapshot(
      query(
        collection(db, 'orders'),
        where('userId', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(ORDERS_LIMIT),
      ),
      (snap) => {
        const mapped = snap.docs
          .filter((d) => primaryUidFromOrderDoc(d.data()) === uid)
          .map((d) => parseOrderRow(d.id, d.data()));
        setRows((prev) => mergeRows([...prev, ...mapped]));
        setLoading(false);
        setErrorMessage(null);
        setIndexBuilding(false);
        retryDelayMsRef.current = BASE_RETRY_MS;
        clearRetryTimer();
      },
      (e) => {
        setLoading(false);
        const msg = e.message || 'Could not load orders.';
        const isIndexBuild =
          e.code === 'failed-precondition' &&
          /requires an index|index is currently building/i.test(msg);
        setIndexBuilding(isIndexBuild);
        setErrorMessage(
          isIndexBuild
            ? "We're optimizing your order history. This usually takes a few minutes."
            : msg,
        );
        if (isIndexBuild) {
          scheduleRetry(true);
        }
      },
    );

    void (async () => {
      try {
        const legacyRows = await fetchLegacyOrders(uid);
        setRows((prev) => mergeRows([...prev, ...legacyRows]));
        setIndexBuilding(false);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      unsubscribePrimary();
      clearRetryTimer();
    };
  }, [clearRetryTimer, mergeRows, scheduleRetry, uid, retryTick]);

  return useMemo(
    () => ({
      rows,
      loading,
      refreshing,
      errorMessage,
      refresh: runRefresh,
      indexBuilding,
    }),
    [
      errorMessage,
      indexBuilding,
      loading,
      refreshing,
      rows,
      runRefresh,
    ],
  );
}
