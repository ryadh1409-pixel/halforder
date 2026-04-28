/**
 * Expo Push HTTP API only (no Firebase Admin `messaging()` / direct FCM).
 * @see https://docs.expo.dev/push-notifications/sending-notifications/
 */

const fetch = require('node-fetch');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Single notification (wrapped in a one-element array for Expo Push API v2).
 * @param {string} token Expo push token
 * @param {string} title
 * @param {string} body
 * @param {Record<string, string>} [data] String values only for best client compatibility
 */
async function sendPush(token, title, body, data) {
  if (!token || typeof token !== 'string') return;
  const payload = {
    to: token,
    title: title || 'HalfOrder',
    body: body || '',
    sound: 'default',
  };
  if (data && typeof data === 'object') {
    payload.data = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [
        k,
        typeof v === 'string' ? v : String(v),
      ]),
    );
  }
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([payload]),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn('[sendPush] HTTP error', res.status, text);
      return;
    }
    const json = await res.json().catch(() => ({}));
    const ticket = Array.isArray(json.data) ? json.data[0] : null;
    if (ticket?.status === 'error') {
      console.warn('[sendPush] ticket error', ticket.message, ticket.details);
    }
  } catch (e) {
    console.warn('[sendPush] failed', e);
  }
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} uid
 * @returns {Promise<string|null>}
 */
async function getExpoTokenForUser(db, uid) {
  if (!uid || typeof uid !== 'string') return null;
  const userSnap = await db.doc(`users/${uid}`).get();
  if (userSnap.exists) {
    const d = userSnap.data() || {};
    if (d.notificationsEnabled === false) return null;
    const fcm = typeof d.fcmToken === 'string' ? d.fcmToken.trim() : '';
    const a = typeof d.expoPushToken === 'string' ? d.expoPushToken.trim() : '';
    const b = typeof d.pushToken === 'string' ? d.pushToken.trim() : '';
    if (fcm) return fcm;
    if (a) return a;
    if (b) return b;
  }
  const subPaths = [
    `users/${uid}/pushToken/default`,
    `users/${uid}/fcmToken/default`,
  ];
  for (const p of subPaths) {
    const s = await db.doc(p).get();
    const tok = s.exists ? s.data()?.token : null;
    if (typeof tok === 'string' && tok.trim()) return tok.trim();
  }
  return null;
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {string[]} userIds
 * @param {string} title
 * @param {string} body
 * @param {Record<string, string>} [data]
 */
async function notifyUsersExpo(db, userIds, title, body, data) {
  const unique = [
    ...new Set(userIds.filter((id) => typeof id === 'string' && id)),
  ];
  for (const uid of unique) {
    const token = await getExpoTokenForUser(db, uid);
    if (!token) continue;
    await sendPush(token, title, body, data);
  }
}

module.exports = {
  EXPO_PUSH_URL,
  sendPush,
  getExpoTokenForUser,
  notifyUsersExpo,
};
