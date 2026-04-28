const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const Stripe = require('stripe');

const { notifyUsersExpo } = require('./lib/expoPush');

admin.initializeApp();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-06-20',
});

function getDayId(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function buildInvoiceNumber(dayId, paymentId) {
  return `INV-${dayId.replace(/-/g, '')}-${paymentId.slice(0, 6).toUpperCase()}`;
}

/** Inbound address for feedback + daily report (not secret). */
const SUPPORT_INBOX = 'support@halforder.app';

/**
 * Nodemailer → Gmail using Firebase runtime config (recommended).
 * Run: `firebase functions:config:set gmail.email="you@gmail.com" gmail.password="xxxx xxxx xxxx xxxx"`
 *
 * For local emulator only, you may set GMAIL_USER + GMAIL_APP_PASSWORD instead.
 */
function getMailTransporter() {
  const gmailCfg = functions.config().gmail || {};
  const user =
    gmailCfg.email || process.env.GMAIL_USER || process.env.SMTP_USER || '';
  const pass =
    gmailCfg.password ||
    process.env.GMAIL_APP_PASSWORD ||
    process.env.SMTP_PASS ||
    '';
  if (!user || !pass) {
    throw new Error(
      'Mail not configured: set functions.config gmail.email and gmail.password',
    );
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

const ADMIN_FCM_TOKEN = process.env.ADMIN_FCM_TOKEN || '';

const BADGE_TRUSTED = '🔥 Trusted';
const BADGE_FAST_JOINER = '⚡ Fast Joiner';
const BADGE_COMMUNICATIVE = '💬 Communicative';
const BADGE_FOOD_LOVER = '🍕 Food Lover';
const MAX_CANCELLATIONS_PER_24H = 3;
const REPORT_RESTRICTION_THRESHOLD = 5;
/** UGC: surface “flagged” to clients to hide user content (lighter than `restricted`). */
const REPORT_FLAG_THRESHOLD = 3;

function computeTrustScore({
  averageRating = 0,
  totalOrdersCompleted = 0,
  cancellationRate = 0,
  reportCount = 0,
}) {
  const normalizedCancellation =
    cancellationRate > 1 ? cancellationRate / 100 : cancellationRate;
  return Number(
    (
      averageRating * 0.5 +
      totalOrdersCompleted * 0.3 -
      normalizedCancellation * 0.1 -
      reportCount * 0.1
    ).toFixed(2),
  );
}

function computeBadges({
  averageRating = 0,
  totalOrdersCompleted = 0,
  ordersJoined = 0,
  messagesSent = 0,
}) {
  const badges = [];
  if (averageRating >= 4.5 && totalOrdersCompleted >= 8) {
    badges.push(BADGE_TRUSTED);
  }
  if (ordersJoined >= 10) {
    badges.push(BADGE_FAST_JOINER);
  }
  if (messagesSent >= 30) {
    badges.push(BADGE_COMMUNICATIVE);
  }
  if (totalOrdersCompleted >= 20) {
    badges.push(BADGE_FOOD_LOVER);
  }
  return badges;
}

function arraysEqual(a = [], b = []) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function normalizeCancellationRate(value = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    return 0;
  return value > 1 ? value / 100 : value;
}

function sameStringArray(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function computeSuspiciousSignals({
  reportCount = 0,
  cancellationRate = 0,
  cancellationCount24h = 0,
  totalOrdersCompleted = 0,
}) {
  const signals = [];
  const normalizedCancelRate = normalizeCancellationRate(cancellationRate);
  if (reportCount >= 3) signals.push('high_reports');
  if (normalizedCancelRate >= 0.5 && totalOrdersCompleted >= 4) {
    signals.push('high_cancellation_rate');
  }
  if (cancellationCount24h >= MAX_CANCELLATIONS_PER_24H) {
    signals.push('frequent_daily_cancellations');
  }
  return signals;
}

async function refreshUserDerivedFields(db, userId) {
  const userRef = db.doc(`users/${userId}`);
  const userSnap = await userRef.get();
  const userData = userSnap.exists ? userSnap.data() : {};

  const averageRating =
    typeof userData?.averageRating === 'number' ? userData.averageRating : 0;
  const totalOrdersCompleted =
    typeof userData?.totalOrdersCompleted === 'number'
      ? userData.totalOrdersCompleted
      : typeof userData?.ordersCount === 'number'
        ? userData.ordersCount
        : 0;
  const cancellationRate =
    typeof userData?.cancellationRate === 'number'
      ? userData.cancellationRate
      : 0;
  const reportCount =
    typeof userData?.reportCount === 'number' ? userData.reportCount : 0;
  const ordersJoined =
    typeof userData?.ordersJoined === 'number' ? userData.ordersJoined : 0;
  const messagesSent =
    typeof userData?.messagesSent === 'number' ? userData.messagesSent : 0;
  const cancellationCount24h =
    typeof userData?.cancellationCount24h === 'number'
      ? userData.cancellationCount24h
      : 0;

  const trustScore = computeTrustScore({
    averageRating,
    totalOrdersCompleted,
    cancellationRate,
    reportCount,
  });
  const badges = computeBadges({
    averageRating,
    totalOrdersCompleted,
    ordersJoined,
    messagesSent,
  });
  const currentBadges = Array.isArray(userData?.badges)
    ? userData.badges.filter((x) => typeof x === 'string')
    : [];
  const suspiciousSignals = computeSuspiciousSignals({
    reportCount,
    cancellationRate,
    cancellationCount24h,
    totalOrdersCompleted,
  });
  const suspicious = suspiciousSignals.length > 0;
  const shouldRestrictForReports = reportCount >= REPORT_RESTRICTION_THRESHOLD;
  const alreadyRestricted = userData?.restricted === true;
  const shouldFlag = reportCount >= REPORT_FLAG_THRESHOLD;
  const flaggedCurrent =
    userData?.isFlagged === true || userData?.flagged === true;

  const needsUpdate =
    trustScore !==
      (typeof userData?.trustScore === 'number' ? userData.trustScore : 0) ||
    !arraysEqual(currentBadges, badges) ||
    userData?.suspicious !== suspicious ||
    !sameStringArray(
      Array.isArray(userData?.suspiciousSignals)
        ? userData.suspiciousSignals.filter((x) => typeof x === 'string')
        : [],
      suspiciousSignals,
    ) ||
    (shouldRestrictForReports && !alreadyRestricted) ||
    shouldFlag !== flaggedCurrent;

  if (!needsUpdate) return;
  const updates = {
    trustScore,
    badges,
    suspicious,
    suspiciousSignals,
    isFlagged: shouldFlag,
  };
  if (shouldRestrictForReports && !alreadyRestricted) {
    updates.restricted = true;
    updates.restrictedReason = 'Too many reports';
    updates.restrictedAt = admin.firestore.FieldValue.serverTimestamp();
  }
  await userRef.set(updates, { merge: true });
}

function resolveOrderOwnerId(orderData = {}) {
  if (typeof orderData.createdBy === 'string' && orderData.createdBy) {
    return orderData.createdBy;
  }
  if (typeof orderData.hostId === 'string' && orderData.hostId) {
    return orderData.hostId;
  }
  if (typeof orderData.userId === 'string' && orderData.userId) {
    return orderData.userId;
  }
  return null;
}

exports.onSupportMessage = functions.firestore
  .document('support_chats/{userId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const sender = data?.sender;

    if (sender !== 'user') return null;

    if (!ADMIN_FCM_TOKEN) {
      console.warn('ADMIN_FCM_TOKEN not set, skipping notification');
      return null;
    }

    const text =
      typeof data?.text === 'string' ? data.text.slice(0, 100) : 'New message';

    await admin.messaging().send({
      token: ADMIN_FCM_TOKEN,
      notification: {
        title: 'Support: New message',
        body: text,
      },
      data: {
        userId: context.params.userId,
      },
    });

    return null;
  });

exports.sendOrderInvite = functions.firestore
  .document('invites/{inviteId}')
  .onCreate(async (snap, context) => {
    const inviteId = context.params.inviteId;
    const data = snap.data();
    const email = typeof data?.email === 'string' ? data.email : '';
    const orderId = typeof data?.orderId === 'string' ? data.orderId : '';
    const inviterName =
      typeof data?.inviterName === 'string' ? data.inviterName : 'Someone';

    if (!email || !orderId) {
      console.error('sendOrderInvite: missing email or orderId', {
        inviteId,
        email,
        orderId,
      });
      await snap.ref
        .update({ status: 'failed', error: 'missing email or orderId' })
        .catch((err) => console.error(err));
      return null;
    }

    const inviteLink = `https://halforder.app/order/${orderId}`;
    const subject = 'You were invited to join an order';
    const body = `Hi,\n\n${inviterName} invited you to join a shared order on HalfOrder.\n\nClick here to join:\n${inviteLink}`;

    try {
      const transport = getMailTransporter();
      await transport.sendMail({
        from: '"HalfOrder" <noreply@halforder.app>',
        to: email,
        subject,
        text: body,
      });
      await snap.ref.update({ status: 'sent' });
    } catch (err) {
      console.error('sendOrderInvite: failed to send email', inviteId, err);
      await snap.ref
        .update({ status: 'failed', error: err?.message || String(err) })
        .catch((e) => console.error(e));
    }
    return null;
  });

/**
 * When a rating is created, update the receiver's user document with
 * ratingAverage and ratingCount (recomputed from all ratings for that user).
 */
exports.onRatingCreated = functions.firestore
  .document('ratings/{ratingId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const toUserId = typeof data?.toUserId === 'string' ? data.toUserId : null;
    if (!toUserId) return null;

    const db = admin.firestore();
    const ratingsSnap = await db
      .collection('ratings')
      .where('toUserId', '==', toUserId)
      .get();
    let sum = 0;
    let count = 0;
    ratingsSnap.docs.forEach((d) => {
      const r = d.data().rating;
      if (typeof r === 'number') {
        sum += r;
        count += 1;
      }
    });
    const ratingAverage = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
    const userRef = db.doc(`users/${toUserId}`);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};
    const totalOrdersCompleted =
      typeof userData?.totalOrdersCompleted === 'number'
        ? userData.totalOrdersCompleted
        : typeof userData?.ordersCount === 'number'
          ? userData.ordersCount
          : 0;
    const cancellationRate =
      typeof userData?.cancellationRate === 'number'
        ? userData.cancellationRate
        : 0;
    const reportCount =
      typeof userData?.reportCount === 'number' ? userData.reportCount : 0;
    const trustScore = computeTrustScore({
      averageRating: ratingAverage,
      totalOrdersCompleted,
      cancellationRate,
      reportCount,
    });

    await userRef.set(
      {
        ratingAverage,
        ratingCount: count,
        averageRating: ratingAverage,
        totalRatings: count,
        totalOrdersCompleted,
        cancellationRate,
        reportCount,
        trustScore,
      },
      { merge: true },
    );
    await refreshUserDerivedFields(db, toUserId);
    return null;
  });

exports.onReportCreated = functions.firestore
  .document('reports/{reportId}')
  .onCreate(async (snap) => {
    const data = snap.data();
    const reportedUserId =
      typeof data?.reportedUserId === 'string' ? data.reportedUserId : null;
    if (!reportedUserId) return null;

    const db = admin.firestore();
    const userRef = db.doc(`users/${reportedUserId}`);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};

    const averageRating =
      typeof userData?.averageRating === 'number' ? userData.averageRating : 0;
    const totalOrdersCompleted =
      typeof userData?.totalOrdersCompleted === 'number'
        ? userData.totalOrdersCompleted
        : typeof userData?.ordersCount === 'number'
          ? userData.ordersCount
          : 0;
    const cancellationRate =
      typeof userData?.cancellationRate === 'number'
        ? userData.cancellationRate
        : 0;
    const reportCount =
      (typeof userData?.reportCount === 'number' ? userData.reportCount : 0) +
      1;

    const trustScore = computeTrustScore({
      averageRating,
      totalOrdersCompleted,
      cancellationRate,
      reportCount,
    });

    await userRef.set(
      {
        reportCount,
        trustScore,
      },
      { merge: true },
    );
    await refreshUserDerivedFields(db, reportedUserId);
    return null;
  });

