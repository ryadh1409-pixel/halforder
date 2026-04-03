/**
 * Client-side Expo Push HTTP API (same endpoint as Cloud Functions).
 * @see https://docs.expo.dev/push-notifications/sending-notifications/
 */

const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';

type ExpoPushTicket = { status?: string; message?: string };

/**
 * Send a single push notification. No-op if token is missing.
 * `data` values are coerced to strings for client compatibility.
 */
export async function sendPushNotification(
  token: string | null | undefined,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  const to = typeof token === 'string' ? token.trim() : '';
  if (!to) return;

  const message: Record<string, unknown> = {
    to,
    title: title || 'HalfOrder',
    body: body || '',
    sound: 'default',
    priority: 'high',
    channelId: 'default',
  };
  if (data && Object.keys(data).length > 0) {
    message.data = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)]),
    );
  }

  try {
    const res = await fetch(EXPO_PUSH_SEND_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([message]),
    });
    const json = (await res.json()) as { data?: ExpoPushTicket[] };
    const ticket = json.data?.[0];
    if (ticket?.status === 'error') {
      console.warn('[sendPushNotification]', ticket.message ?? ticket);
    }
  } catch (e) {
    console.warn('[sendPushNotification] request failed', e);
  }
}
