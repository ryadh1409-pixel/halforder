/**
 * Grant one-time % OFF to Swipe Delivery inviter after friend pays the same card.
 * Additive only — does not alter Food Share payment / Stripe PI creation.
 */
import * as admin from "firebase-admin";
import {writeFoodShareInbox} from "./foodShareServerNotify.js";

const SETTINGS_DOC = "swipeReferralPromotions";
const REWARD_TYPE = "swipe_referral";

type Campaign = {
  id: string;
  name: string;
  discountPercent: number;
  startAtMs: number | null;
  endAtMs: number | null;
  active: boolean;
  maxRedemptions: number | null;
  cardIds: string[];
  rewardsIssuedCount: number;
};

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function isLive(c: Campaign, now = Date.now()): boolean {
  if (!c.active) return false;
  if (c.startAtMs != null && now < c.startAtMs) return false;
  if (c.endAtMs != null && now > c.endAtMs) return false;
  return true;
}

function parseCampaign(id: string, raw: Record<string, unknown>): Campaign {
  const cardIds = Array.isArray(raw.cardIds)
    ? raw.cardIds.filter((x): x is string => typeof x === "string" && !!x.trim())
    : [];
  const discountPercent =
    typeof raw.discountPercent === "number" && Number.isFinite(raw.discountPercent)
      ? Math.max(1, Math.min(100, Math.round(raw.discountPercent)))
      : 50;
  return {
    id,
    name: typeof raw.name === "string" ? raw.name.trim() : "Referral Reward",
    discountPercent,
    startAtMs: typeof raw.startAtMs === "number" ? raw.startAtMs : null,
    endAtMs: typeof raw.endAtMs === "number" ? raw.endAtMs : null,
    active: raw.active === true,
    maxRedemptions:
      typeof raw.maxRedemptions === "number" && Number.isFinite(raw.maxRedemptions)
        ? Math.max(0, Math.floor(raw.maxRedemptions))
        : null,
    cardIds,
    rewardsIssuedCount:
      typeof raw.rewardsIssuedCount === "number" &&
      Number.isFinite(raw.rewardsIssuedCount)
        ? Math.max(0, Math.floor(raw.rewardsIssuedCount))
        : 0,
  };
}

function makeRewardCode(inviteId: string): string {
  const tail = inviteId.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  return `SRR${tail || Date.now().toString(36).toUpperCase()}`;
}

/**
 * After both Food Share seats are PAID, unlock inviter reward when a tagged invite matches.
 */
