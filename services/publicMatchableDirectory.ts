/**
 * `public_matchable_orders` — join discovery directory (safe, denormalized fields only).
 *
 * **Writes:** Clients must not write this collection (`firestore.rules`: `allow write: if false`).
 * Production updates happen when an `orders/{orderId}` document changes, via Cloud Function
 * `syncPublicMatchableOrder` in `main/src/publicMatchableSync.ts` (deploy with Firebase Functions).
 *
 * **Reads:** AI / Explore use `joinDirectoryOrdersQuery` in `joinDirectoryFirestore.ts`.
 */
import { FIRESTORE_COLLECTIONS } from './firestorePaths';

export const PUBLIC_MATCHABLE_ORDERS_COLLECTION =
  FIRESTORE_COLLECTIONS.publicMatchableOrders;
