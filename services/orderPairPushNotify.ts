/**
 * When a HalfOrder reaches exactly two members, notify the other user via Expo Push API.
 * Deduped with `orders.notified` (legacy `pairJoinPushSent` also blocks re-send).
 */
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';

import { HALF_ORDER_PAIR_JOIN_PUSH_TYPE } from '@/constants/pushTypes';
import { db } from '@/services/firebase';

const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';

function normalizeOrderUsers(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

/** Haversine distance in km, one decimal. */
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): string {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (R * c).toFixed(1);
}

function parseUserLatLng(d: Record<string, unknown>): { lat: number; lng: number } | null {
  const latRaw = d.latitude;
  const lngRaw = d.longitude;
  if (typeof latRaw === 'number' && typeof lngRaw === 'number') {
    if (Number.isFinite(latRaw) && Number.isFinite(lngRaw)) {
      return { lat: latRaw, lng: lngRaw };
    }
  }
  const loc = d.location;
  if (loc && typeof loc === 'object' && loc !== null) {
    const o = loc as Record<string, unknown>;
    const la =
      typeof o.latitude === 'number'
        ? o.latitude
        : typeof o.lat === 'number'
          ? o.lat
          : null;
    const lo =
      typeof o.longitude === 'number'
        ? o.longitude
        : typeof o.lng === 'number'
          ? o.lng
          : null;
    if (la != null && lo != null && Number.isFinite(la) && Number.isFinite(lo)) {
      return { lat: la, lng: lo };
    }
  }
  return null;
}

type JoinerProfile = {
  name: string;
  avatar: string | null;
  latLng: { lat: number; lng: number } | null;
};

async function fetchJoinerProfile(joinerUid: string): Promise<JoinerProfile> {
  const snap = await getDoc(doc(db, 'users', joinerUid));
  if (!snap.exists()) {
    return { name: 'Someone', avatar: null, latLng: null };
  }
  const d = snap.data() as Record<string, unknown>;
  const fromName =
    (typeof d.name === 'string' && d.name.trim() ? d.name.trim() : '') ||
    (typeof d.displayName === 'string' && d.displayName.trim()
      ? d.displayName.trim()
      : '');
  const email = typeof d.email === 'string' ? d.email.trim() : '';
  const local =
    email.includes('@') ? (email.split('@')[0]?.trim() ?? '') : '';
  const name = fromName || local || 'Someone';

  const avatarRaw =
    (typeof d.avatar === 'string' && d.avatar.trim() ? d.avatar.trim() : '') ||
    (typeof d.photoURL === 'string' && d.photoURL.trim()
      ? d.photoURL.trim()
      : '');
  const avatar =
    /^https?:\/\//i.test(avatarRaw) && avatarRaw.length < 2000 ? avatarRaw : null;

  return { name, avatar, latLng: parseUserLatLng(d) };
}

async function getExpoPushTokenForUser(uid: string): Promise<string | null> {
  const uSnap = await getDoc(doc(db, 'users', uid));
  if (uSnap.exists()) {
    const d = uSnap.data() as Record<string, unknown>;
    const f =
      typeof d.fcmToken === 'string' && d.fcmToken.trim()
        ? d.fcmToken.trim()
        : '';
    const a =
      typeof d.pushToken === 'string' && d.pushToken.trim()
        ? d.pushToken.trim()
        : '';
    const b =
      typeof d.expoPushToken === 'string' && d.expoPushToken.trim()
        ? d.expoPushToken.trim()
        : '';
    if (f) return f;
    if (a) return a;
    if (b) return b;
  }
  const subSnap = await getDoc(doc(db, 'users', uid, 'pushToken', 'default'));
  if (subSnap.exists()) {
    const t = subSnap.data()?.token;
    if (typeof t === 'string' && t.trim()) return t.trim();
  }
  const fcmSub = await getDoc(doc(db, 'users', uid, 'fcmToken', 'default'));
  if (fcmSub.exists()) {
    const t = fcmSub.data()?.token;
    if (typeof t === 'string' && t.trim()) return t.trim();
  }
  return null;
}

type ExpoPushTicket = { status?: string; message?: string; id?: string };

/**
 * Claim `orders.notified` in a transaction, then send Expo push to the other member.
 */
export async function trySendPairJoinExpoPush(
  orderId: string,
  joinerUid: string,
): Promise<void> {
  const oid = orderId.trim();
  const jid = joinerUid.trim();
  if (!oid || !jid) return;

  let recipientUid: string | null = null;

  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'orders', oid);
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const d = snap.data() as Record<string, unknown>;
      if (typeof d.cardId !== 'string' || !d.cardId) return;
      const users = normalizeOrderUsers(d.users);
      if (users.length !== 2) return;
      if (!users.includes(jid)) return;
      if (d.notified === true) return;
      if (d.pairJoinPushSent === true) return;
      const other = users.find((u) => u !== jid);
      if (!other) return;

      tx.update(ref, {
        notified: true,
        notifiedAt: serverTimestamp(),
      });
      recipientUid = other;
    });
  } catch (e) {
    console.warn('[pairPush] claim transaction failed', e);
    return;
  }

  if (!recipientUid) return;

  const [token, joiner, recipientSnap] = await Promise.all([
    getExpoPushTokenForUser(recipientUid),
    fetchJoinerProfile(jid),
    getDoc(doc(db, 'users', recipientUid)),
  ]);

  if (!token) {
    console.warn('[pairPush] no Expo push token for user', recipientIdLog(recipientUid));
    return;
  }

  const recipientData = recipientSnap.exists()
    ? (recipientSnap.data() as Record<string, unknown>)
    : null;
  const recipientLatLng = recipientData ? parseUserLatLng(recipientData) : null;

  let distanceKm: string | null = null;
  if (
    joiner.latLng &&
    recipientLatLng &&
    Number.isFinite(joiner.latLng.lat) &&
    Number.isFinite(joiner.latLng.lng) &&
    Number.isFinite(recipientLatLng.lat) &&
    Number.isFinite(recipientLatLng.lng)
  ) {
    distanceKm = getDistance(
      joiner.latLng.lat,
      joiner.latLng.lng,
      recipientLatLng.lat,
      recipientLatLng.lng,
    );
  }

  const title = `${joiner.name} joined your order 🍕`;
  const body = distanceKm
    ? `He is ${distanceKm} km away`
    : 'Open your order to connect and chat!';

  const data: Record<string, string> = {
    type: HALF_ORDER_PAIR_JOIN_PUSH_TYPE,
    orderId: oid,
    userId: jid,
    joinerName: joiner.name,
  };
  if (distanceKm) data.distanceKm = distanceKm;

  const message: Record<string, unknown> = {
    to: token,
    title,
    body,
    sound: 'default',
    priority: 'high',
    channelId: 'default',
    data,
  };
  if (joiner.avatar) {
    message.image = joiner.avatar;
  }

  try {
    const pushToken = token;
    console.log('Sending notification to:', pushToken);

    const res = await fetch(EXPO_PUSH_SEND_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([message]),
    });

    console.log('Notification sent');

    const json = (await res.json()) as { data?: ExpoPushTicket[] };
    const ticket = json.data?.[0];
    if (ticket?.status === 'error') {
      console.warn('[pairPush] Expo push error:', ticket.message ?? ticket);
    }
  } catch (e) {
    console.warn('[pairPush] Expo push request failed', e);
  }
}

function recipientIdLog(uid: string): string {
  return uid.length > 6 ? `${uid.slice(0, 3)}…${uid.slice(-2)}` : uid;
}
