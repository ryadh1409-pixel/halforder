const baseUrl =
  process.env.EXPO_PUBLIC_FUNCTIONS_BASE_URL?.trim() ||
  'http://127.0.0.1:5001/halforfer/us-central1';

export async function createPaymentIntentRequest(amount: number): Promise<string> {
  const response = await fetch(`${baseUrl}/createPaymentIntentHttp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });
  const json = (await response.json()) as { clientSecret?: string; error?: string };
  if (!response.ok || !json.clientSecret) {
    throw new Error(json.error || 'Failed to create payment intent');
  }
  return json.clientSecret;
}
