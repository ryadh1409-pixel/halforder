/**
 * Server-side food share payment pricing — never trust client amounts.
 */
export type FoodSharePaymentQuote = {
  foodShareCents: number;
  deliveryShareCents: number;
  platformFeeCents: number;
  serviceFeeCents: number;
  taxCents: number;
  promoDiscountCents: number;
  totalCents: number;
  taxRate: number;
  currency: "usd";
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

export function quoteFoodSharePayment(input: {
  sharedPrice: number;
  deliveryShare: number;
  /** Optional restaurant/admin service fee (dollars). Falls back to platform fee env. */
  serviceFee?: number | null;
  taxRate?: number | null;
  promoDiscount?: number | null;
}): FoodSharePaymentQuote {
  const food = Math.max(0, input.sharedPrice);
  const delivery = Math.max(0, input.deliveryShare);
  const foodShareCents = Math.round(food * 100);
  const deliveryShareCents = Math.round(delivery * 100);

  const platformFeeCents = resolvePlatformFeeCents();
  const serviceFeeCents =
    input.serviceFee != null && Number.isFinite(input.serviceFee)
      ? Math.round(Math.max(0, input.serviceFee) * 100)
      : platformFeeCents;

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
  return {
    foodShareCents,
    deliveryShareCents,
    platformFeeCents,
    serviceFeeCents,
    taxCents,
    promoDiscountCents,
    totalCents,
    taxRate,
    currency: "usd",
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
