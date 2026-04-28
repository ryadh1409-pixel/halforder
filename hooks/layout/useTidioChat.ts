import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '@/services/firebase';
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { useEffect, type MutableRefObject } from 'react';
import { Platform } from 'react-native';

type LatestOrder = {
  orderId: string | null;
  status: string;
  items: string;
} | null;
type LatestOrders = {
  orderId: string;
  status: string;
  items: string;
  createdAt: string;
}[];

export function useTidioChat(args: {
  user: {
    uid?: string | null;
    email?: string | null;
    displayName?: string | null;
  } | null;
  currentUserRef: MutableRefObject<typeof args.user>;
  latestOrderRef: MutableRefObject<LatestOrder>;
  latestOrdersRef: MutableRefObject<LatestOrders>;
  orderStateCacheRef: MutableRefObject<
    Record<string, { status: string; participants: number }>
  >;
  tidioOrderEventSentRef: MutableRefObject<Set<string>>;
}) {
  const {
    user,
    currentUserRef,
    latestOrderRef,
    latestOrdersRef,
    orderStateCacheRef,
    tidioOrderEventSentRef,
  } = args;

  useEffect(() => {
    currentUserRef.current = user;
  }, [currentUserRef, user]);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) {
      latestOrderRef.current = null;
      latestOrdersRef.current = [];
      return;
    }
    const q = query(
      collection(db, 'orders'),
      where('participants', 'array-contains', uid),
    );
    return onSnapshot(q, (snap) => {
      const mapped = snap.docs.slice(0, 3).map((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        return {
          orderId: docSnap.id,
          status: typeof data.status === 'string' ? data.status : 'unknown',
          items:
            (typeof data.itemsSummary === 'string' && data.itemsSummary) ||
            (typeof data.restaurantName === 'string' && data.restaurantName) ||
            'meal item',
          createdAt: new Date().toISOString(),
        };
      });
      latestOrdersRef.current = mapped;
      latestOrderRef.current = mapped[0] ?? null;
    });
  }, [latestOrderRef, latestOrdersRef, user?.uid]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const uid = user?.uid;
    if (!uid) return;
    const onOrderUpdate = onSnapshot(
      query(
        collection(db, 'orders'),
        where('participants', 'array-contains', uid),
      ),
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'removed') return;
          const id = change.doc.id;
          const data = change.doc.data() as Record<string, unknown>;
          const status =
            typeof data.status === 'string'
              ? data.status.toLowerCase()
              : 'unknown';
          const participants = Array.isArray(data.participants)
            ? data.participants.length
            : 0;
          const prev = orderStateCacheRef.current[id];
          orderStateCacheRef.current[id] = { status, participants };
          if (!prev) return;
          const key = `${id}:${status}:${participants}`;
          if (tidioOrderEventSentRef.current.has(key)) return;
          tidioOrderEventSentRef.current.add(key);
        });
      },
    );
    return () => onOrderUpdate();
  }, [orderStateCacheRef, tidioOrderEventSentRef, user?.uid]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const existing = document.getElementById('tidio-live-chat');
    if (existing) return;
    const script = document.createElement('script');
    script.id = 'tidio-live-chat';
    script.src = '//code.tidio.co/fnmubcdwbtbooaqhbih23ly2idzdyq6b.js';
    script.async = true;
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    type TidioApi = {
      setVisitorData?: (data: Record<string, string>) => void;
      on?: (event: string, handler: (payload?: unknown) => void) => void;
      off?: (event: string, handler: (payload?: unknown) => void) => void;
      showMessage?: (message: string | { message: string }) => void;
      sendMessage?: (message: string | { message: string }) => void;
      addMessage?: (message: string | { message: string }) => void;
    };
    const tidioWindow = window as Window & { tidioChatApi?: TidioApi };
    const api = tidioWindow.tidioChatApi;
    if (!api) return;

    api.setVisitorData?.({
      distinct_id: user?.uid ?? 'guest',
      userId: user?.uid ?? 'guest',
      email: user?.email ?? 'noemail@example.com',
      name: user?.displayName ?? 'User',
    });

    const onVisitorMessage = async (payload?: unknown) => {
      const data =
        payload && typeof payload === 'object'
          ? (payload as Record<string, unknown>)
          : null;
      const message =
        typeof data?.message === 'string' ? data.message.trim() : '';
      if (!message) return;
      await addDoc(collection(db, 'chats'), {
        message,
        createdAt: serverTimestamp(),
        source: 'tidio',
        userId: user?.uid ?? null,
        email: user?.email ?? null,
        name: user?.displayName ?? null,
      });
    };

    const onChatOpened = async () => {
      const key = `tidio_autoreply_seen_${user?.uid ?? 'guest'}`;
      const seen = await AsyncStorage.getItem(key);
      if (seen) return;
      await AsyncStorage.setItem(key, '1');
      api.showMessage?.({ message: 'Welcome to HalfOrder support chat.' });
    };

    api.on?.('messageFromVisitor', onVisitorMessage);
    api.on?.('chatOpen', onChatOpened);
    api.on?.('chatOpened', onChatOpened);
    return () => {
      api.off?.('messageFromVisitor', onVisitorMessage);
      api.off?.('chatOpen', onChatOpened);
      api.off?.('chatOpened', onChatOpened);
    };
  }, [user?.displayName, user?.email, user?.uid]);
}
