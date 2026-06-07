import { isOrderCompleted } from '@/lib/orderCompletion';
import { logProfileOrderList } from '@/lib/profileOrderLog';
import { mergeProfileOrderRowsById } from '@/lib/profileOrderMerge';
import { QuerySnapshotFreshnessGate } from '@/lib/orderSnapshotFreshness';
import { isProfileOrderCancelled } from '@/constants/profileOrders';
import { DAY_MS, getOrderTimestamp } from '@/lib/userOrderFreshness';
import { db } from '@/services/firebase';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  collection,
  getDocs,
  getDocsFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
  type DocumentData,
  type FirestoreError,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const ORDERS_LIMIT = 25;
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
  driverId: string | null;
  assignedDriverId: string | null;
  driverName: string | null;
  driverPhone: string | null;
  itemsCount: number;
  createdAtMs: number;
  createdAt?: unknown;
  updatedAtMs?: number | null;
  deliveredAtMs?: number | null;
  completedAtMs?: number | null;
  marketplaceArchived?: boolean;
  imageUrl: string | null;
};

function profileOrdersSince24h(): Timestamp {
  return Timestamp.fromMillis(Date.now() - DAY_MS);
}

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
    driverId: typeof d?.driverId === 'string' ? d.driverId : null,
    assignedDriverId:
      typeof d?.assignedDriverId === 'string' ? d.assignedDriverId : null,
    driverName: typeof d?.driverName === 'string' ? d.driverName : null,
    driverPhone: typeof d?.driverPhone === 'string' ? d.driverPhone : null,
    itemsCount: items.reduce((acc: number, item: unknown) => {
      const qty = Number((item as { qty?: unknown })?.qty ?? 1);
      return acc + (Number.isFinite(qty) && qty > 0 ? qty : 1);
    }, 0),
    createdAtMs:
      safeToMillis(d?.createdAtMs) ??
      safeToMillis(d?.createdAt) ??
      safeToMillis(d?.updatedAt) ??
      0,
    createdAt: d?.createdAt,
    updatedAtMs:
      safeToMillis(d?.updatedAtMs) ?? safeToMillis(d?.updatedAt) ?? null,
    deliveredAtMs:
      safeToMillis(d?.deliveredAtMs) ?? safeToMillis(d?.deliveredAt) ?? null,
    completedAtMs:
      safeToMillis(d?.completedAtMs) ?? safeToMillis(d?.completedAt) ?? null,
    marketplaceArchived: d?.marketplaceArchived === true,
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

function orderSortMs(order: ProfileOrderRow): number {
  const ts = getOrderTimestamp(order);
  if (ts > 0) return ts;
  if (order.updatedAtMs != null && order.updatedAtMs > 0) return order.updatedAtMs;
  if (order.createdAtMs > 0) return order.createdAtMs;
  return Date.now();
}

function buildProfileOrdersQuery(
  uid: string,
  field: 'userId' | 'customerId' | 'createdBy' | 'creatorId',
): Query {
  return query(
    collection(db, 'orders'),
    where(field, '==', uid),
    where('createdAt', '>=', profileOrdersSince24h()),
    orderBy('createdAt', 'desc'),
    limit(ORDERS_LIMIT),
  );
}

function mapSnapshotDocs(
  uid: string,
  docs: { id: string; data: () => DocumentData }[],
): ProfileOrderRow[] {
  return docs
    .filter((s) => primaryUidFromOrderDoc(s.data()) === uid)
    .map((s) => parseOrderRow(s.id, s.data()));
}

async function fetchOrdersFor(
  uid: string,
  field: 'userId' | 'customerId' | 'createdBy' | 'creatorId',
  options?: { fromServer?: boolean },
): Promise<ProfileOrderRow[]> {
  const q = buildProfileOrdersQuery(uid, field);
  const snap = options?.fromServer ? await getDocsFromServer(q) : await getDocs(q);
  return mapSnapshotDocs(uid, snap.docs);
}

async function fetchLegacyOrders(
  uid: string,
  options?: { fromServer?: boolean },
): Promise<ProfileOrderRow[]> {
  const [customerRows, createdByRows, creatorRows] = await Promise.all([
    fetchOrdersFor(uid, 'customerId', options),
    fetchOrdersFor(uid, 'createdBy', options),
    fetchOrdersFor(uid, 'creatorId', options),
  ]);
  return mergeProfileOrderRowsById(
    mergeProfileOrderRowsById(customerRows, createdByRows),
    creatorRows,
  );
}

