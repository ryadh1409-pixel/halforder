import { isAdminUser } from '@/constants/adminUid';
import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import React, { useEffect, useRef } from 'react';
import Toast from 'react-native-toast-message';

/**
 * In-app toast for newly created admin alert docs (orders, etc.).
 * Presentation only — does not write notification data.
 */
export function AdminAlertsToastListener() {
  const { user, firestoreUserRole } = useAuth();
  const isAdmin = isAdminUser(user, firestoreUserRole);
  const seededRef = useRef(false);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isAdmin || !user?.uid) return;

    return onSnapshot(
      query(collection(db, 'admin_notifications'), orderBy('createdAt', 'desc')),
      (snap) => {
        if (!seededRef.current) {
          seededRef.current = true;
          snap.docs.forEach((d) => seenRef.current.add(d.id));
          return;
        }
        for (const d of snap.docs) {
          if (seenRef.current.has(d.id)) continue;
          seenRef.current.add(d.id);
          const data = d.data() as Record<string, unknown>;
          const type = typeof data.type === 'string' ? data.type : '';
          if (type !== 'new_order_created') continue;
          const title =
            typeof data.title === 'string' && data.title.trim()
              ? data.title.trim()
              : 'New order received';
          const body =
            typeof data.message === 'string' && data.message.trim()
              ? data.message.trim()
              : typeof data.orderId === 'string'
                ? `Order ${data.orderId}`
                : 'Open Notification Center for details';
          Toast.show({
            type: 'info',
            text1: title,
            text2: body,
            position: 'top',
            visibilityTime: 5000,
          });
        }
      },
      () => undefined,
    );
  }, [isAdmin, user?.uid]);

  return null;
}
