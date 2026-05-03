/** PaymentSheet — HTTPS Cloud Function only (`halforfer`). Deploy: `firebase deploy --only functions`. */
export function resolvePaymentIntentPostUrl() {
  return 'https://us-central1-halforfer.cloudfunctions.net/createPaymentIntent';
}
