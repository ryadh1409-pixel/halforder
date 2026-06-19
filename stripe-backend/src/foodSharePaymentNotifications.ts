import * as admin from "firebase-admin";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {
  notifyFoodSharePartnerPaid,
  notifyFoodSharePaymentSucceeded,
} from "./foodShareServerNotify.js";

function isPaid(value: unknown): boolean {
  return String(value ?? "").trim().toUpperCase() === "PAID";
}

function stringField(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  return typeof value === "string" ? value.trim() : "";
}

function partnerUidFor(users: string[], uid: string): string | null {
  return users.find((u) => u && u !== uid) ?? null;
}

export const notifyFoodSharePaymentStatusPaid = onDocumentWritten(
  {
    document: "payments/{paymentId}",
    region: "us-central1",
  },
  async (event) => {
    const before = event.data?.before.exists ?
      event.data.before.data() ?? {} :
      {};
    const after = event.data?.after.exists ?
      event.data.after.data() ?? {} :
      null;
    if (!after) return;
    if (stringField(after, "type") !== "food_share") return;
    if (!isPaid(after.paymentStatus) || isPaid(before.paymentStatus)) return;

    const matchId = stringField(after, "matchId");
    const userId = stringField(after, "userId");
    if (!matchId || !userId) return;

    const matchSnap = await admin.firestore().doc(`matches/${matchId}`).get();
    if (!matchSnap.exists) return;
    const match = matchSnap.data() ?? {};
    if (match.status === "CANCELLED" || match.lifecycle === "CANCELLED") return;

    const foodName =
      typeof match.foodName === "string" ? match.foodName : "your meal share";
    const users = Array.isArray(match.users) ?
      match.users.filter((u): u is string => typeof u === "string") :
      [];
    const paymentId = event.params.paymentId;

    await notifyFoodSharePaymentSucceeded({
      userId,
      matchId,
      foodName,
      notificationId: `${paymentId}_payer_paid`,
    });

    const partnerUid = partnerUidFor(users, userId);
    if (!partnerUid) return;
    const partnerPaymentStatus = (
      match.userPayments as
        | Record<string, {paymentStatus?: unknown}>
        | undefined
    )?.[partnerUid]?.paymentStatus;
    if (isPaid(partnerPaymentStatus)) return;

    await notifyFoodSharePartnerPaid({
      recipientUid: partnerUid,
      partnerFirstName: "The other participant",
      foodName,
      matchId,
      notificationId: `${paymentId}_partner_paid`,
    });
  },
);
