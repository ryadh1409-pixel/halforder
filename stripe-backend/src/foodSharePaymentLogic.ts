/**
 * Server-side food share payment pricing — never trust client amounts.
 */
export type FoodSharePaymentQuote = {
  foodShareCents: number;
  deliveryShareCents: number;
  platformFeeCents: number;
  totalCents: number;
  currency: "usd";
};

export type FoodSharePaymentStatus =
  | "PENDING"
  | "AUTHORIZED"
  | "PAID"
  | "REFUNDED"
  | "FAILED";

export function resolvePlatformFeeCents(): number {
  const raw = process.env.FOOD_SHARE_PLATFORM_FEE_CENTS;
  if (raw == null || raw === "") return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function quoteFoodSharePayment(input: {
  sharedPrice: number;
  deliveryShare: number;
}): FoodSharePaymentQuote {
  const food = Math.max(0, input.sharedPrice);
  const delivery = Math.max(0, input.deliveryShare);
  const foodShareCents = Math.round(food * 100);
  const deliveryShareCents = Math.round(delivery * 100);
  const platformFeeCents = resolvePlatformFeeCents();
  const totalCents = foodShareCents + deliveryShareCents + platformFeeCents;
  if (totalCents <= 0) {
    throw new Error("Invalid food share payment amount.");
  }
  return {
    foodShareCents,
    deliveryShareCents,
    platformFeeCents,
    totalCents,
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
