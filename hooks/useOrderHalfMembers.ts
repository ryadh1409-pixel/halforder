import { collection, onSnapshot, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import {
  mapOrderMemberSnap,
  type OrderMemberProfileDoc,
} from '@/services/orderMemberProfile';
import { db } from '@/services/firebase';

/**
 * Live `orders/{orderId}/order_members/*` profiles for HalfOrder UI.
 */
export function useOrderHalfMembers(orderId: string): {
  members: OrderMemberProfileDoc[];
  loading: boolean;
} {
  const [members, setMembers] = useState<OrderMemberProfileDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const oid = orderId.trim();
    if (!oid) {
      setMembers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(collection(db, 'orders', oid, 'order_members'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMembers(
          snap.docs.map((d) =>
            mapOrderMemberSnap(d.id, d.data() as Record<string, unknown>),
          ),
        );
        setLoading(false);
      },
      () => {
        setMembers([]);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [orderId]);

  return { members, loading };
}
