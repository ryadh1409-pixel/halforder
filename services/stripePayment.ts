const PAYMENT_INTENT_URL =
  'https://us-central1-halforfer.cloudfunctions.net/createPaymentIntentHttp';

export async function createPaymentIntent(amount: number): Promise<string> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Amount must be a positive integer.');
  }

  const response = await fetch(PAYMENT_INTENT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });

  const json = (await response.json()) as {
    clientSecret?: string;
    error?: string;
  };

  if (!response.ok || !json.clientSecret) {
    throw new Error(json.error || 'Unable to create payment intent.');
  }

  return json.clientSecret;
}
