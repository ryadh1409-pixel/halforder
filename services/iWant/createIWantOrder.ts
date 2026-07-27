import { computeOrderPricing } from '@/lib/orderPricing';
import { buildCustomerLocationRecord } from '@/services/location/customerLocation';
import { auth, ensureAuthReady } from '@/services/firebase';
import { tracedAddOrder } from '@/services/orderFirestoreWrite';
import {
  I_WANT_DEFAULT_DELIVERY_FEE,
  I_WANT_DEFAULT_SERVICE_FEE,
  I_WANT_ORDER_SOURCE,
  I_WANT_ORDER_TYPE,
  type IWantAddressDraft,
  type IWantMealDraft,
  type IWantRestaurantDraft,
} from '@/types/iWant';
import { serverTimestamp } from 'firebase/firestore';

function roundMoney(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100;
}

function restaurantIdForDraft(restaurant: IWantRestaurantDraft): string {
  if (restaurant.placeId?.trim()) {
    return `i_want_${restaurant.placeId.trim()}`;
  }
  const slug = restaurant.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 40);
  return `i_want_${slug || 'restaurant'}`;
}

export type CreateIWantOrderInput = {
  restaurant: IWantRestaurantDraft;
  meal: IWantMealDraft;
  address: IWantAddressDraft;
  deliveryFee?: number;
  serviceFee?: number;
};

export type CreateIWantOrderResult = {
  orderId: string;
  pricing: ReturnType<typeof computeOrderPricing>;
};

/**
 * Creates a paid-before-dispatch concierge order for any restaurant.
 * Compatible with existing /checkout + driver marketplace pool (delivery + unpaid→paid).
 */
export async function createIWantOrder(
  input: CreateIWantOrderInput,
): Promise<CreateIWantOrderResult> {
  await ensureAuthReady();
  const customerUid = auth.currentUser?.uid?.trim() ?? '';
  if (!customerUid) throw new Error('Please sign in first.');

  const qty = Math.max(1, Math.floor(input.meal.quantity || 1));
  const unitPrice = roundMoney(input.meal.estimatedPrice);
  const foodSubtotal = roundMoney(unitPrice * qty);
  const deliveryFee = roundMoney(
    input.deliveryFee ?? I_WANT_DEFAULT_DELIVERY_FEE,
  );
  const serviceFee = roundMoney(
    input.serviceFee ?? I_WANT_DEFAULT_SERVICE_FEE,
  );
  const pricing = computeOrderPricing({
    foodSubtotal,
    deliveryFee,
    serviceFee,
  });

  if (pricing.totalPaid <= 0) {
    throw new Error('Enter a valid meal price to continue.');
  }

  const restaurantId = restaurantIdForDraft(input.restaurant);
  const lat = input.restaurant.lat;
  const lng = input.restaurant.lng;
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    throw new Error('Restaurant location is required. Search again or paste a Maps link.');
  }

  const notes = input.meal.notes.trim();
  const itemName = notes
    ? `${input.meal.mealName.trim()} (${notes})`
    : input.meal.mealName.trim();

  const receiptNumber = `HO-${Date.now().toString(36).toUpperCase().slice(-8)}`;
  const etaMinutes = 45;

  const orderPayload: Record<string, unknown> = {
    userId: customerUid,
    customerId: customerUid,
    restaurantId,
    venueId: restaurantId,
    orderSource: I_WANT_ORDER_SOURCE,
    type: I_WANT_ORDER_TYPE,
    items: [
      {
        id: 'i_want_meal',
        name: itemName,
        price: unitPrice,
        qty,
        image: null,
      },
    ],
    customerName: null,
    customerPhone: null,
    subtotal: foodSubtotal,
    tax: pricing.hst,
    taxRate: pricing.taxRate,
    deliveryFee,
    serviceFee,
    promoDiscount: 0,
    promoCode: null,
    receiptNumber,
    deliveryDistanceKm: null,
    deliveryEligible: true,
    deliveryTier: 'unknown',
    maxDeliveryDistanceKmAtCheckout: 50,
    totalPrice: pricing.totalPaid,
    total: pricing.totalPaid,
    deliveryType: 'delivery',
    estimatedPrepTime: etaMinutes,
    status: 'awaiting_payment',
    deliveryStatus: 'pending',
    paymentStatus: 'unpaid',
    stripePaymentIntentId: null,
    paymentIntentId: null,
    checkoutSessionId: null,
    groupId: null,
    estimatedDeliveryTime: etaMinutes,
    driverId: null,
    assignedDriverId: null,
    driverName: null,
    driverPhone: null,
    driverVehicle: null,
    driverLocation: null,
    deliveryLocation: {
      lat: input.address.lat,
      lng: input.address.lng,
      address: input.address.address,
    },
    deliveryAddress: input.address.address,
    customerLocation: buildCustomerLocationRecord(
      input.address.lat,
      input.address.lng,
    ),
    restaurant: {
      id: restaurantId,
      name: input.restaurant.name,
      image: null,
      address: input.restaurant.address,
      latitude: lat,
      longitude: lng,
    },
    customer: {
      id: customerUid,
      name: '',
      avatar: null,
      address: input.address.address,
    },
    driver: {
      id: null,
      name: null,
      phone: null,
      vehicle: null,
      avatar: null,
    },
    userLocation: { lat: input.address.lat, lng: input.address.lng },
    restaurantLocation: { lat, lng },
    notes: notes || null,
    customerNotes: notes || null,
    googleMapsUrl: input.restaurant.googleMapsUrl,
    mealName: input.meal.mealName.trim(),
    estimatedMealPrice: unitPrice,
    acceptedAt: null,
    preparedAt: null,
    pickedUpAt: null,
    deliveredAt: null,
    estimatedArrival: null,
    fees: 0,
    taxes: pricing.hst,
    etaMinutes,
    createdAt: serverTimestamp(),
    hiddenForRestaurant: true,
    archivedByRestaurant: false,
    archivedAt: null,
    hiddenAt: null,
    restoredAt: null,
  };

  const orderId = await tracedAddOrder(orderPayload, {
    fileName: 'createIWantOrder.ts',
    functionName: 'createIWantOrder',
  });

  return { orderId, pricing };
}

export function quoteIWantPricing(input: {
  estimatedPrice: number;
  quantity: number;
  deliveryFee?: number;
  serviceFee?: number;
}) {
  const qty = Math.max(1, Math.floor(input.quantity || 1));
  const foodSubtotal = roundMoney(roundMoney(input.estimatedPrice) * qty);
  return computeOrderPricing({
    foodSubtotal,
    deliveryFee: roundMoney(input.deliveryFee ?? I_WANT_DEFAULT_DELIVERY_FEE),
    serviceFee: roundMoney(input.serviceFee ?? I_WANT_DEFAULT_SERVICE_FEE),
  });
}