function mergeRows(input: ProfileOrderRow[]): ProfileOrderRow[] {
  let merged: ProfileOrderRow[] = [];
  for (const row of input) {
    merged = mergeProfileOrderRowsById(merged, [row]);
  }
  return merged.sort((a, b) => orderSortMs(b) - orderSortMs(a)).slice(0, ORDERS_LIMIT);
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
  const userIdRowsRef = useRef<ProfileOrderRow[]>([]);
  const customerIdRowsRef = useRef<ProfileOrderRow[]>([]);
  const legacyRowsRef = useRef<ProfileOrderRow[]>([]);

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

  const publishMergedRows = useCallback(() => {
    setRows(
      mergeRows([
        ...userIdRowsRef.current,
        ...customerIdRowsRef.current,
        ...legacyRowsRef.current,
      ]),
    );
  }, []);

  const runRefresh = useCallback(async () => {
    if (!uid) return;
    setRefreshing(true);
    try {
      const [userIdRows, customerIdRows, legacyRows] = await Promise.all([
        fetchOrdersFor(uid, 'userId', { fromServer: true }),
        fetchOrdersFor(uid, 'customerId', { fromServer: true }),
        fetchLegacyOrders(uid, { fromServer: true }),
      ]);
      userIdRowsRef.current = userIdRows;
      customerIdRowsRef.current = customerIdRows;
      legacyRowsRef.current = legacyRows;
      publishMergedRows();
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
  }, [clearRetryTimer, publishMergedRows, scheduleRetry, uid]);

  useEffect(() => {
    if (!uid) {
      userIdRowsRef.current = [];
      customerIdRowsRef.current = [];
      legacyRowsRef.current = [];
      setRows([]);
      setLoading(false);
      setErrorMessage(null);
      setIndexBuilding(false);
      clearRetryTimer();
      return;
    }

    setLoading(true);
    const unsubs: Unsubscribe[] = [];

    const attachListener = (
      field: 'userId' | 'customerId',
      targetRef: { current: ProfileOrderRow[] },
    ) => {
      const queryGate = new QuerySnapshotFreshnessGate();
      const unsub = onSnapshot(
        buildProfileOrdersQuery(uid, field),
        (snap) => {
          if (!queryGate.shouldApply(snap.metadata.fromCache, snap.docs.length)) {
            console.log('CACHE ORDER', {
              source: 'useProfileOrders:ignored',
              field,
              uid,
              docCount: snap.docs.length,
              fromCache: true,
            });
            return;
          }
          console.log('SERVER ORDER', {
            source: 'useProfileOrders',
            field,
            uid,
            docCount: snap.docs.length,
            fromCache: snap.metadata.fromCache,
          });
          const mapped = mapSnapshotDocs(uid, snap.docs);
          logProfileOrderList(mapped, 'useProfileOrders:query', {
            field,
            fromCache: snap.metadata.fromCache,
            docCount: snap.docs.length,
          });
          targetRef.current = mergeProfileOrderRowsById(targetRef.current, mapped);
          publishMergedRows();
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
      unsubs.push(unsub);
    };

    attachListener('userId', userIdRowsRef);
    attachListener('customerId', customerIdRowsRef);

    void (async () => {
      try {
        const [createdByRows, creatorRows] = await Promise.all([
          fetchOrdersFor(uid, 'createdBy'),
          fetchOrdersFor(uid, 'creatorId'),
        ]);
        legacyRowsRef.current = [...createdByRows, ...creatorRows];
        publishMergedRows();
        setIndexBuilding(false);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      for (const unsub of unsubs) unsub();
      clearRetryTimer();
    };
  }, [clearRetryTimer, publishMergedRows, scheduleRetry, uid, retryTick]);

  const { activeRows, historyRows, cancelledRows } = useMemo(() => {
    const active: ProfileOrderRow[] = [];
    const history: ProfileOrderRow[] = [];
    const cancelled: ProfileOrderRow[] = [];
    for (const row of rows) {
      if (isProfileOrderCancelled(row)) {
        cancelled.push(row);
      } else if (isOrderCompleted(row)) {
        history.push(row);
      } else {
        active.push(row);
      }
    }
    logProfileOrderList(history, 'useProfileOrders:split', { bucket: 'history' });
    logProfileOrderList(active, 'useProfileOrders:split', { bucket: 'active' });
    return { activeRows: active, historyRows: history, cancelledRows: cancelled };
  }, [rows]);

  return useMemo(
    () => ({
      rows,
      activeRows,
      historyRows,
      cancelledRows,
      loading,
      refreshing,
      errorMessage,
      refresh: runRefresh,
      indexBuilding,
    }),
    [
      activeRows,
      historyRows,
      cancelledRows,
      errorMessage,
      indexBuilding,
      loading,
      refreshing,
      rows,
      runRefresh,
    ],
  );
}