exports.onOrderMessageCreated = functions.firestore
  .document('orders/{orderId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const data = snap.data() || {};
    const senderId = typeof data.senderId === 'string' ? data.senderId : null;
    if (!senderId) return null;

    const db = admin.firestore();
    const userRef = db.doc(`users/${senderId}`);
    await userRef.set(
      {
        messagesSent: admin.firestore.FieldValue.increment(1),
      },
      { merge: true },
    );
    await refreshUserDerivedFields(db, senderId);

    const orderId = context.params.orderId;
    const messageId = context.params.messageId;
    const isSystem =
      data.type === 'system' ||
      senderId === 'system' ||
      String(data.senderName ?? '').toLowerCase() === 'system';
    if (!isSystem && orderId) {
      try {
        const orderSnap = await db.doc(`orders/${orderId}`).get();
        if (orderSnap.exists) {
          const od = orderSnap.data() || {};
          const members = orderMemberIds(od);
          const recipients = members.filter((id) => id !== senderId);
          if (recipients.length > 0) {
            const bodyText =
              typeof data.text === 'string' && data.text.trim()
                ? data.text.trim().slice(0, 200)
                : 'New message';
            const senderNameRaw =
              (typeof data.userName === 'string' && data.userName.trim()) ||
              (typeof data.senderName === 'string' && data.senderName.trim()) ||
              '';
            const title = senderNameRaw || 'Order chat';
            await notifyUsersExpo(db, recipients, title, bodyText, {
              type: 'order_message',
              orderId,
              messageId,
            });
          }
        }
      } catch (e) {
        console.warn('[onOrderMessageCreated] push notify', orderId, e);
      }
    }

    return null;
  });