export async function tryGrantSwipeReferralReward(input: {
  matchId: string;
  match: Record<string, unknown>;
}): Promise<void> {
  const matchId = input.matchId.trim();
  if (!matchId) return;

  const match = input.match;
  if (match.status === "CANCELLED" || match.lifecycle === "CANCELLED") {
    return;
  }

  const adminFoodShareId =
    typeof match.adminFoodShareId === "string"
      ? match.adminFoodShareId.trim()
      : "";
  if (!adminFoodShareId) return;

  const users = Array.isArray(match.users)
    ? match.users.filter((x): x is string => typeof x === "string" && !!x.trim())
    : [];
  if (users.length !== 2) return;

  const db = admin.firestore();
  const inviteSnap = await db
    .collection("foodShareInvites")
    .where("adminFoodShareId", "==", adminFoodShareId)
    .get();

  type InviteHit = {
    id: string;
    senderUid: string;
    openedByUid: string;
    referralPromoId: string;
    convertedMatchId: string | null;
    rewardIssuedAt: unknown;
  };

  const hits: InviteHit[] = [];
  for (const d of inviteSnap.docs) {
    const row = d.data() as Record<string, unknown>;
    const senderUid =
      typeof row.senderUid === "string" ? row.senderUid.trim() : "";
    const openedByUid =
      typeof row.openedByUid === "string" ? row.openedByUid.trim() : "";
    const referralPromoId =
      typeof row.referralPromoId === "string" ? row.referralPromoId.trim() : "";
    if (!senderUid || !openedByUid || !referralPromoId) continue;
    if (senderUid === openedByUid) continue;
    if (!users.includes(senderUid) || !users.includes(openedByUid)) continue;
    const convertedMatchId =
      typeof row.convertedMatchId === "string"
        ? row.convertedMatchId.trim()
        : null;
    if (convertedMatchId && convertedMatchId !== matchId) continue;
    hits.push({
      id: d.id,
      senderUid,
      openedByUid,
      referralPromoId,
      convertedMatchId,
      rewardIssuedAt: row.rewardIssuedAt ?? null,
    });
  }

  if (hits.length === 0) return;

  // Prefer invite already converted to this match; else first valid tagged invite.
  const invite =
    hits.find((h) => h.convertedMatchId === matchId) ??
    hits.find((h) => h.rewardIssuedAt == null) ??
    hits[0];
  if (!invite || invite.rewardIssuedAt != null) return;

  const settingsSnap = await db.doc(`platformSettings/${SETTINGS_DOC}`).get();
  const promotions = asRecord(settingsSnap.data()?.promotions);
  const campaignRaw = asRecord(promotions[invite.referralPromoId]);
  if (!campaignRaw || Object.keys(campaignRaw).length === 0) return;

  const campaign = parseCampaign(invite.referralPromoId, campaignRaw);
  if (!isLive(campaign)) return;
  if (!campaign.cardIds.includes(adminFoodShareId)) return;
  if (
    campaign.maxRedemptions != null &&
    campaign.rewardsIssuedCount >= campaign.maxRedemptions
  ) {
    return;
  }

  const inviterUid = invite.senderUid;
  const friendUid = invite.openedByUid;

  // Prevent duplicate rewards for the same invited account under this campaign.
  const priorCampaign = await db
    .collection("promoCodes")
    .where("swipeReferralPromoId", "==", campaign.id)
    .get();
  for (const d of priorCampaign.docs) {
    const row = d.data() ?? {};
    if (row.invitedUid === friendUid) return;
    if (row.foodShareInviteId === invite.id) return;
  }

  const rewardDocId = `srr_${invite.id}`;
  const code = makeRewardCode(invite.id);
  const percent = campaign.discountPercent;
  const nowMs = Date.now();

  const rewardPayload = {
    id: rewardDocId,
    type: REWARD_TYPE,
    status: "available" as const,
    code,
    name: campaign.name,
    discountType: "percent" as const,
    discountValue: percent,
    promoId: rewardDocId,
    swipeReferralPromoId: campaign.id,
    foodShareInviteId: invite.id,
    matchId,
    adminFoodShareId,
    invitedUid: friendUid,
    unlockAcknowledged: false,
    claimedAtMs: nowMs,
    createdAtMs: nowMs,
    expiresAtMs: null as null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  try {
    await db.runTransaction(async (tx) => {
      const inviteRef = db.doc(`foodShareInvites/${invite.id}`);
      const promoRef = db.doc(`promoCodes/${rewardDocId}`);
      const rewardRef = db.doc(
        `users/${inviterUid}/emoRewards/${rewardDocId}`,
      );
      const settingsRef = db.doc(`platformSettings/${SETTINGS_DOC}`);

      const [inviteFresh, promoFresh, settingsFresh] = await Promise.all([
        tx.get(inviteRef),
        tx.get(promoRef),
        tx.get(settingsRef),
      ]);

      if (!inviteFresh.exists) return;
      const inviteData = inviteFresh.data() ?? {};
      if (inviteData.rewardIssuedAt != null) return;
      if (promoFresh.exists) return;

      const promos = asRecord(settingsFresh.data()?.promotions);
      const camp = parseCampaign(
        campaign.id,
        asRecord(promos[campaign.id]),
      );
      if (!isLive(camp)) return;
      if (
        camp.maxRedemptions != null &&
        camp.rewardsIssuedCount >= camp.maxRedemptions
      ) {
        return;
      }

      tx.set(promoRef, {
        code,
        discountType: "percent",
        discountValue: percent,
        active: true,
        expiresAt: null,
        usageLimit: 1,
        usedCount: 0,
        restaurantIds: [],
        description: `${campaign.name} — invite reward`,
        ownerUid: inviterUid,
        invitedUid: friendUid,
        swipeReferralPromoId: campaign.id,
        foodShareInviteId: invite.id,
        matchId,
        adminFoodShareId,
        systemManaged: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      tx.set(rewardRef, rewardPayload, {merge: true});

      tx.set(
        inviteRef,
        {
          convertedAt:
            inviteData.convertedAt ??
            admin.firestore.FieldValue.serverTimestamp(),
          convertedMatchId: matchId,
          rewardIssuedAt: admin.firestore.FieldValue.serverTimestamp(),
          rewardPromoCodeId: rewardDocId,
          rewardCode: code,
        },
        {merge: true},
      );

      tx.set(
        settingsRef,
        {
          promotions: {
            ...promos,
            [campaign.id]: {
              ...asRecord(promos[campaign.id]),
              rewardsIssuedCount: camp.rewardsIssuedCount + 1,
              updatedAtMs: nowMs,
            },
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    });
  } catch (err) {
    console.error("[swipeReferralReward] grant_failed", {
      matchId,
      inviteId: invite.id,
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  await writeFoodShareInbox({
    recipientUid: inviterUid,
    type: "swipe_referral_reward_unlocked",
    title: "🎉 Reward Unlocked!",
    body: `You earned a ${percent}% discount. Redeem it on your next checkout with code ${code}.`,
    deepLink: "/wallet",
    matchId,
    adminFoodShareId,
    pushType: "swipe_referral_reward_unlocked",
    notificationId: `srr_unlock_${invite.id}`,
  });

  console.log("[swipeReferralReward] granted", {
    matchId,
    inviteId: invite.id,
    inviterUid,
    friendUid,
    code,
    percent,
  });
}

/** Mark personal swipe-referral promo redeemed after successful checkout payment. */
export async function markSwipeReferralRewardRedeemed(input: {
  uid: string;
  orderId: string;
  promoCode?: string | null;
}): Promise<void> {
  const uid = input.uid.trim();
  const orderId = input.orderId.trim();
  const code = (input.promoCode ?? "").trim().toUpperCase();
  if (!uid || !orderId || !code) return;

  const db = admin.firestore();
  const q = await db
    .collection("promoCodes")
    .where("code", "==", code)
    .limit(5)
    .get();
  if (q.empty) return;
  const promoDoc = q.docs.find((d) => {
    const data = d.data() ?? {};
    return data.ownerUid === uid && !!data.swipeReferralPromoId;
  });
  if (!promoDoc) return;
  const data = promoDoc.data() ?? {};
  if (typeof data.usedCount === "number" && data.usedCount >= 1) return;

  const rewardRef = db.doc(`users/${uid}/emoRewards/${promoDoc.id}`);

  await db.runTransaction(async (tx) => {
    const promoSnap = await tx.get(promoDoc.ref);
    if (!promoSnap.exists) return;
    const used =
      typeof promoSnap.data()?.usedCount === "number"
        ? promoSnap.data()!.usedCount
        : 0;
    if (used >= 1) return;

    tx.set(
      promoDoc.ref,
      {
        usedCount: used + 1,
        active: false,
        redeemedOrderId: orderId,
        redeemedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    const rewardSnap = await tx.get(rewardRef);
    if (rewardSnap.exists) {
      tx.set(
        rewardRef,
        {
          status: "redeemed",
          redeemedAtMs: Date.now(),
          redeemedOrderId: orderId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    }
  });
}
