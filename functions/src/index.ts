/**
 * Cloud Functions entry — build with `npm run build` (outputs `lib/`).
 */
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

export { createStripeAccount, checkStripeStatus } from './stripe';
