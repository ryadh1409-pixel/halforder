const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const ADMIN_FCM_TOKEN = process.env.ADMIN_FCM_TOKEN || '';

exports.onSupportMessage = functions.firestore
  .document('support_chats/{userId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const sender = data?.sender;

    if (sender !== 'user') return null;

    if (!ADMIN_FCM_TOKEN) {
      console.warn('ADMIN_FCM_TOKEN not set, skipping notification');
      return null;
    }

    const text = typeof data?.text === 'string' ? data.text.slice(0, 100) : 'New message';

    await admin.messaging().send({
      token: ADMIN_FCM_TOKEN,
      notification: {
        title: 'Support: New message',
        body: text,
      },
      data: {
        userId: context.params.userId,
      },
    });

    return null;
  });
