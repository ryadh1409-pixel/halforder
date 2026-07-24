/**
 * Secure one-time "Hi Emo" / "Hi emooo" Easter Egg reward.
 * Triggered by the exact chat phrase "Hi Emo" (case-insensitive). Claim is atomic per uid.
 */
import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import type {CallableContext} from "firebase-functions/v1/https";

/** Promo display name (exact product copy). */
export const HI_EMOOO_PROMO_NAME = "Hi emooo";
/** Normalized promo code stored on user + promoCodes. */
export const HI_EMOOO_PROMO_CODE = "HI EMOOO";
export const HI_EMOOO_PERCENT = 50;
export const HI_EMOOO_REWARD_DOC_ID = "hi-emooo";

export const HI_EMOOO_SUCCESS_REPLY =
  "🎉 You found my secret! Here's your 50% gift!";
export const HI_EMOOO_ALREADY_CLAIMED_REPLY =
  "❤️ You've already claimed your Hi emooo gift.";

function requireAuth(context: CallableContext): string {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }
  return context.auth.uid;
}

function asObject(data: unknown): Record<string, unknown> {
  return data !== null && typeof data === "object"
    ? (data as Record<string, unknown>)
    : {};
}

/** Exact chat trigger: "Hi Emo" (case-insensitive, trimmed). */
export function isHiEmoChatTrigger(raw: string): boolean {
  return raw.trim().toLowerCase() === "hi emo";
}

