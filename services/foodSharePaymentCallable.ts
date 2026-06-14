import { httpsCallable, type Functions } from 'firebase/functions';
import { functions } from '@/services/firebase';
import {
  isCallableNotFound,
  parseCallableError,
} from '@/services/foodSharePaymentDocReads';

type CallablePayload = Record<string, unknown>;

async function callFirstAvailable(
  names: string[],
  payload: CallablePayload,
  fns: Functions = functions,
): Promise<{ name: string; data: unknown }> {
  let lastError: unknown = null;
  for (const name of names) {
    try {
      const fn = httpsCallable(fns, name);
      const result = await fn(payload);
      console.log('[PAYMENT CALLABLE OK]', name, payload);
      return { name, data: result.data };
    } catch (error) {
      lastError = error;
      const parsed = parseCallableError(error);
      console.error('[STRIPE ERROR]', {
        callable: name,
        code: parsed.code,
        message: parsed.message,
        details: parsed.details,
        payload,
      });
      if (isCallableNotFound(error)) {
        console.error('[PAYMENT CALLABLE MISSING]', name, parsed.message);
        continue;
      }
      throw error;
    }
  }
  const parsed = parseCallableError(lastError);
  throw new Error(
    parsed.message ||
      'Food share payment is unavailable. Deploy createFoodSharePaymentIntent or update createPaymentIntent on Firebase.',
  );
}

/** Deployed alias: `createPaymentIntent` (live) then `createFoodSharePaymentIntent`. */
export async function invokeFoodSharePaymentIntent(
  payload: CallablePayload,
): Promise<unknown> {
  const { data } = await callFirstAvailable(
    ['createPaymentIntent', 'createFoodSharePaymentIntent'],
    payload,
  );
  return data;
}

/** Deployed alias: `createPaymentIntent` confirm payload, then `confirmFoodSharePayment`. */
export async function invokeFoodSharePaymentConfirm(
  payload: CallablePayload,
): Promise<unknown> {
  const confirmPayload = {
    ...payload,
    confirm: true,
    purpose: 'food_share_confirm',
  };
  const { data } = await callFirstAvailable(
    ['createPaymentIntent', 'confirmFoodSharePayment'],
    confirmPayload,
  );
  return data;
}
