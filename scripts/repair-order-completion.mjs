#!/usr/bin/env node
/**
 * One-off repair: set terminal completion fields on an orders/{id} document.
 * Usage: node scripts/repair-order-completion.mjs <orderId> [--project halforfer]
 * Requires: gcloud application-default login OR GOOGLE_APPLICATION_CREDENTIALS
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const orderId = process.argv[2]?.trim();
const projectId =
  process.argv.includes('--project')
    ? process.argv[process.argv.indexOf('--project') + 1]
    : process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'halforfer';

if (!orderId) {
  console.error('Usage: node scripts/repair-order-completion.mjs <orderId> [--project halforfer]');
  process.exit(1);
}

admin.initializeApp({ projectId });
const db = admin.firestore();
const ref = db.collection('orders').doc(orderId);

const before = await ref.get();
if (!before.exists) {
  console.error('Order not found:', orderId);
  process.exit(1);
}

const d = before.data();
console.log('BEFORE', {
  orderId,
  status: d.status,
  deliveryStatus: d.deliveryStatus,
});

await ref.update({
  status: 'completed',
  deliveryStatus: 'delivered',
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
});

const after = await ref.get();
const a = after.data();
console.log('AFTER', {
  orderId,
  status: a.status,
  deliveryStatus: a.deliveryStatus,
});