exports.onUserMetricsUpdated = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const watched = [
      'averageRating',
      'totalOrdersCompleted',
      'ordersCount',
      'cancellationRate',
      'reportCount',
      'ordersJoined',
      'messagesSent',
    ];
    const changed = watched.some((k) => before[k] !== after[k]);
    if (!changed) return null;
    const db = admin.firestore();
    await refreshUserDerivedFields(db, context.params.userId);
    return null;
  });

exports.onOrderCreated = functions.firestore
  .document('orders/{orderId}')
  .onCreate(async (snap) => {
    const data = snap.data() || {};
    const ownerId = resolveOrderOwnerId(data);
    if (!ownerId) return null;
    const db = admin.firestore();
    await db.doc(`users/${ownerId}`).set(
      {
        activeOrderCount: admin.firestore.FieldValue.increment(1),
      },
      { merge: true },
    );
    try {
      const now = new Date();
      const dayId = now.toISOString().slice(0, 10);
      await db.doc(`analytics/daily/days/${dayId}`).set(
        {
          date: dayId,
          totalOrders: admin.firestore.FieldValue.increment(1),
          activeUsers: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } catch (e) {
      console.warn('[onOrderCreated] analytics totalOrders failed', e);
    }
    await refreshUserDerivedFields(db, ownerId);
    return null;
  });

exports.onOrderDeleted = functions.firestore
  .document('orders/{orderId}')
  .onDelete(async (snap) => {
    const data = snap.data() || {};
    const ownerId = resolveOrderOwnerId(data);
    if (!ownerId) return null;
    const db = admin.firestore();
    const userRef = db.doc(`users/${ownerId}`);
    await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      const current = userSnap.exists ? userSnap.data()?.activeOrderCount : 0;
      const currentCount = typeof current === 'number' ? current : 0;
      tx.set(
        userRef,
        { activeOrderCount: Math.max(0, currentCount - 1) },
        { merge: true },
      );
    });
    await refreshUserDerivedFields(db, ownerId);
    return null;
  });

exports.onOrderUpdatedSafety = functions.firestore
  .document('orders/{orderId}')
  .onUpdate(async (change) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const beforeOwnerId = resolveOrderOwnerId(before);
    const afterOwnerId = resolveOrderOwnerId(after);
    const db = admin.firestore();

    // if owner changes (rare), move active order ownership count
    if (beforeOwnerId && afterOwnerId && beforeOwnerId !== afterOwnerId) {
      const beforeRef = db.doc(`users/${beforeOwnerId}`);
      const afterRef = db.doc(`users/${afterOwnerId}`);
      await db.runTransaction(async (tx) => {
        const [beforeSnap, afterSnap] = await Promise.all([
          tx.get(beforeRef),
          tx.get(afterRef),
        ]);
        const beforeCount =
          typeof beforeSnap.data()?.activeOrderCount === 'number'
            ? beforeSnap.data().activeOrderCount
            : 0;
        const afterCount =
          typeof afterSnap.data()?.activeOrderCount === 'number'
            ? afterSnap.data().activeOrderCount
            : 0;
        tx.set(
          beforeRef,
          { activeOrderCount: Math.max(0, beforeCount - 1) },
          { merge: true },
        );
        tx.set(
          afterRef,
          { activeOrderCount: Math.max(0, afterCount + 1) },
          { merge: true },
        );
      });
      await Promise.all([
        refreshUserDerivedFields(db, beforeOwnerId),
        refreshUserDerivedFields(db, afterOwnerId),
      ]);
      return null;
    }

    const ownerId = afterOwnerId || beforeOwnerId;
    if (!ownerId) return null;

    const beforeStatus = typeof before.status === 'string' ? before.status : '';
    const afterStatus = typeof after.status === 'string' ? after.status : '';
    const userRef = db.doc(`users/${ownerId}`);

    // Count cancellations in rolling 24h window and keep a rate hint.
    if (beforeStatus !== 'cancelled' && afterStatus === 'cancelled') {
      await db.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        const d = userSnap.exists ? userSnap.data() : {};
        const nowMs = Date.now();
        const windowStartMs =
          typeof d?.cancellationWindowStartMs === 'number'
            ? d.cancellationWindowStartMs
            : nowMs;
        const count24hRaw =
          typeof d?.cancellationCount24h === 'number'
            ? d.cancellationCount24h
            : 0;
        const withinWindow = nowMs - windowStartMs <= 24 * 60 * 60 * 1000;
        const cancellationCount24h = withinWindow ? count24hRaw + 1 : 1;
        const nextWindowStart = withinWindow ? windowStartMs : nowMs;
        const cancelledOrdersTotal =
          (typeof d?.cancelledOrders === 'number' ? d.cancelledOrders : 0) + 1;
        const completed =
          typeof d?.totalOrdersCompleted === 'number'
            ? d.totalOrdersCompleted
            : typeof d?.ordersCount === 'number'
              ? d.ordersCount
              : 0;
        const totalAttempts = completed + cancelledOrdersTotal;
        const cancellationRate =
          totalAttempts > 0 ? cancelledOrdersTotal / totalAttempts : 0;
        tx.set(
          userRef,
          {
            cancellationCount24h,
            cancellationWindowStartMs: nextWindowStart,
            cancelledOrders: cancelledOrdersTotal,
            cancellationRate,
            lastCancelledAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      });
    }

    // If order moves to terminal status, release one active slot.
    const becameTerminal =
      !['completed', 'cancelled', 'closed', 'expired'].includes(beforeStatus) &&
      ['completed', 'cancelled', 'closed', 'expired'].includes(afterStatus);
    if (becameTerminal) {
      await db.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        const d = userSnap.exists ? userSnap.data() : {};
        const count =
          typeof d?.activeOrderCount === 'number' ? d.activeOrderCount : 0;
        tx.set(
          userRef,
          { activeOrderCount: Math.max(0, count - 1) },
          { merge: true },
        );
      });
    }
    await refreshUserDerivedFields(db, ownerId);
    return null;
  });

/**
 * When a new chat message is created, notify the other participant via Expo push.
 */
