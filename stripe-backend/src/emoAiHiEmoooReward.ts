/**
 * Secure one-time "Hi Emo" / "Hi emooo" Easter Egg reward.
 * Client must prove a loud shout + phrase; claim is atomic per uid.
 */
import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import type {CallableContext} from "firebase-functions/v1/https";
import {defineSecret} from "firebase-functions/params";
import OpenAI from "openai";
import {toFile} from "openai";

const openAiKeySecret = defineSecret("OPENAI_API_KEY");

/** Promo display name (exact product copy). */
export const HI_EMOOO_PROMO_NAME = "Hi emooo";
/** Normalized promo code stored on user + promoCodes. */
export const HI_EMOOO_PROMO_CODE = "HI EMOOO";
export const HI_EMOOO_PERCENT = 50;

/**
 * expo-av metering is typically -160 (silence) … 0 (max).
 * Require a very loud peak so normal speaking does not qualify.
 */
export const HI_EMOOO_SHOUT_THRESHOLD_DB = -18;

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

function requireOpenAiKey(): string {
  const key = (openAiKeySecret.value() || process.env.OPENAI_API_KEY || "").trim();
  if (!key) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "OpenAI is not configured on the server.",
    );
  }
  return key;
}

export function matchesHiEmoPhrase(raw: string): boolean {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return false;
  // hi emo / hi emooo / hey emo / high emo (common STT miss)
  return (
    /\b(hi|hey|high)\s*emo+\b/.test(cleaned) ||
    /\bhiemo+\b/.test(cleaned.replace(/\s/g, ""))
  );
}

async function ensureHiEmoooPromoDoc(
  db: admin.firestore.Firestore,
): Promise<string> {
  const id = "hi-emooo";
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

async function transcribeAudioBase64(
  audioBase64: string,
  mimeType: string,
): Promise<string> {
  const openai = new OpenAI({apiKey: requireOpenAiKey()});
  const buf = Buffer.from(audioBase64, "base64");
  if (buf.length < 200 || buf.length > 4_500_000) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Audio clip is invalid.",
    );
  }
  const ext = mimeType.includes("mp4") || mimeType.includes("m4a")
    ? "m4a"
    : mimeType.includes("webm")
      ? "webm"
      : mimeType.includes("wav")
        ? "wav"
        : "m4a";
  const file = await toFile(buf, `emo-voice.${ext}`, {
    type: mimeType || `audio/${ext}`,
  });
  const result = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "en",
  });
  return (result.text || "").trim();
}

type ClaimResult = {
  ok: boolean;
  alreadyClaimed?: boolean;
  reason?: string;
  message: string;
  transcript?: string;
  discount?: {
    code: string;
    name: string;
    discountType: "percent";
    discountValue: number;
    status: "available";
  };
};

/**
 * Claim the one-time Hi emooo 50% reward after a loud "Hi Emo" shout.
 * Accepts either a client transcript (web STT) or audioBase64 (Whisper).
 */
export const claimEmoHiEmoooReward = functions
  .runWith({secrets: ["OPENAI_API_KEY"], timeoutSeconds: 60, memory: "512MB"})
  .region("us-central1")
  .https.onCall(async (data: unknown, context: CallableContext): Promise<ClaimResult> => {
    const uid = requireAuth(context);
    const payload = asObject(data);
    const peakVolumeDb = Number(payload.peakVolumeDb);
    if (
      !Number.isFinite(peakVolumeDb) ||
      peakVolumeDb < HI_EMOOO_SHOUT_THRESHOLD_DB
    ) {
      return {
        ok: false,
        reason: "too_quiet",
        message:
          "That was too quiet — shout “Hi Emo” nice and loud to wake me up!",
      };
    }

    let transcript =
      typeof payload.transcript === "string" ? payload.transcript.trim() : "";
    const audioBase64 =
      typeof payload.audioBase64 === "string" ? payload.audioBase64.trim() : "";
    const mimeType =
      typeof payload.mimeType === "string" && payload.mimeType.trim()
        ? payload.mimeType.trim()
        : "audio/m4a";

    if (!transcript && audioBase64) {
      try {
        transcript = await transcribeAudioBase64(audioBase64, mimeType);
      } catch (e) {
        if (e instanceof functions.https.HttpsError) throw e;
        console.error("[claimEmoHiEmoooReward] whisper failed", e);
        throw new functions.https.HttpsError(
          "internal",
          "Could not hear that clearly — try shouting again.",
        );
      }
    }

    if (!matchesHiEmoPhrase(transcript)) {
      return {
        ok: false,
        reason: "phrase_mismatch",
        transcript,
        message:
          "I heard you, but I need a loud “Hi Emo!” to wake up. Try again!",
      };
    }

    const db = admin.firestore();
    const promoId = await ensureHiEmoooPromoDoc(db);
    const userRef = db.collection("users").doc(uid);

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const existing = snap.data() ?? {};
      if (existing.emoHiEmoooClaimed === true) {
        return {
          ok: false,
          alreadyClaimed: true,
          reason: "already_claimed",
          message:
            "You already claimed your Hi emooo gift — one shout, one gift forever!",
        } satisfies ClaimResult;
      }
      const discountStatus =
        existing?.emoHiEmoooDiscount &&
        typeof existing.emoHiEmoooDiscount === "object"
          ? (existing.emoHiEmoooDiscount as {status?: string}).status
          : null;
      if (discountStatus === "available" || discountStatus === "redeemed") {
        return {
          ok: false,
          alreadyClaimed: true,
          reason: "already_claimed",
          message:
            "You already claimed your Hi emooo gift — one shout, one gift forever!",
        } satisfies ClaimResult;
      }

      const discount = {
        code: HI_EMOOO_PROMO_CODE,
        name: HI_EMOOO_PROMO_NAME,
        promoId,
        discountType: "percent" as const,
        discountValue: HI_EMOOO_PERCENT,
        status: "available" as const,
        claimedAtMs: Date.now(),
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

      // Persist long-term memory flag under emoAiMemory/profile
      const memRef = userRef.collection("emoAiMemory").doc("profile");
      tx.set(
        memRef,
        {
          hiEmoooClaimed: true,
          updatedAtMs: Date.now(),
        },
        {merge: true},
      );

      return {
        ok: true,
        alreadyClaimed: false,
        transcript,
        message: "🎉 You woke me up! Here's your gift!",
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

/**
 * Mark the Hi emooo discount as permanently redeemed after first eligible order.
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

    const db = admin.firestore();
    const userRef = db.collection("users").doc(uid);
    const promoRef = db.collection("promoCodes").doc("hi-emooo");

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const existing = snap.data() ?? {};
      const disc = existing.emoHiEmoooDiscount as
        | {status?: string; code?: string}
        | undefined;
      if (!disc || disc.status !== "available") {
        return;
      }
      tx.set(
        userRef,
        {
          emoHiEmoooDiscount: {
            ...disc,
            status: "redeemed",
            redeemedAtMs: Date.now(),
            redeemedOrderId: orderId,
          },
          emoHiEmoooRedeemedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
      const promoSnap = await tx.get(promoRef);
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

    return {ok: true};
  });
