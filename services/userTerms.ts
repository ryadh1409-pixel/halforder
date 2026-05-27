import { db } from './firebase';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { logFirestoreUncaught } from './firestoreQueryDiagnostics';

const TERMS_URL = 'https://halforder.app/terms/';

export { TERMS_URL };

/**
 * Persists Terms acceptance on the user profile (required for App Store UGC flows).
 */
export async function acceptTermsOfService(userId: string): Promise<void> {
  if (!userId.trim()) {
    throw new Error('Missing user id.');
  }
  try {
    console.log('[PRE FIRESTORE]', {
      path: `users/${userId}`,
      operation: 'setDoc(merge terms)',
    });
    await setDoc(
      doc(db, 'users', userId),
      {
        hasAcceptedTerms: true,
        acceptedAt: serverTimestamp(),
      },
      { merge: true },
    );
    console.log('[POST FIRESTORE]', {
      path: `users/${userId}`,
      operation: 'setDoc(merge terms)',
    });
  } catch (error) {
    console.error('[FAILED FIRESTORE]', {
      path: `users/${userId}`,
      operation: 'setDoc(merge terms)',
      error,
    });
    logFirestoreUncaught(`users/${userId}`, 'setDoc(merge terms)', error);
    throw error;
  }
}
