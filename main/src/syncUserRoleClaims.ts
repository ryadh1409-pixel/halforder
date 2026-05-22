/**
 * Mirrors `users/{uid}.role` onto Firebase Auth custom claims (`request.auth.token.role`).
 * Required for query-safe Firestore rules on driver marketplace order listeners.
 */
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";

const db = getFirestore();

const VALID_ROLES = new Set([
  "user",
  "customer",
  "driver",
  "restaurant",
  "host",
  "admin",
]);

function normalizeRole(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "user";
  const r = raw.trim();
  if (r === "customer") return "user";
  if (r === "host") return "restaurant";
  return VALID_ROLES.has(r) ? r : "user";
}

async function applyRoleClaims(uid: string, role: string): Promise<void> {
  await getAuth().setCustomUserClaims(uid, {role});
}

/** Keeps Auth token role in sync when the Firestore user profile changes. */
export const syncUserRoleClaims = onDocumentWritten(
  "users/{uid}",
  async (event) => {
    const uid = event.params.uid;
    const after = event.data?.after;
    if (!after?.exists) return;

    const role = normalizeRole(after.data()?.role);
    const beforeRole = event.data?.before?.exists
      ? normalizeRole(event.data.before.data()?.role)
      : null;

    if (beforeRole === role && event.data?.before?.exists) {
      return;
    }

    await applyRoleClaims(uid, role);
    logger.info("syncUserRoleClaims", {uid, role});
  },
);

/** Callable: refresh claims from `users/{uid}` then client `getIdToken(true)`. */
export const refreshUserRoleClaims = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }
  const uid = request.auth.uid;
  const snap = await db.doc(`users/${uid}`).get();
  const role = normalizeRole(snap.data()?.role);
  await applyRoleClaims(uid, role);
  return {role};
});
