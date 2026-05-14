import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from './firebase';
import { FIRESTORE_COLLECTIONS } from './firestorePaths';
import { shouldLogFirestoreAiPipeline } from './firestoreAiDebug';

let demoSeedAttempted = false;

/**
 * One-shot attempt to write demo `public_matchable_orders` rows when the directory query is empty.
 * Production rules use `allow write: if false` — this usually fails; use Firebase Console or
 * `syncPublicMatchableOrder` instead. **Runs only in `__DEV__`** (never in release builds).
 */
export function maybeAttemptPublicMatchableDemoSeed(): void {
  const allowTry = typeof __DEV__ !== 'undefined' && __DEV__;
  if (!allowTry || demoSeedAttempted) return;
  demoSeedAttempted = true;

  const col = FIRESTORE_COLLECTIONS.publicMatchableOrders;
  const torontoLat = 43.6532;
  const torontoLng = -79.3832;

  const demos: Record<string, Record<string, unknown>> = {
    _demo_ai_seed_pizza: {
      status: 'open',
      restaurantName: 'Pizza Pizza',
      city: 'Toronto',
      foodType: 'Pizza',
      foodName: 'Pizza',
      slotsOpen: 2,
      priceHint: 18,
      etaMinutes: 12,
      latitude: torontoLat,
      longitude: torontoLng,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    _demo_ai_seed_burger: {
      status: 'waiting',
      restaurantName: 'Burger King',
      city: 'Toronto',
      foodType: 'Burger',
      foodName: 'Burger',
      slotsOpen: 1,
      priceHint: 14,
      etaMinutes: 8,
      latitude: torontoLat + 0.004,
      longitude: torontoLng + 0.004,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
  };

  void (async () => {
    for (const [id, payload] of Object.entries(demos)) {
      try {
        await setDoc(doc(db, col, id), payload, { merge: true });
        if (shouldLogFirestoreAiPipeline()) {
          console.log('[publicMatchableDemo] wrote', `${col}/${id}`);
        }
      } catch (e) {
        if (shouldLogFirestoreAiPipeline()) {
          console.warn(
            '[publicMatchableDemo] client seed skipped (rules usually disallow writes). Add the same fields in Firebase Console or deploy Cloud Functions.',
            e,
          );
        }
        break;
      }
    }
  })();
}
