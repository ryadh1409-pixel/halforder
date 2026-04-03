/**
 * One-off migration: `food_cards` with status "waiting" → "active".
 *
 * Aligns legacy documents with the app query `where("status", "==", "active")`.
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *   npm run migrate:food-cards-waiting-to-active
 *
 * Optional: FIREBASE_PROJECT_ID / GCLOUD_PROJECT / GOOGLE_CLOUD_PROJECT
 */
import admin from 'firebase-admin';

const BATCH_SIZE = 500;

function initAdmin(): void {
  if (admin.apps.length > 0) return;
  const projectId =
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.GCLOUD_PROJECT?.trim() ||
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    'halforfer';
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });
}

async function main(): Promise<void> {
  initAdmin();
  const db = admin.firestore();
  const snap = await db
    .collection('food_cards')
    .where('status', '==', 'waiting')
    .get();

  if (snap.empty) {
    console.log('No food_cards documents with status == "waiting". Nothing to do.');
    return;
  }

  let batch = db.batch();
  let inBatch = 0;
  let total = 0;
  const ids: string[] = [];

  for (const docSnap of snap.docs) {
    batch.update(docSnap.ref, { status: 'active' });
    ids.push(docSnap.id);
    inBatch += 1;
    total += 1;
    if (inBatch >= BATCH_SIZE) {
      await batch.commit();
      console.log(`Committed batch (${BATCH_SIZE} updates)…`);
      batch = db.batch();
      inBatch = 0;
    }
  }

  if (inBatch > 0) {
    await batch.commit();
  }

  console.log(
    `Updated ${total} food_card(s) from status "waiting" → "active".`,
  );
  console.log('Document IDs:', ids.join(', '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
