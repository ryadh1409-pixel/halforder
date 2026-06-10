const admin = require('firebase-admin');

// Use firebase CLI credential
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'halforfer',
});

const db = admin.firestore();

const ORDER_IDS = [
  'dik3oWxEoB4j9eYfz17F',
  'YEN47jLU0rv93ZKKoDHM',
  'GIe6SQEsEUcjxCRw7fYr',
  'IhEEVIZTYptoStT5CWBI',
];

async function main() {
  for (const id of ORDER_IDS) {
    try {
      await db.collection('orders').doc(id).update({
        status: 'completed',
        deliveryStatus: 'delivered',
        earningsRecorded: true,
        marketplaceArchived: true,
      });
      console.log('✅ fixed:', id);
    } catch (e) {
      console.error('❌ failed:', id, e.message);
    }
  }
  process.exit(0);
}

main();
