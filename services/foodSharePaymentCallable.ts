import { httpsCallable, type Functions } from 'firebase/functions';
import { functions } from '@/services/firebase';
import {
  isCallableNotFound,
  parseCallableError,
} from '@/services/foodSharePaymentDocReads';

type CallablePayload = Record<string, unknown>;
type ConfirmFoodSharePaymentResponse = {
  orderId?: unknown;
  orderCreated?: unknown;
  poolExists?: unknown;
  lifecycle?: unknown;
};

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

/** Ensures orders/{matchId} + driver pool row after both users paid. */
export async function invokeFoodShareDispatchEnsure(
  matchId: string,
): Promise<unknown> {
  const id = matchId.trim();
  if (!id) return null;
  try {
    const fn = httpsCallable(functions, 'ensureFoodShareDispatchOrder');
    const result = await fn({ matchId: id });
    console.log('[FOOD SHARE DRIVER POOL]', {
      matchId: id,
      client: true,
      data: result.data,
    });
    return result.data;
  } catch (error) {
    const parsed = parseCallableError(error);
    console.error('[FOOD SHARE ORDER ERROR]', {
      matchId: id,
      callable: 'ensureFoodShareDispatchOrder',
      code: parsed.code,
      message: parsed.message,
      error,
    });
    return null;
  }
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
  const matchId =
    typeof payload.matchId === 'string' ? payload.matchId.trim() : '';
  const confirmResult =
    data !== null && typeof data === 'object'
      ? (data as ConfirmFoodSharePaymentResponse)
      : {};
  const lifecycle =
    typeof confirmResult.lifecycle === 'string'
      ? confirmResult.lifecycle.trim().toUpperCase()
      : '';
  const hasOrderId =
    typeof confirmResult.orderId === 'string' && confirmResult.orderId.trim().length > 0;
  const fullyPaid =
    hasOrderId ||
    confirmResult.orderCreated === true ||
    confirmResult.poolExists === true ||
    lifecycle === 'ORDER_PLACED';
  if (matchId && fullyPaid) {
    await invokeFoodShareDispatchEnsure(matchId);
  }
  return data;
}