exports.onNewChatMessage = functions.firestore
  .document('messages/{messageId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const chatId = typeof data?.chatId === 'string' ? data.chatId : null;
    const senderId = typeof data?.senderId === 'string' ? data.senderId : null;
    if (!chatId || !senderId) return null;
    const db = admin.firestore();

    const chatSnap = await db.doc(`chats/${chatId}`).get();
    if (!chatSnap.exists()) return null;
    const participants = chatSnap.data()?.participants;
    if (!Array.isArray(participants) || participants.length < 2) return null;
    const receiverId = participants.find((id) => id !== senderId);
    if (!receiverId) return null;

    const userSnap = await db.doc(`users/${receiverId}`).get();
    if (!userSnap.exists()) return null;
    const userData = userSnap.data();
    const token =
      userData?.fcmToken ?? userData?.expoPushToken ?? userData?.pushToken;
    if (typeof token !== 'string' || !token) return null;
    if (userData?.notificationsEnabled === false) return null;

    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: token,
          sound: 'default',
          title: 'New message',
          body: 'You received a message in HalfOrder',
          data: {
            type: 'chat_message',
            chatId,
            messageId: context.params.messageId,
          },
        }),
      });
      if (!response.ok) {
        console.warn('onNewChatMessage push failed', await response.text());
      }
    } catch (err) {
      console.warn('onNewChatMessage push error', err);
    }
    return null;
  });

/**
 * When a user submits a complaint, send an Expo push notification to the admin.
 * Admin push token is stored in Firestore: admins collection, document with email "support@halforder.app".
 */
exports.notifyAdminOnComplaint = functions.firestore
  .document('complaints/{complaintId}')
  .onCreate(async (snap, context) => {
    const db = admin.firestore();
    const adminSnapshot = await db
      .collection('admins')
      .where('email', '==', 'support@halforder.app')
      .limit(1)
      .get();

    if (adminSnapshot.empty) {
      console.warn(
        'notifyAdminOnComplaint: no admin document found for support@halforder.app',
      );
      return null;
    }

    const pushToken = adminSnapshot.docs[0].data()?.pushToken;
    if (typeof pushToken !== 'string' || !pushToken) {
      console.warn(
        'notifyAdminOnComplaint: admin pushToken missing or invalid',
      );
      return null;
    }

    const message = {
      to: pushToken,
      sound: 'default',
      title: 'New HalfOrder Message',
      body: 'A user sent a complaint or inquiry',
      data: { type: 'complaint', complaintId: context.params.complaintId },
    };

    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });
      if (!response.ok) {
        console.warn(
          'notifyAdminOnComplaint push failed',
          await response.text(),
        );
      }
    } catch (err) {
      console.warn('notifyAdminOnComplaint push error', err);
    }
    return null;
  });

/**
 * New chat message under HalfOrder / order thread: `chats/{chatId}/messages/*`.
 * Sends via Expo Push API (not FCM directly).
 */
exports.sendMessageNotification = functions.firestore
  .document('chats/{chatId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const data = snap.data() || {};
    if (data.notificationSent === true) return null;
    const senderId = typeof data.senderId === 'string' ? data.senderId : null;
    if (!senderId || senderId === 'system') return null;
    if (data.sender === 'ai') return null;

    const db = admin.firestore();
    const chatId = context.params.chatId;
    const chatSnap = await db.doc(`chats/${chatId}`).get();
    if (!chatSnap.exists) return null;
    const c = chatSnap.data() || {};
    const participants = Array.isArray(c.participants)
      ? c.participants.filter((x) => typeof x === 'string')
      : [];
    const users = Array.isArray(c.users)
      ? c.users.filter((x) => typeof x === 'string')
      : [];
    const members = participants.length > 0 ? participants : users;
    if (members.length === 0) return null;

    const recipients = members.filter((id) => id !== senderId);
    if (recipients.length === 0) return null;

    const bodyText =
      typeof data.text === 'string' && data.text.trim()
        ? data.text.trim().slice(0, 200)
        : 'New message';

    const senderNameRaw =
      (typeof data.userName === 'string' && data.userName.trim()) ||
      (typeof data.senderName === 'string' && data.senderName.trim()) ||
      '';
    const title = senderNameRaw || 'Someone';

    await notifyUsersExpo(db, recipients, title, bodyText, {
      type: 'chat_message',
      chatId,
      messageId: context.params.messageId,
    });

    return null;
  });

/**
 * Notify restaurant host when a shared order becomes matched.
 * Trigger: orders/{orderId} onWrite
 * Condition: usersCount reaches threshold and status is matched.
 */
exports.notifyHostOnMatchedOrder = functions.firestore
  .document('orders/{orderId}')
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    if (!after) return null;

    const prevCount =
      before && typeof before.usersCount === 'number' ? before.usersCount : 0;
    const nextCount =
      typeof after.usersCount === 'number' ? after.usersCount : 0;
    const status = typeof after.status === 'string' ? after.status : 'waiting';
    const threshold =
      typeof after.matchThreshold === 'number' && after.matchThreshold > 0
        ? after.matchThreshold
        : 2;
    const alreadyNotified = after.hostNotifiedAt != null;
    if (alreadyNotified) return null;
    if (status !== 'matched') return null;
    if (nextCount < threshold) return null;
    if (prevCount >= threshold) return null;

    const restaurantId =
      typeof after.restaurantId === 'string' ? after.restaurantId : '';
    const mealId = typeof after.mealId === 'string' ? after.mealId : '';
    if (!restaurantId) return null;

    const db = admin.firestore();
    const restaurantSnap = await db.doc(`restaurants/${restaurantId}`).get();
    if (!restaurantSnap.exists) return null;
    const ownerId = restaurantSnap.data()?.ownerId;
    if (typeof ownerId !== 'string' || !ownerId) return null;

    const ownerSnap = await db.doc(`users/${ownerId}`).get();
    if (!ownerSnap.exists) return null;
    const owner = ownerSnap.data() || {};
    const token =
      owner.expoPushToken || owner.pushToken || owner.fcmToken || null;
    if (typeof token !== 'string' || !token) return null;

    let mealName = 'this meal';
    if (mealId) {
      const mealSnap = await db.doc(`meals/${mealId}`).get();
      if (mealSnap.exists) {
        const n = mealSnap.data()?.name;
        if (typeof n === 'string' && n.trim()) mealName = n.trim();
      }
    }

    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: token,
          sound: 'default',
          title: 'Shared order ready',
          body: `New shared order ready for ${mealName}`,
          data: {
            type: 'host_order_matched',
            orderId: context.params.orderId,
            mealId,
            restaurantId,
          },
        }),
      });
      if (!response.ok) {
        console.warn(
          '[notifyHostOnMatchedOrder] push failed',
          await response.text(),
        );
        return null;
      }
      await change.after.ref.set(
        { hostNotifiedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
    } catch (error) {
      console.warn('[notifyHostOnMatchedOrder] push error', error);
    }
    return null;
  });

/** Member uids: rich `participants` maps, legacy string `participants`, or HalfOrder `users`. */
function orderMemberIds(data) {
  const p = Array.isArray(data?.participants) ? data.participants : [];
  const ids = [];
  for (const x of p) {
    if (typeof x === 'string' && x) ids.push(x);
    else if (x && typeof x === 'object' && typeof x.userId === 'string')
      ids.push(x.userId);
  }
  if (ids.length > 0) return ids;
  return Array.isArray(data?.users)
    ? data.users.filter((x) => typeof x === 'string')
    : [];
}

