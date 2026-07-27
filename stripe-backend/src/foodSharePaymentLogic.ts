/**
 * Server-side food share payment pricing — never trust client amounts.
 */
export type FoodSharePaymentQuote = {
  foodShareCents: number;
  deliveryShareCents: number;
  platformFeeCents: number;
  serviceFeeCents: number;
  /** Full service fee before split (cents). */
  originalServiceFeeCents: number;
  /** User's half of service fee (cents). */
  sharedServiceFeeCents: number;
  originalDeliveryFeeCents: number;
  taxCents: number;
  promoDiscountCents: number;
  totalCents: number;
  taxRate: number;
  currency: "cad";
  freeDelivery: boolean;
  freeServiceFee: boolean;
  foodSavingCents: number;
  deliverySavingCents: number;
  serviceFeeSavingCents: number;
  promotionSavingCents: number;
  totalSavingCents: number;
};

export type FoodSharePaymentStatus =
  | "PENDING"
  | "AUTHORIZED"
  | "PAID"
  | "REFUNDED"
  | "FAILED";

const DEFAULT_TAX_RATE = 0.13;

export function resolvePlatformFeeCents(): number {
  const raw = process.env.FOOD_SHARE_PLATFORM_FEE_CENTS;
  if (raw == null || raw === "") return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function parseTaxRate(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 1) {
    return raw;
  }
  if (typeof raw === "string" && raw.trim()) {
    const n = Number.parseFloat(raw.trim());
    if (Number.isFinite(n)) {
      if (n > 1) return Math.min(1, Math.max(0, n / 100));
      return Math.min(1, Math.max(0, n));
    }
  }
  return DEFAULT_TAX_RATE;
}

function promotionBadgesFromData(
  data: Record<string, unknown> | null | undefined,
): string[] {
  if (!data) return [];
  if (Array.isArray(data.promotionBadges)) {
    return data.promotionBadges.filter((x): x is string => typeof x === "string");
  }
  if (typeof data.promotionBadge === "string" && data.promotionBadge.trim()) {
    return [data.promotionBadge.trim()];
  }
  return [];
}

function promoWaivesDelivery(data: Record<string, unknown> | null | undefined): boolean {
  return promotionBadgesFromData(data).includes("free_delivery");
}

function promoWaivesServiceFee(data: Record<string, unknown> | null | undefined): boolean {
  return promotionBadgesFromData(data).includes("free_service_fee");
}

export function quoteFoodSharePayment(input: {
  sharedPrice: number;
  deliveryShare: number;
  /** Optional restaurant/admin service fee (dollars). Falls back to platform fee env. */
  serviceFee?: number | null;
  taxRate?: number | null;
  promoDiscount?: number | null;
  originalFoodPrice?: number | null;
  shareRaw?: Record<string, unknown> | null;
}): FoodSharePaymentQuote {
  const food = Math.max(0, input.sharedPrice);
  const shareRaw = input.shareRaw ?? null;
  const isPickup =
    shareRaw?.fulfillmentMode === "pickup" ||
    shareRaw?.pickupOnly === true ||
    shareRaw?.pickupOnly === "true";
  const userDeliveryShare = isPickup ? 0 : Math.max(0, input.deliveryShare);
  const originalDeliveryFee = Math.round(userDeliveryShare * 2 * 100) / 100;
  const foodShareCents = Math.round(food * 100);
  const freeDelivery = isPickup ? true : promoWaivesDelivery(shareRaw);
  const freeServiceFee = promoWaivesServiceFee(shareRaw);
  const deliveryShareCents = freeDelivery ? 0 : Math.round(userDeliveryShare * 100);

  const platformFeeCents = resolvePlatformFeeCents();
  const originalServiceFeeDollars =
    input.serviceFee != null && Number.isFinite(input.serviceFee)
      ? Math.max(0, input.serviceFee)
      : platformFeeCents / 100;
  const originalServiceFeeCents = Math.round(originalServiceFeeDollars * 100);
  const sharedServiceFeeCents = freeServiceFee
    ? 0
    : Math.round(originalServiceFeeCents / 2);
  const serviceFeeCents = sharedServiceFeeCents;

  const promoDiscountCents = Math.round(
    Math.max(0, input.promoDiscount ?? 0) * 100,
  );
  const taxRate = parseTaxRate(input.taxRate ?? DEFAULT_TAX_RATE);

  const taxableCents = Math.max(
    0,
    foodShareCents + deliveryShareCents + serviceFeeCents - promoDiscountCents,
  );
  const taxCents = Math.round(taxableCents * taxRate);
  const totalCents = taxableCents + taxCents;
  if (totalCents <= 0) {
    throw new Error("Invalid food share payment amount.");
  }

  const originalFoodPrice = Math.max(0, input.originalFoodPrice ?? food * 2);
  const foodSavingCents = Math.round(
    Math.max(0, originalFoodPrice - food) * 100,
  );
  const sharedDeliverySavingCents = freeDelivery
    ? 0
    : Math.round(Math.max(0, originalDeliveryFee - userDeliveryShare) * 100);
  const freeDeliverySavingCents = freeDelivery
    ? Math.round(originalDeliveryFee * 100)
    : 0;
  const deliverySavingCents = sharedDeliverySavingCents + freeDeliverySavingCents;
  const sharedServiceSavingCents = freeServiceFee
    ? 0
    : Math.round(originalServiceFeeCents / 2);
  const freeServiceSavingCents = freeServiceFee ? originalServiceFeeCents : 0;
  const serviceFeeSavingCents =
    sharedServiceSavingCents + freeServiceSavingCents;
  const promotionSavingCents = promoDiscountCents;
  const totalSavingCents =
    foodSavingCents +
    deliverySavingCents +
    serviceFeeSavingCents +
    promotionSavingCents;

  return {
    foodShareCents,
    deliveryShareCents,
    platformFeeCents,
    serviceFeeCents,
    originalServiceFeeCents,
    sharedServiceFeeCents,
    originalDeliveryFeeCents: Math.round(originalDeliveryFee * 100),
    taxCents,
    promoDiscountCents,
    totalCents,
    taxRate,
    currency: "cad",
    freeDelivery,
    freeServiceFee,
    foodSavingCents,
    deliverySavingCents,
    serviceFeeSavingCents,
    promotionSavingCents,
    totalSavingCents,
  };
}

export function foodSharePaymentDocId(matchId: string, userId: string): string {
  return `${matchId}_${userId}`;
}

export function isFoodSharePaymentMetadata(
  metadata: Record<string, string> | null | undefined,
): boolean {
  return metadata?.type === "food_share" && Boolean(metadata?.matchId?.trim());
}
