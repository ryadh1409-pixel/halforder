/**
 * EmoOrder — payment orchestration.
 * Creates the order document, then presents the native Stripe PaymentSheet.
 * The user never navigates away — the sheet is a modal overlay.
 */

import { createIWantOrder, quoteIWantPricing } from '@/services/iWant/createIWantOrder';
import { openPaymentSheet } from '@/services/stripe';
import type {
  EmoOrderAddressDraft,
  EmoOrderMealDraft,
  EmoOrderPricing,
  EmoOrderRestaurantOption,
} from '@/types/emoOrder';
import type { IWantRestaurantDraft } from '@/types/iWant';

export type EmoOrderCreateResult = {
  orderId: string;
  pricing: EmoOrderPricing;
};

export type EmoOrderPayResult =
  | { status: 'success'; orderId: string }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };

function toIWantRestaurant(r: EmoOrderRestaurantOption): IWantRestaurantDraft {
  return {
    name: r.name,
    googleMapsUrl: r.googleMapsUrl,
    placeId: r.placeId,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    rating: r.rating,
    placeType: r.placeType,
  };
}

/**
 * Quote pricing without creating the order (for summary display).
 */
export function quoteEmoOrderPricing(meal: EmoOrderMealDraft): EmoOrderPricing {
  const p = quoteIWantPricing({
    estimatedPrice: meal.estimatedPrice,
    quantity: meal.quantity,
  });
  return {
    foodSubtotal: p.foodSubtotal,
    deliveryFee: p.deliveryFee,
    serviceFee: p.serviceFee,
    hst: p.hst,
    taxRate: p.taxRate,
    totalPaid: p.totalPaid,
  };
}

/**
 * Create the order document + present the native Stripe payment sheet.
 * Returns immediately after user interaction with the sheet (success/cancel/fail).
 * No navigation — the sheet is a modal overlay on the concierge screen.
 */
export async function createAndPayEmoOrder(
  restaurant: EmoOrderRestaurantOption,
  meal: EmoOrderMealDraft,
  address: EmoOrderAddressDraft,
): Promise<EmoOrderPayResult> {
  // 1 — Create order document
  let orderId: string;
  let pricing: EmoOrderPricing;
  try {
    const result = await createIWantOrder({
      restaurant: toIWantRestaurant(restaurant),
      meal: {
        mealName: meal.mealName,
        estimatedPrice: meal.estimatedPrice,
        quantity: meal.quantity,
        notes: meal.notes,
      },
      address: {
        address: address.address,
        lat: address.lat,
        lng: address.lng,
      },
    });
    orderId = result.orderId;
    pricing = {
      foodSubtotal: result.pricing.foodSubtotal,
      deliveryFee: result.pricing.deliveryFee,
      serviceFee: result.pricing.serviceFee,
      hst: result.pricing.hst,
      taxRate: result.pricing.taxRate,
      totalPaid: result.pricing.totalPaid,
    };
  } catch (e) {
    return {
      status: 'failed',
      message: e instanceof Error ? e.message : 'Could not create order.',
    };
  }

  // 2 — Present Stripe payment sheet (modal, no navigation)
  const amountCents = Math.round(pricing.totalPaid * 100);
  try {
    const result = await openPaymentSheet({
      amount: amountCents,
      orderId,
      merchantDisplayName: 'HalfOrder',
    });

    if (result.status === 'success') return { status: 'success', orderId };
    if (result.status === 'canceled') return { status: 'cancelled' };
    return {
      status: 'failed',
      message: 'message' in result ? (result.message ?? 'Payment failed.') : 'Payment failed.',
    };
  } catch (e) {
    return {
      status: 'failed',
      message: e instanceof Error ? e.message : 'Payment could not be processed.',
    };
  }
}
