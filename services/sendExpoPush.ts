const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo accepts an array of messages per request; cap at 100. */
export const EXPO_PUSH_BATCH_SIZE = 100;

type ExpoTicketErr = { status?: string; message?: string; details?: unknown };

type SendResult = {
  sent: number;
  failed: number;
  error?: string;
};

/**
 * Send push notifications to Expo push tokens.
 * Batches requests (max {@link EXPO_PUSH_BATCH_SIZE} messages per request).
 * Duplicate `to` values should be removed by callers; this function does not dedupe.
 */
export async function sendExpoPush(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<SendResult> {
  const valid = tokens.filter((t) => typeof t === 'string' && t.length > 0);
  if (valid.length === 0) return { sent: 0, failed: 0 };

  const messages = valid.map((to) => ({
    to,
    sound: 'default' as const,
    title,
    body,
    ...(data && Object.keys(data).length > 0 ? { data } : {}),
  }));
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < messages.length; i += EXPO_PUSH_BATCH_SIZE) {
    const chunk = messages.slice(i, i + EXPO_PUSH_BATCH_SIZE);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      });
      const json = (await res.json()) as {
        data?: { status?: string; message?: string; details?: ExpoTicketErr }[];
      };
      const results = Array.isArray(json?.data) ? json.data : [];
      results.forEach((r, idx) => {
        if (r?.status === 'ok') {
          sent += 1;
        } else {
          failed += 1;
          const to = chunk[idx]?.to ?? '?';
          console.warn('[sendExpoPush] ticket not ok', {
            to: typeof to === 'string' ? `${to.slice(0, 28)}…` : to,
            status: r?.status,
            message: r?.message,
            details: r?.details,
          });
        }
      });
      if (results.length < chunk.length) {
        const gap = chunk.length - results.length;
        failed += gap;
        console.warn('[sendExpoPush] missing ticket results', { gap });
      }
    } catch (e) {
      failed += chunk.length;
      console.warn('[sendExpoPush] batch request failed', e);
      return {
        sent,
        failed,
        error: e instanceof Error ? e.message : 'Request failed',
      };
    }
  }
  return { sent, failed };
}