async function ensureHiEmoooPromoDoc(
  db: admin.firestore.Firestore,
): Promise<string> {
  const id = HI_EMOOO_REWARD_DOC_ID;
  const ref = db.collection("promoCodes").doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      code: HI_EMOOO_PROMO_CODE,
      discountType: "percent",
      discountValue: HI_EMOOO_PERCENT,
      active: true,
      expiresAt: null,
      usageLimit: null,
      usedCount: 0,
      restaurantIds: [],
      description: HI_EMOOO_PROMO_NAME,
      systemManaged: true,
      emoEasterEgg: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    await ref.set(
      {
        code: HI_EMOOO_PROMO_CODE,
        discountType: "percent",
        discountValue: HI_EMOOO_PERCENT,
        active: true,
        description: HI_EMOOO_PROMO_NAME,
        systemManaged: true,
        emoEasterEgg: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  }
  return id;
}

type ClaimResult = {
  ok: boolean;
  alreadyClaimed?: boolean;
  reason?: string;
  message: string;
  discount?: {
    code: string;
    name: string;
    discountType: "percent";
    discountValue: number;
    status: "available";
  };
};

function readStatus(raw: unknown): "available" | "redeemed" | null {
  if (!raw || typeof raw !== "object") return null;
  const status = (raw as {status?: unknown}).status;
  if (status === "available" || status === "redeemed") return status;
  return null;
}

/**
 * Claim the one-time Hi emooo 50% reward after the exact chat phrase "Hi Emo".
 */
export const claimEmoHiEmoooReward = functions
  .region("us-central1")
  .https.onCall(async (data: unknown, context: CallableContext): Promise<ClaimResult> => {
    const uid = requireAuth(context);
    const payload = asObject(data);
    const transcript =
      typeof payload.transcript === "string" ? payload.transcript.trim() : "";

    if (!isHiEmoChatTrigger(transcript)) {
      return {
        ok: false,
        reason: "phrase_mismatch",
        message: "Type “Hi Emo” in our chat to unlock my hidden gift.",
      };
    }

    const db = admin.firestore();
    const promoId = await ensureHiEmoooPromoDoc(db);
    const userRef = db.collection("users").doc(uid);
    const rewardRef = userRef.collection("emoRewards").doc(HI_EMOOO_REWARD_DOC_ID);
    const nowMs = Date.now();

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const rewardSnap = await tx.get(rewardRef);
      const existing = snap.data() ?? {};
      const userStatus = readStatus(existing.emoHiEmoooDiscount);
      const rewardStatus = readStatus(rewardSnap.data());
      const status = rewardStatus ?? userStatus;

      if (status === "available" || status === "redeemed") {
        return {
          ok: false,
          alreadyClaimed: true,
          reason: "already_claimed",
          message: HI_EMOOO_ALREADY_CLAIMED_REPLY,
        } satisfies ClaimResult;
      }

      const discount = {
        code: HI_EMOOO_PROMO_CODE,
        name: HI_EMOOO_PROMO_NAME,
        promoId,
        discountType: "percent" as const,
        discountValue: HI_EMOOO_PERCENT,
        status: "available" as const,
        claimedAtMs: nowMs,
        createdAtMs: nowMs,
        expiresAtMs: null as null,
      };

      tx.set(
        userRef,
        {
          emoHiEmoooClaimed: true,
          emoHiEmoooClaimedAt: admin.firestore.FieldValue.serverTimestamp(),
          emoHiEmoooDiscount: discount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      );

      tx.set(
        rewardRef,
        {
          id: HI_EMOOO_REWARD_DOC_ID,
          ...discount,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      );

      const memRef = userRef.collection("emoAiMemory").doc("profile");
      tx.set(
        memRef,
        {
          hiEmoooClaimed: true,
          previousGifts: [HI_EMOOO_PROMO_NAME],
          updatedAtMs: nowMs,
        },
        {merge: true},
      );

      return {
        ok: true,
        alreadyClaimed: false,
        message: HI_EMOOO_SUCCESS_REPLY,
        discount: {
          code: discount.code,
          name: discount.name,
          discountType: "percent",
          discountValue: HI_EMOOO_PERCENT,
          status: "available",
        },
      } satisfies ClaimResult;
    });

    return result;
  });

/** Mark Hi emooo as redeemed for a uid (callable + webhook). */
export async function markEmoHiEmoooRedeemed(
  uid: string,
  orderId: string,
): Promise<void> {
  const db = admin.firestore();
  const userRef = db.collection("users").doc(uid);
  const rewardRef = userRef.collection("emoRewards").doc(HI_EMOOO_REWARD_DOC_ID);
  const promoRef = db.collection("promoCodes").doc(HI_EMOOO_REWARD_DOC_ID);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const rewardSnap = await tx.get(rewardRef);
    const promoSnap = await tx.get(promoRef);
    const existing = snap.data() ?? {};
    const disc = (existing.emoHiEmoooDiscount ?? rewardSnap.data()) as
      | {status?: string}
      | undefined;
    if (!disc || disc.status !== "available") {
      return;
    }
    const redeemed = {
      ...disc,
      status: "redeemed",
      redeemedAtMs: Date.now(),
      redeemedOrderId: orderId,
    };
    tx.set(
      userRef,
      {
        emoHiEmoooDiscount: redeemed,
        emoHiEmoooRedeemedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    tx.set(
      rewardRef,
      {
        id: HI_EMOOO_REWARD_DOC_ID,
        ...redeemed,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    if (promoSnap.exists) {
      const used =
        typeof promoSnap.data()?.usedCount === "number"
          ? promoSnap.data()!.usedCount
          : 0;
      tx.set(
        promoRef,
        {
          usedCount: used + 1,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    }
  });
}

/**
 * Mark the Hi emooo discount as permanently redeemed after first successful payment.
 */
export const redeemEmoHiEmoooDiscount = functions
  .region("us-central1")
  .https.onCall(async (data: unknown, context: CallableContext) => {
    const uid = requireAuth(context);
    const payload = asObject(data);
    const orderId =
      typeof payload.orderId === "string" ? payload.orderId.trim() : "";
    if (!orderId) {
      throw new functions.https.HttpsError("invalid-argument", "orderId required");
    }
    await markEmoHiEmoooRedeemed(uid, orderId);
    return {ok: true};
  });
