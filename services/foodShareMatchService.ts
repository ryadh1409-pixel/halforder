import { buildAdminShareCostBreakdown, normalizeFoodShareCostBreakdown } from '@/lib/foodSharePricing';
import { resolveFoodShareFulfillmentMode } from '@/lib/foodShareFulfillment';
import { FOOD_SHARE_ERRORS, foodShareErrorMessage } from '@/lib/foodShareUx';
import { mapAdminFoodShareDoc } from '@/services/adminFoodSharesService';
import { isAdminFoodShareLive } from '@/lib/adminFoodShareAvailability';
import {
  notifyAdminMatchCreated,
  notifyPairingAwaitingPayment,
  notifyShareJoinedWaiting,
} from '@/services/foodShareNotify';
import { markFoodShareInviteConverted } from '@/services/foodShareInvite';
import { hasBlockBetween } from '@/services/blocks';
import { auth, db } from '@/services/firebase';
import type {
  FoodShareCostBreakdown,
  FoodShareMatchDoc,
  FoodShareMatchLifecycle,
  FoodSharePaymentStatus,
  FoodShareUserPaymentState,
} from '@/types/foodShare';
import { USER_ROUTES } from '@/lib/navigationPaths';
import { consumePendingFoodShareInviteId } from '@/lib/foodShareInvitePending';
import { getReadableErrorMessage } from '@/utils/errorMessages';
import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

export type JoinAdminFoodShareResult =
  | { ok: true; matched: false; adminFoodShareId: string }
  | {
      ok: true;
      matched: true;
      matchId: string;
      matchChatId: string;
      partnerUid: string;
      partnerFirstName: string;
      costBreakdown: FoodShareCostBreakdown;
      adminFoodShareId: string;
    }
  | { ok: false; error: string };

function sortedPair(uidA: string, uidB: string): [string, string] {
  return uidA < uidB ? [uidA, uidB] : [uidB, uidA];
}

export function adminFoodShareMatchId(
  adminFoodShareId: string,
  uidA: string,
  uidB: string,
): string {
  const [u0, u1] = sortedPair(uidA, uidB);
  return `${adminFoodShareId}_${u0}_${u1}`;
}

async function resolveFirstName(uid: string): Promise<string> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return 'User';
  const data = snap.data();
  const display =
    typeof data.displayName === 'string' && data.displayName.trim()
      ? data.displayName.trim()
      : typeof data.firstName === 'string' && data.firstName.trim()
        ? data.firstName.trim()
        : typeof data.name === 'string' && data.name.trim()
          ? data.name.trim()
          : 'User';
  return display.split(/\s+/)[0] ?? display;
}

async function resolvePhotoUrl(uid: string): Promise<string | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const photo = snap.data().photoURL ?? snap.data().photoUrl;
  return typeof photo === 'string' && photo.trim() ? photo.trim() : null;
}

type QueueTxResult =
  | { kind: 'waiting' }
  | {
      kind: 'matched';
      partnerUid: string;
      partnerFirstName: string;
      matchId: string;
      matchChatId: string;
      isPickup: boolean;
      isReopen: boolean;
      prevLifecycle: string | null;
      foodName: string;
      restaurantName: string;
      costBreakdown: FoodShareCostBreakdown;
    };

/**
 * Swipe-right on an admin card:
 * 1) create/wait on `matchRequests` + `matchQueues`
 * 2) when a second user joins the same card → match + chat
 *
 * Pairing capacity is exactly 2 users per match. A card stays open for new pairs
 * after prior matches complete/cancel. Duplicate joins from the same user who is
 * already MATCHED on this card are rejected with alreadyMatched (not "full").
 */
