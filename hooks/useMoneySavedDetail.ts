import { aggregateMoneySaved, type MoneySavedAggregated } from '@/lib/moneySavedAggregation';
import { isOrderCompleted } from '@/lib/orderCompletion';
import { db } from '@/services/firebase';
import {
  collection,
  onSnapshot,
  query,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

type DocRow = { id: string; data: DocumentData };

const EMPTY: MoneySavedAggregated = {
  savedFromSharedFood: 0,
  savedFromPromotions: 0,
  savedFromFreeDelivery: 0,
  savedFromFreeServiceFee: 0,
  savedFromSharedDelivery: 0,
  savedFromSharedServiceFee: 0,
  lifetime: {
    lifetimeSharedOrders: 0,
    lifetimeCompletedOrders: 0,
    totalMealsShared: 0,
    averageSavedPerOrder: 0,
    highestSavingInOneOrder: 0,
    totalLifetimeSavings: 0,
  },
  currentMonth: {
    monthKey: '',
    label: '',
    sharedOrders: 0,
    originalFoodValue: 0,
    youPaid: 0,
    moneySaved: 0,
    savingsThisMonth: 0,
  },
  orderHistory: [],
  loading: true,
};

export function useMoneySavedDetail(
  uid: string | null | undefined,
): MoneySavedAggregated {
  const [payments, setPayments] = useState<DocRow[]>([]);
  const [orders, setOrders] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setPayments([]);
      setOrders([]);
      setLoading(false);
      return undefined;
    }

    const payQ = query(
      collection(db, 'payments'),
      where('userId', '==', uid),
      where('paymentStatus', '==', 'PAID'),
    );
    const orderQ = query(
      collection(db, 'orders'),
      where('participantIds', 'array-contains', uid),
    );

    let payReady = false;
    let orderReady = false;
    const maybeDone = () => {
      if (payReady && orderReady) setLoading(false);
    };

    const unsubPay = onSnapshot(
      payQ,
      (snap) => {
        setPayments(snap.docs.map((d) => ({ id: d.id, data: d.data() })));
        payReady = true;
        maybeDone();
      },
      () => {
        setPayments([]);
        payReady = true;
        maybeDone();
      },
    );

    const unsubOrders = onSnapshot(
      orderQ,
      (snap) => {
        setOrders(
          snap.docs
            .map((d) => ({ id: d.id, data: d.data() }))
            .filter((row) => isOrderCompleted(row.data)),
        );
        orderReady = true;
        maybeDone();
      },
      () => {
        setOrders([]);
        orderReady = true;
        maybeDone();
      },
    );

    return () => {
      unsubPay();
      unsubOrders();
    };
  }, [uid]);

  return useMemo(() => {
    if (!uid) return { ...EMPTY, loading: false };
    return aggregateMoneySaved({ payments, orders, loading });
  }, [loading, orders, payments, uid]);
}
