import * as admin from "firebase-admin";
import OpenAI from "openai";
import {
  COMMUNITY_GUIDELINES_MESSAGE,
  mapOpenAiCategories,
  moderateChatText,
  type ModerationCategory,
  type ModerationVerdict,
} from "./chatModerationEngine.js";

export type ViolationOutcome = {
  violationCount: number;
  warningLevel: 1 | 2 | 3;
  chatRestrictedUntilMs: number | null;
  accountReviewFlag: boolean;
};

const RESTRICT_HOURS = 24;

async function runOpenAiModeration(
  text: string,
  apiKey: string,
): Promise<ModerationVerdict | null> {
  try {
    const openai = new OpenAI({apiKey});
    const result = await openai.moderations.create({input: text});
    const row = result.results?.[0];
    if (!row) return null;
    const cat = mapOpenAiCategories(
      row.flagged,
      row.categories as unknown as Record<string, boolean>,
    );
    if (!cat) return null;
    return {
      allowed: false,
      userMessage: COMMUNITY_GUIDELINES_MESSAGE,
      category: cat,
      internalReason: `openai:${cat}`,
    };
  } catch (e) {
    console.warn("[chatModeration] OpenAI moderation skipped", e);
    return null;
  }
}

export async function moderateMessageForDelivery(
  text: string,
  openAiKey?: string | null,
): Promise<ModerationVerdict> {
  const rules = moderateChatText({text, maxLength: 500});
  if (!rules.allowed) return rules;
  if (openAiKey?.trim()) {
    const ai = await runOpenAiModeration(text, openAiKey.trim());
    if (ai && !ai.allowed) return ai;
  }
  return rules;
}

export async function logModerationEvent(input: {
  userId: string;
  matchChatId: string;
  matchId: string;
  textPreview: string;
  category: ModerationCategory;
  internalReason: string;
  blocked: boolean;
}): Promise<string> {
  const db = admin.firestore();
  const ref = await db.collection("chatModerationEvents").add({
    userId: input.userId,
    matchChatId: input.matchChatId,
    matchId: input.matchId,
    textPreview: input.textPreview.slice(0, 120),
    category: input.category,
    internalReason: input.internalReason,
    blocked: input.blocked,
    flagged: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await db.doc(`flaggedMessages/${ref.id}`).set({
    reporterUid: input.userId,
    senderUid: input.userId,
    matchChatId: input.matchChatId,
    matchId: input.matchId,
    messageTextPreview: input.textPreview.slice(0, 500),
    category: input.category,
    internalReason: input.internalReason,
    status: "open",
    blocked: input.blocked,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await db.collection("moderationAuditLog").add({
    action: "chat_message_blocked",
    actorUid: input.userId,
    matchId: input.matchId,
    metadata: {
      matchChatId: input.matchChatId,
      category: input.category,
      eventId: ref.id,
    },
    source: "food_share_chat",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function applyViolationStrike(
  userId: string,
): Promise<ViolationOutcome> {
  const db = admin.firestore();
  const userRef = db.doc(`users/${userId}`);
  let outcome: ViolationOutcome = {
    violationCount: 1,
    warningLevel: 1,
    chatRestrictedUntilMs: null,
    accountReviewFlag: false,
  };

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const data = snap.data() ?? {};
    const prior = (data.chatSafety ?? {}) as Record<string, unknown>;
    const count =
      typeof prior.violationCount === "number" ? prior.violationCount + 1 : 1;
    let restrictedUntil: admin.firestore.Timestamp | null = null;
    let accountReviewFlag = prior.accountReviewFlag === true;
    let warningLevel: 1 | 2 | 3 = 1;

    if (count >= 3) {
      warningLevel = 3;
      accountReviewFlag = true;
    } else if (count >= 2) {
      warningLevel = 2;
      restrictedUntil = admin.firestore.Timestamp.fromMillis(
        Date.now() + RESTRICT_HOURS * 60 * 60 * 1000,
      );
    } else {
      warningLevel = 1;
    }

    tx.set(
      userRef,
      {
        chatSafety: {
          violationCount: count,
          lastViolationAt: admin.firestore.FieldValue.serverTimestamp(),
          chatRestrictedUntil: restrictedUntil,
          accountReviewFlag,
        },
      },
      {merge: true},
    );

    outcome = {
      violationCount: count,
      warningLevel,
      chatRestrictedUntilMs: restrictedUntil?.toMillis() ?? null,
      accountReviewFlag,
    };
  });

  await db.collection("moderationAuditLog").add({
    action:
      outcome.warningLevel === 3
        ? "chat_account_review_flag"
        : outcome.warningLevel === 2
          ? "chat_temporary_restriction"
          : "chat_warning",
    actorUid: userId,
    metadata: outcome,
    source: "food_share_chat",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return outcome;
}

export async function getChatRestriction(
  userId: string,
): Promise<{restricted: boolean; untilMs: number | null}> {
  const snap = await admin.firestore().doc(`users/${userId}`).get();
  const safety = (snap.data()?.chatSafety ?? {}) as Record<string, unknown>;
  const until = safety.chatRestrictedUntil;
  const untilMs =
    until && typeof (until as {toMillis?: () => number}).toMillis === "function"
      ? (until as {toMillis: () => number}).toMillis()
      : null;
  if (untilMs != null && untilMs > Date.now()) {
    return {restricted: true, untilMs};
  }
  return {restricted: false, untilMs: null};
}

export async function guidelinesAccepted(userId: string): Promise<boolean> {
  const snap = await admin.firestore().doc(`users/${userId}`).get();
  const safety = (snap.data()?.chatSafety ?? {}) as Record<string, unknown>;
  return safety.guidelinesAcceptedAt != null;
}

export async function isMuted(
  userId: string,
  matchChatId: string,
): Promise<boolean> {
  const snap = await admin
    .firestore()
    .doc(`users/${userId}/chatMutes/${matchChatId}`)
    .get();
  return snap.exists;
}
