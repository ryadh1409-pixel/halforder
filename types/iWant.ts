export const I_WANT_ORDER_SOURCE = 'emo_concierge' as const;
export const I_WANT_ORDER_TYPE = 'i_want' as const;

/** Flat fees for concierge orders from non-integrated restaurants. */
export const I_WANT_DEFAULT_DELIVERY_FEE = 5.99;
export const I_WANT_DEFAULT_SERVICE_FEE = 2.99;

export type IWantRestaurantDraft = {
  name: string;
  googleMapsUrl: string;
  placeId: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
};

export type IWantMealDraft = {
  mealName: string;
  estimatedPrice: number;
  quantity: number;
  notes: string;
};

export type IWantAddressDraft = {
  address: string;
  lat: number;
  lng: number;
};

export type IWantOrderDraft = {
  restaurant: IWantRestaurantDraft | null;
  meal: IWantMealDraft | null;
  address: IWantAddressDraft | null;
};

export function isIWantOrderData(
  raw: Record<string, unknown> | null | undefined,
): boolean {
  if (!raw) return false;
  return (
    raw.orderSource === I_WANT_ORDER_SOURCE ||
    raw.type === I_WANT_ORDER_TYPE
  );
}
