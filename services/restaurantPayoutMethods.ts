import { auth, db, ensureAuthReady } from '@/services/firebase';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

export function readRestaurantInteracEmail(
  data: Record<string, unknown>,
): string {
  const payoutMethods = data.payoutMethods;
  if (
    payoutMethods &&
    typeof payoutMethods === 'object' &&
    !Array.isArray(payoutMethods)
  ) {
    const email = (payoutMethods as Record<string, unknown>).interacEmail;
    if (typeof email === 'string') return email.trim();
  }

  // Read-only compatibility if an earlier build used a top-level field.
  return typeof data.interacEmail === 'string'
    ? data.interacEmail.trim()
    : '';
}

/**
 * Saves only the Restaurant Interac payout field. Bank details remain managed
 * securely by Stripe Connect; no Driver or Customer document is touched.
 */
export async function saveRestaurantInteracEmail(
  restaurantId: string,
  email: string,
): Promise<void> {
  const uid = restaurantId.trim();
  if (!uid) throw new Error('Invalid restaurant id');

  await ensureAuthReady();
  if (auth.currentUser?.uid !== uid) {
    throw new Error('Sign in required to update payout details.');
  }

  await setDoc(
    doc(db, 'restaurants', uid),
    {
      payoutMethods: {
        interacEmail: email.trim().toLowerCase(),
        updatedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    },
    {
      mergeFields: [
        'payoutMethods.interacEmail',
        'payoutMethods.updatedAt',
        'updatedAt',
      ],
    },
  );
}
