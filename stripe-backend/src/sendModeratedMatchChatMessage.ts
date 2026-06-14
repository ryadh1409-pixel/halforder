import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import type {CallableContext} from "firebase-functions/v1/https";
import {defineSecret} from "firebase-functions/params";
import {writeFoodShareInbox} from "./foodShareServerNotify.js";
import {
  applyViolationStrike,
  getChatRestriction,
  guidelinesAccepted,
  isMuted,
  logModerationEvent,
  moderateMessageForDelivery,
} from "./chatModerationService.js";
import {COMMUNITY_GUIDELINES_MESSAGE} from "./chatModerationEngine.js";

const openAiKeySecret = defineSecret("OPENAI_API_KEY");

async function assertParticipant(
  uid: string,
  matchChatId: string,
): Promise<{matchId: string; partnerUid: string | null}> {
  const db = admin.firestore();
  const chatSnap = await db.doc(`matchChats/${matchChatId}`).get();
  if (!chatSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Chat not found.");
  }
  const participants = Array.isArray(chatSnap.data()?.participantIds)
    ? (chatSnap.data()?.participantIds as string[])
    : [];
  if (!participants.includes(uid)) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Not a chat participant.",
    );
  }
  const matchId =
    typeof chatSnap.data()?.matchId === "string"
      ? chatSnap.data()?.matchId
      : matchChatId;
  const partnerUid = participants.find((p) => p !== uid) ?? null;
  return {matchId, partnerUid};
}

async function assertNotBlocked(uid: string, partnerUid: string | null): Promise<void> {
  if (!partnerUid) return;
  const blockedSnap = await admin
    .firestore()
    .doc(`users/${uid}/blockedUsers/${partnerUid}`)
    .get();
  if (blockedSnap.exists) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "You cannot message this user.",
    );
  }
  const reverseSnap = await admin
    .firestore()
    .doc(`users/${partnerUid}/blockedUsers/${uid}`)
    .get();
  if (reverseSnap.exists) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Messaging is not available.",
    );
  }
}

/** Server-side moderated meal-share chat send (App Store UGC compliant). */
export const sendModeratedMatchChatMessage = functions
  .runWith({secrets: ["OPENAI_API_KEY"]})
  .region("us-central1")
  .https.onCall(async (data: unknown, context: CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Login required");
    }
    const uid = context.auth.uid;
    const payload =
      data !== null && typeof data === "object"
        ? (data as Record<string, unknown>)
        : {};
    const matchChatId =
      typeof payload.matchChatId === "string" ? payload.matchChatId.trim() : "";
    const text = typeof payload.text === "string" ? payload.text : "";
    const senderFirstName =
      typeof payload.senderFirstName === "string"
        ? payload.senderFirstName.trim()
        : "User";

    if (!matchChatId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "matchChatId is required.",
      );
    }

    if (!(await guidelinesAccepted(uid))) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "COMMUNITY_GUIDELINES_REQUIRED",
      );
    }

    const restriction = await getChatRestriction(uid);
    if (restriction.restricted) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "CHAT_TEMPORARILY_RESTRICTED",
      );
    }

    const {matchId, partnerUid} = await assertParticipant(uid, matchChatId);
    await assertNotBlocked(uid, partnerUid);

    if (await isMuted(uid, matchChatId)) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Chat is muted.",
      );
    }

    const openAiKey = openAiKeySecret.value() || process.env.OPENAI_API_KEY || "";
    const verdict = await moderateMessageForDelivery(text, openAiKey);

    if (!verdict.allowed) {
      const eventId = await logModerationEvent({
        userId: uid,
        matchChatId,
        matchId,
        textPreview: text,
        category: verdict.category,
        internalReason: verdict.internalReason,
        blocked: true,
      });
      const strike = await applyViolationStrike(uid);

      await writeFoodShareInbox({
        recipientUid: uid,
        type: "chat_message_blocked",
        title:
          strike.warningLevel === 1
            ? "Message blocked"
            : strike.warningLevel === 2
              ? "Temporary chat restriction"
              : "Account under review",
        body:
          strike.warningLevel === 1
            ? COMMUNITY_GUIDELINES_MESSAGE
            : strike.warningLevel === 2
              ? "Repeated violations — chat is temporarily restricted."
              : "Repeated violations — your account is flagged for review.",
        deepLink: `/food-share-chat/${matchId}`,
        matchId,
        pushType: "food_share_chat_blocked",
      });

      throw new functions.https.HttpsError(
        "failed-precondition",
        COMMUNITY_GUIDELINES_MESSAGE,
        {eventId, warningLevel: strike.warningLevel},
      );
    }

    const db = admin.firestore();
    const msgRef = await db
      .collection(`matchChats/${matchChatId}/matchMessages`)
      .add({
        senderId: uid,
        senderFirstName: senderFirstName.split(/\s+/)[0] ?? senderFirstName,
        text: verdict.text,
        moderationStatus: "approved",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    return {ok: true, messageId: msgRef.id};
  });

/** Record community guidelines acceptance (server timestamp). */
export const acceptCommunityGuidelines = functions
  .region("us-central1")
  .https.onCall(async (_data: unknown, context: CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Login required");
    }
    const uid = context.auth.uid;
    const path = `users/${uid}`;
    const payload = {
      chatSafety: {
        guidelinesAcceptedAt: admin.firestore.FieldValue.serverTimestamp(),
        guidelinesVersion: "2026-04",
      },
    };
    console.log("[GUIDELINES WRITE] before", {
      path,
      uid,
      payload: {chatSafety: {guidelinesVersion: "2026-04"}},
      via: "server_firestore",
    });
    try {
      await admin.firestore().doc(path).set(payload, {merge: true});
      console.log("[GUIDELINES WRITE] success", {path, uid, via: "server_firestore"});
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[GUIDELINES WRITE] failure", {
        path,
        uid,
        via: "server_firestore",
        message,
        error,
      });
      throw new functions.https.HttpsError(
        "internal",
        `Could not save acceptance: ${message}`,
      );
    }
    return {ok: true};
  });