/**
 * Someone removed from order participants/users — notify remaining members via Expo.
 */
exports.joinCancelledNotification = functions.firestore
  .document('orders/{orderId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const db = admin.firestore();
    const orderId = context.params.orderId;

    if (before.status !== 'cancelled' && after.status === 'cancelled') {
      if (after.cancelPushSent === true) return null;
      const members = orderMemberIds(after);
      const cancelledBy =
        typeof after.cancelledBy === 'string' && after.cancelledBy
          ? after.cancelledBy
          : null;
      const cancelReason =
        typeof after.cancelReason === 'string' ? after.cancelReason : '';

      let targets = [];
      let title = 'Order cancelled';
      let body = 'The other person cancelled this half order.';

      if (cancelReason === 'wait_timeout') {
        title = 'HalfOrder';
        body = 'No one joined your order.';
        targets = members.filter(Boolean);
      } else if (cancelledBy) {
        targets = members.filter((id) => id && id !== cancelledBy);
      } else {
        targets = members.filter(Boolean);
      }

      if (targets.length > 0) {
        await notifyUsersExpo(db, targets, title, body, {
          type: 'order_cancelled',
          orderId,
        });
      }

      try {
        await change.after.ref.update({ cancelPushSent: true });
      } catch (e) {
        console.warn(
          '[joinCancelledNotification] cancelPushSent',
          e?.message || e,
        );
      }
      return null;
    }

    const beforeMembers = orderMemberIds(before);
    const afterMembers = orderMemberIds(after);
    const leavers = beforeMembers.filter((id) => !afterMembers.includes(id));
    if (leavers.length === 0) return null;

    const notifyIds = [...new Set(afterMembers)].filter(Boolean);
    if (notifyIds.length === 0) return null;

    await notifyUsersExpo(
      db,
      notifyIds,
      'Order Update ❌',
      'Someone left the order',
      {
        type: 'order_member_left',
        orderId: context.params.orderId,
      },
    );

    return null;
  });

/**
 * Firestore `feedback/{id}` onCreate → email support (one send per new doc).
 */
exports.sendFeedbackEmail = functions.firestore
  .document('feedback/{feedbackId}')
  .onCreate(async (snap) => {
    const d = snap.data() || {};
    const userName = typeof d.userName === 'string' ? d.userName : 'Unknown';
    const message = typeof d.message === 'string' ? d.message : '';
    const textBody = `User: ${userName}\nMessage: ${message}`;
    try {
      const transport = getMailTransporter();
      await transport.sendMail({
        from: '"HalfOrder" <noreply@halforder.app>',
        to: SUPPORT_INBOX,
        subject: 'New Feedback',
        text: textBody,
      });
      console.log('[sendFeedbackEmail] success', snap.id);
    } catch (err) {
      console.error('[sendFeedbackEmail] failure', snap.id, err);
    }
    return null;
  });

/**
 * HalfOrder marketplace: when order transitions to matched, notify restaurant owner via FCM
 * and update daily liquidity analytics (matchRate + avgTimeToMatch).
 */
exports.onHalfOrderMatched = functions.firestore
  .document('orders/{orderId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const beforeStatus = typeof before.status === 'string' ? before.status : '';
    const afterStatus = typeof after.status === 'string' ? after.status : '';
    if (beforeStatus === afterStatus || afterStatus !== 'matched') return null;

    const db = admin.firestore();
    const restaurantId =
      typeof after.restaurantId === 'string' ? after.restaurantId : '';
    const mealId = typeof after.mealId === 'string' ? after.mealId : '';

    // 1) Push notification to restaurant owner (FCM)
    if (restaurantId) {
      try {
        const restaurantSnap = await db.doc(`restaurants/${restaurantId}`).get();
        if (restaurantSnap.exists) {
          const ownerId = restaurantSnap.data()?.ownerId;
          if (typeof ownerId === 'string' && ownerId) {
            const ownerSnap = await db.doc(`users/${ownerId}`).get();
            const owner = ownerSnap.exists ? ownerSnap.data() || {} : {};
            const fcmToken = owner.fcmToken;
            if (typeof fcmToken === 'string' && fcmToken) {
              let mealName = 'meal';
              if (mealId) {
                const mealSnap = await db.doc(`meals/${mealId}`).get();
                if (mealSnap.exists) {
                  const m = mealSnap.data()?.name;
                  if (typeof m === 'string' && m.trim()) mealName = m.trim();
                }
              }
              await admin.messaging().send({
                token: fcmToken,
                notification: {
                  title: 'Shared order matched',
                  body: `New shared order ready for ${mealName}`,
                },
                data: {
                  type: 'host_order_matched',
                  orderId: context.params.orderId,
                  mealId: mealId || '',
                  restaurantId: restaurantId || '',
                },
              });
            }
          }
        }
      } catch (error) {
        console.warn('[onHalfOrderMatched] owner notify failed', error);
      }
    }

    // 2) Liquidity analytics in analytics/daily/{YYYY-MM-DD}
    try {
      const now = new Date();
      const dayId = now.toISOString().slice(0, 10);
      const analyticsRef = db.doc(`analytics/daily/days/${dayId}`);
      const createdAt = after.createdAt && typeof after.createdAt.toDate === 'function'
        ? after.createdAt.toDate()
        : null;
      const matchedAt = after.matchedAt && typeof after.matchedAt.toDate === 'function'
        ? after.matchedAt.toDate()
        : now;
      const timeToMatchSec =
        createdAt && matchedAt
          ? Math.max(0, Math.round((matchedAt.getTime() - createdAt.getTime()) / 1000))
          : 0;

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(analyticsRef);
        const current = snap.exists ? snap.data() : {};
        const totalOrders =
          typeof current?.totalOrders === 'number' ? current.totalOrders : 0;
        const matchedOrders =
          typeof current?.matchedOrders === 'number' ? current.matchedOrders : 0;
        const totalTimeToMatchSec =
          typeof current?.totalTimeToMatchSec === 'number'
            ? current.totalTimeToMatchSec
            : 0;
        const nextMatched = matchedOrders + 1;
        const nextTotalTime = totalTimeToMatchSec + timeToMatchSec;
        const matchRate = totalOrders > 0 ? nextMatched / totalOrders : 0;
        const avgTimeToMatchSec =
          nextMatched > 0 ? Math.round(nextTotalTime / nextMatched) : 0;
        const activeUsers =
          typeof current?.activeUsers === 'number' ? current.activeUsers : 0;
        const liquidityScore = Math.max(
          0,
          Number((matchRate * 100 + activeUsers * 0.6 - avgTimeToMatchSec * 0.3).toFixed(1)),
        );
        tx.set(
          analyticsRef,
          {
            date: dayId,
            matchedOrders: nextMatched,
            totalTimeToMatchSec: nextTotalTime,
            matchRate,
            avgTimeToMatchSec,
            liquidityScore,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      });
    } catch (error) {
      console.warn('[onHalfOrderMatched] analytics update failed', error);
    }

    return null;
  });