export async function joinAdminFoodShare(
  adminFoodShareId: string,
): Promise<JoinAdminFoodShareResult> {
  const uid = auth.currentUser?.uid;
  if (!uid) return { ok: false, error: 'Please sign in to join.' };

  const shareRef = doc(db, 'adminFoodShares', adminFoodShareId);
  const queueRef = doc(db, 'matchQueues', adminFoodShareId);
  const requestRef = doc(db, 'matchRequests', `${adminFoodShareId}_${uid}`);
  const myFirstName = await resolveFirstName(uid);
  // Pre-fetch own photo before the transaction so it's available inside the
  // transaction callback (tx.get() calls must all precede tx.set() calls).
  let myPhoto: string | null = null;
  try {
    myPhoto = await resolvePhotoUrl(uid);
  } catch {
    myPhoto = null;
  }
  const requestPath = `matchRequests/${adminFoodShareId}_${uid}`;

  console.log('[SHARE SWIPE]', {
    adminFoodShareId,
    uid,
    requestPath,
  });

  const queuePreview = await getDoc(queueRef);
  const waitingPreview =
    queuePreview.exists() &&
    typeof queuePreview.data()?.waitingUserId === 'string'
      ? (queuePreview.data()?.waitingUserId as string)
      : null;
  const previewStatus =
    typeof queuePreview.data()?.marketplaceStatus === 'string'
      ? String(queuePreview.data()?.marketplaceStatus)
      : '';
  const previewMatchId =
    typeof queuePreview.data()?.activeMatchId === 'string'
      ? String(queuePreview.data()?.activeMatchId).trim()
      : '';
  console.log('[SHARE FILTER]', {
    adminFoodShareId,
    waitingUserId: waitingPreview,
    selfIsWaiting: waitingPreview === uid,
    marketplaceStatus: previewStatus,
  });
  if (
    previewStatus === 'matched' ||
    previewStatus === 'ready' ||
    (previewMatchId.length > 0 && !waitingPreview)
  ) {
    return {
      ok: false,
      error:
        previewStatus === 'ready'
          ? 'This share is ready for the restaurant.'
          : 'This share is already matched.',
    };
  }
  if (waitingPreview && waitingPreview !== uid) {
    if (await hasBlockBetween(uid, waitingPreview)) {
      console.log('[MATCH FAILURE]', {
        reason: 'blocked',
        uid,
        waitingPreview,
      });
      return { ok: false, error: 'You cannot match with this user.' };
    }
  }

  let txResult: QueueTxResult;
  try {
    console.log('[MATCH START]', {
      adminFoodShareId,
      uid,
      waitingPreview,
    });
    txResult = await runTransaction(db, async (tx) => {
      console.log('[MATCH TRANSACTION]', {
        phase: 'begin',
        adminFoodShareId,
        uid,
      });
      const shareSnap = await tx.get(shareRef);
      if (!shareSnap.exists()) {
        throw new Error('This meal share is no longer available.');
      }
      const share = shareSnap.data() as Record<string, unknown>;
      if (share.active !== true) {
        throw new Error('This meal share is not active.');
      }
      if (
        !isAdminFoodShareLive(
          mapAdminFoodShareDoc(adminFoodShareId, share),
          Date.now(),
        )
      ) {
        throw new Error('This meal share is outside its availability window.');
      }

      const queueSnap = await tx.get(queueRef);
      const queueData = queueSnap.exists()
        ? (queueSnap.data() as Record<string, unknown>)
        : {};
      const queueMarket =
        typeof queueData.marketplaceStatus === 'string'
          ? queueData.marketplaceStatus
          : '';
      const queueActiveMatch =
        typeof queueData.activeMatchId === 'string'
          ? queueData.activeMatchId.trim()
          : '';
      if (
        queueMarket === 'matched' ||
        queueMarket === 'ready' ||
        (queueActiveMatch.length > 0 && !queueData.waitingUserId)
      ) {
        throw new Error(
          queueMarket === 'ready'
            ? 'This share is ready for the restaurant.'
            : 'This share is already matched.',
        );
      }
      const waitingUserId =
        typeof queueData.waitingUserId === 'string'
          ? queueData.waitingUserId
          : null;
      const waitingFirstName =
        typeof queueData.waitingUserFirstName === 'string' &&
        queueData.waitingUserFirstName.trim()
          ? queueData.waitingUserFirstName.trim()
          : 'Partner';

      const existingReq = await tx.get(requestRef);
      console.log('[MATCH TRANSACTION]', {
        phase: 'read',
        path: requestPath,
        exists: existingReq.exists(),
        waitingUserId,
        authUid: uid,
      });

      if (existingReq.exists()) {
        const status = String(existingReq.data()?.status ?? '').toUpperCase();

        if (status === 'MATCHED') {
          // Allow re-join if the previous match reached a terminal state
          // (completed, delivered, or cancelled). Block only while still active.
          const prevMatchId =
            typeof existingReq.data()?.matchId === 'string'
              ? (existingReq.data()?.matchId as string).trim()
              : '';
          if (prevMatchId) {
            const prevMatchSnap = await tx.get(doc(db, 'matches', prevMatchId));
            const prevLifecycle =
              typeof prevMatchSnap.data()?.lifecycle === 'string'
                ? String(prevMatchSnap.data()?.lifecycle).toUpperCase()
                : '';
            const isTerminal =
              !prevMatchSnap.exists() ||
              prevLifecycle === 'COMPLETED' ||
              prevLifecycle === 'DELIVERED' ||
              prevLifecycle === 'CANCELLED';
            if (!isTerminal) {
              throw new Error(FOOD_SHARE_ERRORS.alreadyMatched);
            }
            // Terminal — fall through to allow re-join
          } else {
            // No matchId stored — treat as still active to be safe
            throw new Error(FOOD_SHARE_ERRORS.alreadyMatched);
          }
        }

        // Stale WAITING must not block pairing when someone else is already in the queue.
        if (status === 'WAITING' && (!waitingUserId || waitingUserId === uid)) {
          if (!waitingUserId) {
            tx.set(
              queueRef,
              {
                adminFoodShareId,
                waitingUserId: uid,
                waitingUserFirstName: myFirstName,
                waitingSince: serverTimestamp(),
                marketplaceStatus: 'waiting_for_member',
                activeMatchId: null,
                updatedAt: serverTimestamp(),
              },
              { merge: true },
            );
          }
          console.log('[SHARE CREATE]', {
            kind: 'reclaim_waiting',
            adminFoodShareId,
            uid,
          });
          return { kind: 'waiting' as const };
        }
        // status === WAITING && waitingUserId === other user → fall through and match.
      }

      if (!waitingUserId) {
        tx.set(
          queueRef,
          {
            adminFoodShareId,
            waitingUserId: uid,
            waitingUserFirstName: myFirstName,
            waitingSince: serverTimestamp(),
            marketplaceStatus: 'waiting_for_member',
            activeMatchId: null,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        tx.set(requestRef, {
          adminFoodShareId,
          userId: uid,
          userFirstName: myFirstName,
          status: 'WAITING',
          lifecycle: 'WAITING_FOR_PARTNER',
          matchId: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        console.log('[SHARE CREATE]', {
          kind: 'first_seat',
          path: requestPath,
          uid,
          status: 'WAITING',
        });
        return { kind: 'waiting' as const };
      }

      if (waitingUserId === uid) {
        return { kind: 'waiting' as const };
      }

      const partnerRequestRef = doc(
        db,
        'matchRequests',
        `${adminFoodShareId}_${waitingUserId}`,
      );
      // Do NOT tx.get(partnerRequestRef): rules deny reading another user's request.
      // Create/update partner MATCHED via set(merge) — allowed by partner match rules.

      const [u0, u1] = sortedPair(waitingUserId, uid);
      const matchId = adminFoodShareMatchId(adminFoodShareId, u0, u1);
      const matchRef = doc(db, 'matches', matchId);

      // CRITICAL: read matchRef BEFORE any tx writes (Firestore transaction rule).
      // By reading here we also learn whether this is a new match or a re-order,
      // which lets us write the match doc atomically with both matchRequests.
      // Previously the match doc was written OUTSIDE the transaction, meaning a
      // failure after commit left both matchRequests MATCHED but no match doc —
      // permanent inconsistent state that caused "no-match" on the Orders Hub.
      const existingMatchSnap = await tx.get(matchRef);

      // Derive share fields needed for the match doc.
      // shareSnap was already read via tx.get(shareRef) at the top of this callback.
      const shareRaw = shareSnap.data() as Record<string, unknown>;
      const fulfillmentMode = resolveFoodShareFulfillmentMode(shareRaw);
      const isPickup = fulfillmentMode === 'pickup';
      const shareTyped = mapAdminFoodShareDoc(adminFoodShareId, shareRaw);
      const costBreakdown = buildAdminShareCostBreakdown(
        shareTyped.originalPrice,
        shareTyped.sharedPrice,
        shareTyped.deliveryShare,
        { fulfillmentMode, promotionBadges: shareTyped.promotionBadges, shareRaw },
      );
      /** Waiting user created the share seat → pickup host. */
      const pickupHostUid = waitingUserId;
      const pickupJoinerUid = uid;
      const nameA = u0 === uid ? myFirstName : waitingFirstName;
      const nameB = u1 === uid ? myFirstName : waitingFirstName;
      const photoA = u0 === uid ? myPhoto : null;
      const photoB = u1 === uid ? myPhoto : null;
      // Generate a stable, collision-resistant chat room ID unique per order instance.
      const matchChatId = doc(collection(db, 'matchChats')).id;
      const prevLifecycle: string | null = existingMatchSnap.exists()
        ? (typeof existingMatchSnap.data()?.lifecycle === 'string'
            ? String(existingMatchSnap.data()?.lifecycle)
            : null)
        : null;

      // Write queue + both matchRequests.
      tx.update(queueRef, {
        waitingUserId: null,
        waitingUserFirstName: null,
        waitingSince: null,
        activeMatchId: matchId,
        marketplaceStatus: 'matched',
        updatedAt: serverTimestamp(),
      });
      tx.set(
        partnerRequestRef,
        {
          adminFoodShareId,
          userId: waitingUserId,
          userFirstName: waitingFirstName,
          status: 'MATCHED',
          lifecycle: 'WAITING_FOR_PAYMENT',
          matchId,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      tx.set(requestRef, {
        adminFoodShareId,
        userId: uid,
        userFirstName: myFirstName,
        status: 'MATCHED',
        lifecycle: 'WAITING_FOR_PAYMENT',
        matchId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Write match doc inside the same transaction — now atomic with matchRequests.
      if (!existingMatchSnap.exists()) {
        tx.set(matchRef, {
          adminFoodShareId,
          foodShareId: adminFoodShareId,
          users: [u0, u1],
          userA: { uid: u0, firstName: nameA, photoUrl: photoA },
          userB: { uid: u1, firstName: nameB, photoUrl: photoB },
          foodName: shareTyped.foodName,
          restaurantName: shareTyped.restaurantName,
          foodImageUrl: shareTyped.image,
          status: 'pending_payment',
          lifecycle: 'WAITING_FOR_PAYMENT',
          paymentStatus: 'pending',
          userPayments: isPickup
            ? { [pickupHostUid]: { paymentStatus: 'NOT_REQUIRED', role: 'pickup_host' } }
            : {},
          hostUserId: waitingUserId,
          fulfillmentMode,
          pickupHostUid: isPickup ? pickupHostUid : null,
          pickupJoinerUid: isPickup ? pickupJoinerUid : null,
          pickupReimbursementStatus: isPickup ? 'HELD' : 'NONE',
          orderStatus: null,
          deliveryStatus: null,
          costBreakdown,
          matchChatId,
          matchSource: 'admin_food_share_swipe',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        // Re-order: match doc exists from a previous completed/delivered order.
        // Reset to a fresh state for the new order so the chat screen starts clean.
        // isFoodShareMatchReopenUpdate allows this only when lifecycle is terminal.
        tx.set(matchRef, {
          matchChatId,
          status: 'pending_payment',
          lifecycle: 'WAITING_FOR_PAYMENT',
          userPayments: isPickup
            ? { [pickupHostUid]: { paymentStatus: 'NOT_REQUIRED', role: 'pickup_host' } }
            : {},
          paymentStatus: 'pending',
          orderStatus: null,
          deliveryStatus: null,
          // Clear the old orderId so confirmFoodSharePaymentCore does not return
          // a stale orderId that makes the client call ensureFoodShareDispatchOrder
          // before both users have paid.
          orderId: null,
          completedAt: null,
          deliveredAt: null,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }

      console.log('[MATCH TRANSACTION]', {
        phase: 'second_seat',
        matchId,
        matchChatId,
        partnerUid: waitingUserId,
        uid,
        isReopen: existingMatchSnap.exists(),
        prevLifecycle,
      });

      return {
        kind: 'matched' as const,
        partnerUid: waitingUserId,
        partnerFirstName: waitingFirstName,
        matchId,
        matchChatId,
        isPickup,
        isReopen: existingMatchSnap.exists(),
        prevLifecycle,
        foodName: shareTyped.foodName,
        restaurantName: shareTyped.restaurantName,
        costBreakdown,
      };
    });
  } catch (e) {
    console.log('[MATCH FAILURE]', {
      phase: 'transaction',
      adminFoodShareId,
      uid,
      error: e instanceof Error ? e.message : String(e),
      code: (e as { code?: string })?.code,
    });
    const readable = getReadableErrorMessage(e) || FOOD_SHARE_ERRORS.unableToJoin;
    return {
      ok: false,
      error: foodShareErrorMessage(readable, FOOD_SHARE_ERRORS.unableToJoin),
    };
  }

  if (txResult.kind === 'waiting') {
    console.log('[MATCH SUCCESS]', {
      kind: 'waiting_for_partner',
      adminFoodShareId,
      uid,
    });
    const shareSnap = await getDoc(shareRef);
    const foodName =
      shareSnap.exists() &&
      typeof shareSnap.data()?.foodName === 'string'
        ? (shareSnap.data()?.foodName as string)
        : 'this meal';
    void notifyShareJoinedWaiting({
      userId: uid,
      foodName,
      adminFoodShareId,
    }).then(() => {
      console.log('[LISTENER UPDATE]', {
        step: 'waiting_inbox_notification_sent',
        adminFoodShareId,
        uid,
        deepLink: USER_ROUTES.foodShareWaiting(adminFoodShareId),
      });
    });
    return { ok: true, matched: false, adminFoodShareId };
  }

  try {
  // All share data, match doc fields, and matchChatId were computed and written
  // inside the transaction above. Extract them from txResult.
  const {
    partnerUid,
    partnerFirstName: partnerFirstNameFromQueue,
    matchId,
    matchChatId,
    isPickup,
    isReopen,
    prevLifecycle,
    foodName,
    restaurantName,
    costBreakdown,
  } = txResult;
  const [u0, u1] = sortedPair(partnerUid, uid);
  const matchPath = `matches/${matchId}`;

  // matchChats creation is non-critical: the match doc is already committed
  // atomically inside the transaction above. A chat creation failure does not
  // corrupt Firestore — users are matched and can pay; chat is best-effort.
  console.log('[MATCH POST WRITE]', {
    operation: isReopen ? 'reopen_existing_match' : 'new_match',
    path: matchPath,
    matchId,
    matchChatId,
    isReopen,
    prevLifecycle,
    uid,
  });
  try {
    await setDoc(doc(db, 'matchChats', matchChatId), {
      matchId,
      adminFoodShareId,
      foodShareId: adminFoodShareId,
      participantIds: [u0, u1],
      foodName,
      restaurantName,
      conversationType: 'partner',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    await setDoc(doc(db, 'matchChats', matchChatId, 'matchMessages', 'welcome'), {
      senderId: 'system',
      senderUid: 'system',
      senderRole: 'system',
      senderFirstName: 'HalfOrder',
      text: isPickup
        ? `You're matched for pickup: ${foodName}. Your partner pays their share in the app — the host pays the restaurant, then HalfOrder reimburses them after pickup.`
        : `You're matched to split ${foodName}. Say hi and coordinate with your partner!`,
      createdAt: serverTimestamp(),
      sentAt: serverTimestamp(),
      deliveredAt: null,
      readAt: null,
    }, { merge: false }).catch(() => undefined);
  } catch (e) {
    // Log but do not fail — match is already committed in Firestore.
    console.log('[MATCH POST WRITE FAILURE]', {
      phase: 'chat_doc',
      matchId,
      matchChatId,
      uid,
      error: e instanceof Error ? e.message : String(e),
      code: (e as { code?: string })?.code,
    });
  }

  console.log('[MATCH SUCCESS]', {
    matchId,
    adminFoodShareId,
    users: [u0, u1],
    lifecycle: 'WAITING_FOR_PAYMENT',
    matchChatId,
    path: matchPath,
    isReopen,
    prevLifecycle,
  });

  const partnerFirstName = partnerFirstNameFromQueue;

  void notifyPairingAwaitingPayment({
    recipientUid: partnerUid,
    partnerFirstName: myFirstName,
    foodName,
    matchId,
    adminFoodShareId,
  });
  void notifyPairingAwaitingPayment({
    recipientUid: uid,
    partnerFirstName,
    foodName,
    matchId,
    adminFoodShareId,
  });
  void notifyAdminMatchCreated({
    matchId,
    adminFoodShareId,
    foodName,
  });

  void markFoodShareInviteConverted({
    inviteId: consumePendingFoodShareInviteId(),
    adminFoodShareId,
    matchId,
    userA: u0,
    userB: u1,
  });

  return {
    ok: true,
    matched: true,
    matchId,
    matchChatId,
    partnerUid,
    partnerFirstName,
    costBreakdown,
    adminFoodShareId,
  };
  } catch (e) {
    console.log('[MATCH FAILURE]', {
      phase: 'post_transaction_matched',
      adminFoodShareId,
      uid,
      error: e instanceof Error ? e.message : String(e),
      code: (e as { code?: string })?.code,
    });
    const readable = getReadableErrorMessage(e) || FOOD_SHARE_ERRORS.unableToJoin;
    return {
      ok: false,
      error: foodShareErrorMessage(readable, FOOD_SHARE_ERRORS.unableToJoin),
    };
  }
}

export function mapMatchDoc(id: string, data: Record<string, unknown>): FoodShareMatchDoc {
  const users: string[] = Array.isArray(data.users)
    ? data.users.filter((x): x is string => typeof x === 'string')
    : [];
  const userA = (data.userA ?? {}) as Record<string, unknown>;
  const userB = (data.userB ?? {}) as Record<string, unknown>;
  const breakdown = (data.costBreakdown ?? {}) as Record<string, unknown>;
  const adminFoodShareId =
    typeof data.adminFoodShareId === 'string'
      ? data.adminFoodShareId
      : typeof data.foodShareId === 'string'
        ? data.foodShareId
        : '';

  const userPaymentsRaw = (data.userPayments ?? {}) as Record<string, unknown>;
  const userPayments: Record<string, FoodShareUserPaymentState> = {};
  for (const [key, val] of Object.entries(userPaymentsRaw)) {
    const row = (val ?? {}) as Record<string, unknown>;
    const ps = String(row.paymentStatus ?? 'PENDING').toUpperCase();
    userPayments[key] = {
      paymentStatus: ps as FoodSharePaymentStatus,
      stripePaymentIntentId:
        typeof row.stripePaymentIntentId === 'string'
          ? row.stripePaymentIntentId
          : undefined,
      amount: typeof row.amount === 'number' ? row.amount : undefined,
    };
  }

  const rawStatus = String(data.status ?? '').toLowerCase();
  const status =
    rawStatus === 'cancelled'
      ? 'CANCELLED'
      : rawStatus === 'matched' ||
          data.lifecycle === 'MATCHED' ||
          data.lifecycle === 'ORDER_PLACED'
        ? 'MATCHED'
        : 'pending_payment';

  return {
    id,
    adminFoodShareId,
    users: users.length === 2 ? [users[0], users[1]] : ['', ''],
    userA: {
      uid: typeof userA.uid === 'string' ? userA.uid : users[0] ?? '',
      firstName:
        typeof userA.firstName === 'string' ? userA.firstName : 'User 1',
      photoUrl:
        typeof userA.photoUrl === 'string' ? userA.photoUrl : null,
    },
    userB: {
      uid: typeof userB.uid === 'string' ? userB.uid : users[1] ?? '',
      firstName:
        typeof userB.firstName === 'string' ? userB.firstName : 'User 2',
      photoUrl:
        typeof userB.photoUrl === 'string' ? userB.photoUrl : null,
    },
    foodName: typeof data.foodName === 'string' ? data.foodName : 'Shared meal',
    restaurantName:
      typeof data.restaurantName === 'string' ? data.restaurantName : 'Restaurant',
    foodImageUrl:
      typeof data.foodImageUrl === 'string' ? data.foodImageUrl : '',
    status,
    lifecycle: (typeof data.lifecycle === 'string'
      ? data.lifecycle
      : 'WAITING_FOR_PAYMENT') as FoodShareMatchLifecycle,
    orderStatus:
      typeof data.orderStatus === 'string' ? data.orderStatus : null,
    deliveryStatus:
      typeof data.deliveryStatus === 'string' ? data.deliveryStatus : null,
    orderId: typeof data.orderId === 'string' ? data.orderId : id,
    driverId: typeof data.driverId === 'string' ? data.driverId : null,
    assignedDriverId:
      typeof data.assignedDriverId === 'string' ? data.assignedDriverId : null,
    costBreakdown: normalizeFoodShareCostBreakdown(
      breakdown,
      typeof data.adminFoodShareId === 'string' ? { adminFoodShareId: data.adminFoodShareId } : null,
    ),
    matchChatId:
      // MUST return '' when matchChatId is absent — NOT id.
      // Falling back to `id` (matchId) would connect to the wrong chat room
      // because matchId is the deterministic key reused across all orders between
      // the same two users on the same card. An empty string signals "no chat yet"
      // and the chat screen's subscription guard (if (!matchChatId)) handles it.
      typeof data.matchChatId === 'string' && data.matchChatId ? data.matchChatId : '',
    userPayments,
    createdAtMs: null,
    fulfillmentMode: resolveFoodShareFulfillmentMode(data),
    hostUserId:
      typeof data.hostUserId === 'string' ? data.hostUserId : null,
    pickupHostUid:
      typeof data.pickupHostUid === 'string' ? data.pickupHostUid : null,
    pickupJoinerUid:
      typeof data.pickupJoinerUid === 'string' ? data.pickupJoinerUid : null,
    pickupReimbursementStatus:
      data.pickupReimbursementStatus === 'HELD' ||
      data.pickupReimbursementStatus === 'RELEASED' ||
      data.pickupReimbursementStatus === 'NONE'
        ? data.pickupReimbursementStatus
        : undefined,
    pickupConfirmedAtMs:
      typeof data.pickupConfirmedAtMs === 'number'
        ? data.pickupConfirmedAtMs
        : null,
  };
}

export {
  adminCancelWaitingMember,
  blockFoodShareUser,
  cancelFoodShareMatch,
  cancelWaitingFoodShare,
  canCancelFoodShareMatch,
  hasSubmittedFoodSharePayment,
  reportFoodShareUser,
} from '@/services/foodShareSafety';

/** @deprecated Use joinAdminFoodShare */
export const joinFoodShare = joinAdminFoodShare;
