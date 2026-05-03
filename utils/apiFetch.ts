const DEFAULT_TIMEOUT_MS = 25_000;

export type ApiFetchOptions = RequestInit & { timeoutMs?: number };

/**
 * Fetch with timeout, logging, and safe error propagation (caller handles non-OK).
 */
export async function apiFetch(url: string, init: ApiFetchOptions = {}): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchInit } = init;
  const method = (fetchInit.method ?? 'GET').toUpperCase();

  console.log('[apiFetch] start', method, url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...fetchInit,
      signal: controller.signal,
    });

    void res
      .clone()
      .text()
      .then((body) => {
        const preview = body.length > 1200 ? `${body.slice(0, 1200)}…` : body;
        console.log('[apiFetch] response', res.status, preview);
      })
      .catch((e) => console.warn('[apiFetch] could not read body for log', e));

    return res;
  } catch (e) {
    console.error('[apiFetch] error', method, url, e);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