function toRad(value) {
  return (value * Math.PI) / 180;
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a.lat)) *
      Math.cos(toRad(b.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

async function pickNearestOnlineDriver(db, restaurantPoint, excludeDriverIds = []) {
  const driversSnap = await db
    .collection('drivers')
    .where('isOnline', '==', true)
    .get();
  if (driversSnap.empty) return null;
  const excluded = new Set(excludeDriverIds.filter(Boolean));
  let selected = null;
  let selectedDistance = Number.POSITIVE_INFINITY;
  for (const d of driversSnap.docs) {
    if (excluded.has(d.id)) continue;
    const data = d.data() || {};
    if (typeof data.activeOrderId === 'string' && data.activeOrderId) continue;
    const loc = data.currentLocation;
    const hasLoc =
      loc &&
      typeof loc.lat === 'number' &&
      typeof loc.lng === 'number' &&
      Number.isFinite(loc.lat) &&
      Number.isFinite(loc.lng);
    const dist =
      hasLoc && restaurantPoint
        ? haversineKm(restaurantPoint, { lat: loc.lat, lng: loc.lng })
        : 999999;
    if (!selected || dist < selectedDistance) {
      selected = { id: d.id, data, location: hasLoc ? { lat: loc.lat, lng: loc.lng } : null };
      selectedDistance = dist;
    }
  }
  return selected ? { ...selected, distanceKm: selectedDistance } : null;
}

/**
 * Assign nearest online driver when order changes to matched.
 * Creates `deliveries/{id}` and notifies driver with push.
 */
exports.assignDriverOnMatchedOrder = functions.firestore
  .document('orders/{orderId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const beforeStatus = typeof before.status === 'string' ? before.status : '';
    const afterStatus = typeof after.status === 'string' ? after.status : '';
    if (beforeStatus === afterStatus || afterStatus !== 'matched') return null;
    if (typeof after.assignedDriverId === 'string' && after.assignedDriverId) return null;

    const db = admin.firestore();
    const orderId = context.params.orderId;
    const orderRef = change.after.ref;
    const restaurantId =
      typeof after.restaurantId === 'string' ? after.restaurantId : '';
    if (!restaurantId) return null;

    let restaurantPoint = null;
    try {
      const restaurantSnap = await db.doc(`restaurants/${restaurantId}`).get();
      if (restaurantSnap.exists) {
        const rd = restaurantSnap.data() || {};
        if (
          rd.locationCoords &&
          typeof rd.locationCoords.lat === 'number' &&
          typeof rd.locationCoords.lng === 'number'
        ) {
          restaurantPoint = {
            lat: rd.locationCoords.lat,
            lng: rd.locationCoords.lng,
          };
        }
      }
    } catch (e) {
      console.warn('[assignDriverOnMatchedOrder] restaurant fetch', e);
    }

    const selectedPick = await pickNearestOnlineDriver(db, restaurantPoint);
    const selected = selectedPick;
    if (!selected) return null;

    const deliveryRef = db.collection('deliveries').doc();
    const eta = Number.isFinite(selected.distanceKm)
      ? Math.max(8, Math.round(selected.distanceKm * 4))
      : 15;
    await db.runTransaction(async (tx) => {
      const orderLive = await tx.get(orderRef);
      if (!orderLive.exists) return;
      const orderData = orderLive.data() || {};
      if (typeof orderData.assignedDriverId === 'string' && orderData.assignedDriverId) return;
      tx.set(deliveryRef, {
        orderId,
        driverId: selected.id,
        status: 'assigned',
        eta,
        driverLocation: selected.location,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(
        db.doc(`drivers/${selected.id}`),
        {
          activeOrderId: orderId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      tx.set(
        orderRef,
        {
          assignedDriverId: selected.id,
          deliveryId: deliveryRef.id,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });

    const driverToken =
      selected.data?.fcmToken ||
      selected.data?.expoPushToken ||
      selected.data?.pushToken ||
      null;
    if (typeof driverToken === 'string' && driverToken) {
      try {
        await admin.messaging().send({
          token: driverToken,
          notification: {
            title: 'New delivery request',
            body: 'A matched order is ready for pickup.',
          },
          data: {
            type: 'driver_delivery_request',
            orderId,
            deliveryId: deliveryRef.id,
          },
        });
      } catch (e) {
        console.warn('[assignDriverOnMatchedOrder] driver notify', e);
      }
    }
    return null;
  });

/**
 * Fallback dispatch: if a driver rejects a delivery request, auto-assign next nearest driver.
 */
exports.reassignDriverOnRejectedDelivery = functions.firestore
  .document('deliveries/{deliveryId}')
  .onUpdate(async (change) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const beforeStatus = typeof before.status === 'string' ? before.status : '';
    const afterStatus = typeof after.status === 'string' ? after.status : '';
    if (beforeStatus === afterStatus || afterStatus !== 'rejected') return null;
    const orderId = typeof after.orderId === 'string' ? after.orderId : '';
    const oldDriverId = typeof after.driverId === 'string' ? after.driverId : '';
    if (!orderId) return null;

    const db = admin.firestore();
    const orderRef = db.doc(`orders/${orderId}`);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return null;
    const order = orderSnap.data() || {};
    const restaurantId = typeof order.restaurantId === 'string' ? order.restaurantId : '';
    if (!restaurantId) return null;
    const restaurantSnap = await db.doc(`restaurants/${restaurantId}`).get();
    const rd = restaurantSnap.exists ? restaurantSnap.data() || {} : {};
    const restaurantPoint =
      rd.locationCoords &&
      typeof rd.locationCoords.lat === 'number' &&
      typeof rd.locationCoords.lng === 'number'
        ? { lat: rd.locationCoords.lat, lng: rd.locationCoords.lng }
        : null;
    const selected = await pickNearestOnlineDriver(db, restaurantPoint, [oldDriverId]);
    if (!selected) return null;

    const nextDeliveryRef = db.collection('deliveries').doc();
    await db.runTransaction(async (tx) => {
      const liveOrder = await tx.get(orderRef);
      if (!liveOrder.exists) return;
      const live = liveOrder.data() || {};
      if (live.status !== 'matched') return;
      tx.set(nextDeliveryRef, {
        orderId,
        driverId: selected.id,
        status: 'assigned',
        eta: Number.isFinite(selected.distanceKm) ? Math.max(8, Math.round(selected.distanceKm * 4)) : 15,
        driverLocation: selected.location,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(
        db.doc(`drivers/${selected.id}`),
        { activeOrderId: orderId, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
      tx.set(
        orderRef,
        { assignedDriverId: selected.id, deliveryId: nextDeliveryRef.id, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
    });
    return null;
  });

exports.createPaymentIntent = functions.https.onCall(async (data, context) => {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new functions.https.HttpsError('failed-precondition', 'Stripe is not configured.');
  }
  const orderId = typeof data?.orderId === 'string' ? data.orderId : '';
  if (!orderId) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid order.');
  }
  const db = admin.firestore();
  const orderRef = db.doc(`orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Order not found.');
  }
  const order = orderSnap.data() || {};
  const participants = Array.isArray(order.users)
    ? order.users.filter((x) => typeof x === 'string')
    : [];
  const canPay =
    participants.includes(uid) ||
    order.createdBy === uid ||
    order.userId === uid ||
    order.hostId === uid;
  if (!canPay) {
    throw new functions.https.HttpsError('permission-denied', 'You are not part of this order.');
  }
  const restaurantId = typeof order.restaurantId === 'string' ? order.restaurantId : '';
  const mealId = typeof order.mealId === 'string' ? order.mealId : '';
  if (!restaurantId || !mealId) {
    throw new functions.https.HttpsError('failed-precondition', 'Order is missing payment details.');
  }
  const [restaurantSnap, mealSnap] = await Promise.all([
    db.doc(`restaurants/${restaurantId}`).get(),
    db.doc(`meals/${mealId}`).get(),
  ]);
  if (!restaurantSnap.exists || !mealSnap.exists) {
    throw new functions.https.HttpsError('failed-precondition', 'Restaurant or meal is unavailable.');
  }
  const restaurant = restaurantSnap.data() || {};
  const meal = mealSnap.data() || {};
  const mealName = typeof meal.name === 'string' ? meal.name : 'Shared meal';
  const stripeAccountId =
    typeof restaurant.stripeAccountId === 'string' ? restaurant.stripeAccountId : '';
  const chargesEnabled = restaurant.chargesEnabled === true;
  const payoutsEnabled = restaurant.payoutsEnabled === true;
  if (!stripeAccountId || !chargesEnabled || !payoutsEnabled) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Restaurant payouts are not enabled.',
    );
  }
  const clientSubtotal =
    typeof data?.amountSubtotal === 'number' && Number.isFinite(data.amountSubtotal)
      ? Math.max(0, data.amountSubtotal)
      : 0;
  const mealSubtotal =
    typeof meal.sharedPrice === 'number' && Number.isFinite(meal.sharedPrice)
      ? Math.max(0, meal.sharedPrice)
      : 0;
  const amountSubtotal = clientSubtotal > 0 ? clientSubtotal : mealSubtotal;
  if (amountSubtotal <= 0) {
    throw new functions.https.HttpsError('failed-precondition', 'Invalid subtotal.');
  }
  const hstAmount = Number((amountSubtotal * 0.13).toFixed(2));
  const totalAmount = Number((amountSubtotal + hstAmount).toFixed(2));
  const platformFee = Number((amountSubtotal * 0.07).toFixed(2));
  const restaurantAmount = Number((amountSubtotal - platformFee).toFixed(2));
  const amount = Math.round(totalAmount * 100);
  const platformFeeAmount = Math.round(platformFee * 100);

  const paymentRef = db.collection('payments').doc();
  const intent = await stripe.paymentIntents.create({
    amount,
    currency: 'cad',
    transfer_data: {
      destination: stripeAccountId,
    },
    application_fee_amount: platformFeeAmount,
    metadata: {
      orderId,
      userId: uid,
      paymentId: paymentRef.id,
      restaurantId,
      stripeAccountId,
    },
    automatic_payment_methods: { enabled: true },
  });

  await paymentRef.set({
    orderId,
    restaurantId,
    userId: uid,
    amountSubtotal,
    subtotal: amountSubtotal,
    hstAmount,
    hst: hstAmount,
    totalAmount,
    total: totalAmount,
    platformFee,
    restaurantAmount,
    currency: 'cad',
    mealName,
    status: 'pending',
    stripePaymentIntentId: intent.id,
    payoutAvailableAt: admin.firestore.Timestamp.fromMillis(
      Date.now() + 2 * 60 * 60 * 1000,
    ),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
    paymentId: paymentRef.id,
    amountSubtotal,
    hstAmount,
    totalAmount,
    platformFee,
    restaurantAmount,
    currency: 'cad',
  };
});

exports.createConnectedAccount = functions.https.onCall(async (data, context) => {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new functions.https.HttpsError('failed-precondition', 'Stripe is not configured.');
  }
  const restaurantId = typeof data?.restaurantId === 'string' ? data.restaurantId : '';
  if (!restaurantId) {
    throw new functions.https.HttpsError('invalid-argument', 'restaurantId required.');
  }
  const db = admin.firestore();
  const restaurantRef = db.doc(`restaurants/${restaurantId}`);
  const restaurantSnap = await restaurantRef.get();
  if (!restaurantSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Restaurant not found.');
  }
  const restaurant = restaurantSnap.data() || {};
  if (restaurant.ownerId !== uid) {
    throw new functions.https.HttpsError('permission-denied', 'Only owner can connect Stripe.');
  }
  if (typeof restaurant.stripeAccountId === 'string' && restaurant.stripeAccountId) {
    return { accountId: restaurant.stripeAccountId };
  }
  const account = await stripe.accounts.create({
    type: 'express',
    country: 'CA',
    default_currency: 'cad',
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      restaurantId,
      ownerId: uid,
    },
  });
  await restaurantRef.set(
    {
      stripeAccountId: account.id,
      chargesEnabled: false,
      payoutsEnabled: false,
      stripeDetailsSubmitted: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { accountId: account.id };
});

exports.createAccountLink = functions.https.onCall(async (data, context) => {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new functions.https.HttpsError('failed-precondition', 'Stripe is not configured.');
  }
  const restaurantId = typeof data?.restaurantId === 'string' ? data.restaurantId : '';
  if (!restaurantId) {
    throw new functions.https.HttpsError('invalid-argument', 'restaurantId required.');
  }
  const db = admin.firestore();
  const restaurantSnap = await db.doc(`restaurants/${restaurantId}`).get();
  if (!restaurantSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Restaurant not found.');
  }
  const restaurant = restaurantSnap.data() || {};
  if (restaurant.ownerId !== uid) {
    throw new functions.https.HttpsError('permission-denied', 'Only owner can manage Stripe.');
  }
  const stripeAccountId =
    typeof restaurant.stripeAccountId === 'string' ? restaurant.stripeAccountId : '';
  if (!stripeAccountId) {
    throw new functions.https.HttpsError('failed-precondition', 'Connect account not created.');
  }
  const appUrl = process.env.PUBLIC_APP_URL || 'https://halforder.app';
  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${appUrl}/host/stripe-refresh`,
    return_url: `${appUrl}/host/stripe-complete`,
    type: 'account_onboarding',
  });
  return { url: accountLink.url };
});

exports.refreshConnectedAccountStatus = functions.https.onCall(async (data, context) => {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }
  const restaurantId = typeof data?.restaurantId === 'string' ? data.restaurantId : '';
  if (!restaurantId) {
    throw new functions.https.HttpsError('invalid-argument', 'restaurantId required.');
  }
  const db = admin.firestore();
  const restaurantRef = db.doc(`restaurants/${restaurantId}`);
  const restaurantSnap = await restaurantRef.get();
  if (!restaurantSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Restaurant not found.');
  }
  const restaurant = restaurantSnap.data() || {};
  if (restaurant.ownerId !== uid) {
    throw new functions.https.HttpsError('permission-denied', 'Only owner can manage Stripe.');
  }
  const stripeAccountId =
    typeof restaurant.stripeAccountId === 'string' ? restaurant.stripeAccountId : '';
  if (!stripeAccountId) {
    throw new functions.https.HttpsError('failed-precondition', 'Connect account missing.');
  }
  const account = await stripe.accounts.retrieve(stripeAccountId);
  const chargesEnabled = account.charges_enabled === true;
  const payoutsEnabled = account.payouts_enabled === true;
  const detailsSubmitted = account.details_submitted === true;
  await restaurantRef.set(
    {
      chargesEnabled,
      payoutsEnabled,
      stripeDetailsSubmitted: detailsSubmitted,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { chargesEnabled, payoutsEnabled, detailsSubmitted };
});

exports.finalizePayment = functions.https.onCall(async (data, context) => {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new functions.https.HttpsError('failed-precondition', 'Stripe is not configured.');
  }
  const orderId = typeof data?.orderId === 'string' ? data.orderId : '';
  const paymentId = typeof data?.paymentId === 'string' ? data.paymentId : '';
  const paymentIntentId = typeof data?.paymentIntentId === 'string' ? data.paymentIntentId : '';
  if (!orderId || !paymentId || !paymentIntentId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing payment metadata.');
  }

  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (intent.status !== 'succeeded') {
    throw new functions.https.HttpsError('failed-precondition', 'Payment not completed.');
  }

  const db = admin.firestore();
  const paymentRef = db.doc(`payments/${paymentId}`);
  const orderRef = db.doc(`orders/${orderId}`);

  await db.runTransaction(async (tx) => {
    const paymentSnap = await tx.get(paymentRef);
    const payment = paymentSnap.exists ? paymentSnap.data() || {} : {};
    if (payment.userId && payment.userId !== uid) {
      throw new functions.https.HttpsError('permission-denied', 'Payment owner mismatch.');
    }
    tx.set(
      paymentRef,
      {
        status: 'paid',
        stripePaymentIntentId: paymentIntentId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    tx.set(
      orderRef,
      {
        status: 'preparing',
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        paymentId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  return { success: true, paymentId };
});

exports.refundPayment = functions.https.onCall(async (data, context) => {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new functions.https.HttpsError('failed-precondition', 'Stripe is not configured.');
  }
  const paymentId = typeof data?.paymentId === 'string' ? data.paymentId : '';
  if (!paymentId) {
    throw new functions.https.HttpsError('invalid-argument', 'paymentId is required.');
  }
  const db = admin.firestore();
  const paymentRef = db.doc(`payments/${paymentId}`);
  const paymentSnap = await paymentRef.get();
  if (!paymentSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Payment not found.');
  }
  const payment = paymentSnap.data() || {};
  if (payment.userId !== uid) {
    throw new functions.https.HttpsError('permission-denied', 'You do not own this payment.');
  }
  if (payment.status === 'refunded') {
    return { success: true, alreadyRefunded: true };
  }
  const paymentIntentId =
    typeof payment.stripePaymentIntentId === 'string'
      ? payment.stripePaymentIntentId
      : '';
  if (!paymentIntentId) {
    throw new functions.https.HttpsError('failed-precondition', 'No Stripe payment intent found.');
  }

  await stripe.refunds.create({
    payment_intent: paymentIntentId,
    reason: 'requested_by_customer',
  });
  await paymentRef.set(
    {
      status: 'refunded',
      refundedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { success: true };
});

exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    res.status(500).send('Webhook secret not configured');
    return;
  }
  const signature = req.headers['stripe-signature'];
  if (!signature || typeof signature !== 'string') {
    res.status(400).send('Missing Stripe signature');
    return;
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (error) {
    console.warn('[stripeWebhook] signature failed', error?.message || error);
    res.status(400).send('Invalid signature');
    return;
  }

  const db = admin.firestore();
  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    const paymentId =
      typeof intent?.metadata?.paymentId === 'string'
        ? intent.metadata.paymentId
        : '';
    const orderId =
      typeof intent?.metadata?.orderId === 'string' ? intent.metadata.orderId : '';
    if (paymentId) {
      const paymentRef = db.doc(`payments/${paymentId}`);
      const paymentSnap = await paymentRef.get();
      const payment = paymentSnap.exists ? paymentSnap.data() || {} : {};
      const amountSubtotal =
        typeof payment.amountSubtotal === 'number'
          ? payment.amountSubtotal
          : typeof payment.subtotal === 'number'
            ? payment.subtotal
            : 0;
      const hst =
        typeof payment.hstAmount === 'number'
          ? payment.hstAmount
          : typeof payment.hst === 'number'
            ? payment.hst
            : 0;
      const total =
        typeof payment.totalAmount === 'number'
          ? payment.totalAmount
          : typeof payment.total === 'number'
            ? payment.total
          : Number((amountSubtotal + hst).toFixed(2));
      const platformFee =
        typeof payment.platformFee === 'number' ? payment.platformFee : 0;
      const dayId = getDayId();
      const invoiceNumber = buildInvoiceNumber(dayId, paymentId);

      await paymentRef.set(
        {
          status: 'paid',
          stripePaymentIntentId: intent.id,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      await db.doc(`invoices/${paymentId}`).set(
        {
          paymentId,
          orderId: orderId || payment.orderId || '',
          userId: payment.userId || '',
          invoiceNumber,
          mealName: payment.mealName || 'Shared meal',
          subtotal: amountSubtotal,
          hst,
          total,
          currency: 'cad',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      const analyticsRef = db.doc(`analytics/daily/days/${dayId}`);
      await analyticsRef.set(
        {
          date: dayId,
          totalRevenue: admin.firestore.FieldValue.increment(total),
          platformEarnings: admin.firestore.FieldValue.increment(platformFee),
          totalOrders: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      if (orderId) {
        await db.doc(`orders/${orderId}`).set(
          {
            status: 'preparing',
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
            paymentId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object;
    const paymentId =
      typeof intent?.metadata?.paymentId === 'string'
        ? intent.metadata.paymentId
        : '';
    if (paymentId) {
      await db.doc(`payments/${paymentId}`).set(
        {
          status: 'failed',
          stripePaymentIntentId: intent.id,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  }

  res.status(200).json({ received: true });
});
