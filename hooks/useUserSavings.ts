import { db } from '@/services/firebase';
import { isOrderCompleted } from '@/lib/orderCompletion';
import {
  collection,
  onSnapshot,
  query,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

export type UserSavingsSnapshot = {
  totalMoneySaved: number;
  savedFromSharedFood: number;
  savedFromPromotions: number;
  savedFromFreeDelivery: number;
  savedFromFreeServiceFee: number;
  savedFromSharedDelivery: number;
  savedFromSharedServiceFee: number;
  totalOrdersCompleted: number;
  totalSharedOrders: number;
  lifetimeSavings: number;
  loading: boolean;
};

const EMPTY: UserSavingsSnapshot = {
  totalMoneySaved: 0,
  savedFromSharedFood: 0,
  savedFromPromotions: 0,
  savedFromFreeDelivery: 0,
  savedFromFreeServiceFee: 0,
  savedFromSharedDelivery: 0,
  savedFromSharedServiceFee: 0,
  totalOrdersCompleted: 0,
  totalSharedOrders: 0,
  lifetimeSavings: 0,
  loading: true,
};

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function savingsFromPayment(data: DocumentData) {
  const foodSaving = num(data.foodSaving);
  const promotionSaving = num(data.promotionSaving);
  const freeDelivery = data.freeDelivery === true;
  const freeServiceFee = data.freeServiceFee === true;
  const sharedDeliverySaving = freeDelivery
    ? 0
    : num(data.deliverySaving) - (freeDelivery ? num(data.originalDeliveryFee) : 0);
  const freeDeliverySaving = freeDelivery ? num(data.originalDeliveryFee) : 0;
  const sharedServiceSaving = freeServiceFee
    ? 0
    : num(data.serviceFeeSaving) - (freeServiceFee ? num(data.originalServiceFee) : 0);
  const freeServiceSaving = freeServiceFee ? num(data.originalServiceFee) : 0;

  return {
    foodSaving,
    promotionSaving,
    sharedDeliverySaving: Math.max(0, sharedDeliverySaving),
    freeDeliverySaving,
    sharedServiceSaving: Math.max(0, sharedServiceSaving),
    freeServiceSaving,
    totalSaving: num(data.totalSaving),
    isShared: data.type === 'food_share',
  };
}

function savingsFromOrder(data: DocumentData) {
  const foodSaving = num(data.foodSaving);
  const promotionSaving = num(data.promotionSaving);
  const freeDelivery = data.freeDelivery === true;
  const freeServiceFee = data.freeServiceFee === true;
  const deliverySaving = num(data.deliverySaving);
  const serviceFeeSaving = num(data.serviceFeeSaving);
  const originalDeliveryFee = num(data.originalDeliveryFee);
  const originalServiceFee = num(data.originalServiceFee);

  return {
    foodSaving,
    promotionSaving,
    sharedDeliverySaving: freeDelivery ? 0 : deliverySaving,
    freeDeliverySaving: freeDelivery ? originalDeliveryFee : 0,
    sharedServiceSaving: freeServiceFee ? 0 : serviceFeeSaving,
    freeServiceSaving: freeServiceFee ? originalServiceFee : 0,
    totalSaving: num(data.totalSaving),
    isShared:
      data.orderSource === 'food_share' ||
      data.type === 'food_share' ||
      typeof data.matchId === 'string',
  };
}

export function useUserSavings(uid: string | null | undefined): UserSavingsSnapshot {
  const [payments, setPayments] = useState<DocumentData[]>([]);
  const [orders, setOrders] = useState<DocumentData[]>([]);
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
        setPayments(snap.docs.map((d) => d.data()));
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
            .map((d) => d.data())
            .filter((d) => isOrderCompleted(d)),
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

    let savedFromSharedFood = 0;
    let savedFromPromotions = 0;
    let savedFromFreeDelivery = 0;
    let savedFromFreeServiceFee = 0;
    let savedFromSharedDelivery = 0;
    let savedFromSharedServiceFee = 0;
    let lifetimeSavings = 0;
    let totalSharedOrders = 0;

    const seenMatchIds = new Set<string>();

    for (const payment of payments) {
      const row = savingsFromPayment(payment);
      savedFromSharedFood += row.foodSaving;
      savedFromPromotions += row.promotionSaving;
      savedFromFreeDelivery += row.freeDeliverySaving;
      savedFromFreeServiceFee += row.freeServiceSaving;
      savedFromSharedDelivery += row.sharedDeliverySaving;
      savedFromSharedServiceFee += row.sharedServiceSaving;
      lifetimeSavings += row.totalSaving > 0 ? row.totalSaving : row.foodSaving + row.promotionSaving + row.sharedDeliverySaving + row.freeDeliverySaving + row.sharedServiceSaving + row.freeServiceSaving;
      if (row.isShared) {
        const matchId = typeof payment.matchId === 'string' ? payment.matchId : '';
        if (matchId && !seenMatchIds.has(matchId)) {
          seenMatchIds.add(matchId);
          totalSharedOrders += 1;
        }
      }
    }

    let totalOrdersCompleted = payments.length;

    for (const order of orders) {
      const row = savingsFromOrder(order);
      if (row.totalSaving <= 0 && row.foodSaving <= 0) continue;
      savedFromSharedFood += row.foodSaving;
      savedFromPromotions += row.promotionSaving;
      savedFromFreeDelivery += row.freeDeliverySaving;
      savedFromFreeServiceFee += row.freeServiceSaving;
      savedFromSharedDelivery += row.sharedDeliverySaving;
      savedFromSharedServiceFee += row.sharedServiceSaving;
      lifetimeSavings += row.totalSaving > 0
        ? row.totalSaving
        : row.foodSaving + row.promotionSaving + row.sharedDeliverySaving + row.freeDeliverySaving + row.sharedServiceSaving + row.freeServiceSaving;
      if (row.isShared) {
        const matchId = typeof order.matchId === 'string' ? order.matchId : '';
        if (matchId && !seenMatchIds.has(matchId)) {
          seenMatchIds.add(matchId);
          totalSharedOrders += 1;
        }
      }
      totalOrdersCompleted += 1;
    }

    const totalMoneySaved = lifetimeSavings;

    return {
      totalMoneySaved,
      savedFromSharedFood,
      savedFromPromotions,
      savedFromFreeDelivery,
      savedFromFreeServiceFee,
      savedFromSharedDelivery,
      savedFromSharedServiceFee,
      totalOrdersCompleted,
      totalSharedOrders,
      lifetimeSavings,
      loading,
    };
  }, [loading, orders, payments, uid]);
}
