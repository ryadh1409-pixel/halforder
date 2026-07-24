import { formatCad } from '@/lib/restaurantStoreMetrics';

export const DEFAULT_TAX_RATE = 0.13;

export type OrderPricingInput = {
  foodSubtotal: number;
  deliveryFee: number;
  serviceFee: number;
  promoDiscount?: number;
  taxRate?: number;
};

export type OrderPricingBreakdown = {
  foodSubtotal: number;
  deliveryFee: number;
  serviceFee: number;
  promoDiscount: number;
  taxRate: number;
  hst: number;
  totalPaid: number;
};

function roundMoney(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100;
}

/** Uber Eats–style order pricing (CAD). Tax applies after promo. */
export function computeOrderPricing(
  input: OrderPricingInput,
): OrderPricingBreakdown {
  const foodSubtotal = roundMoney(input.foodSubtotal);
  const deliveryFee = roundMoney(input.deliveryFee);
  const serviceFee = roundMoney(input.serviceFee);
  const promoDiscount = roundMoney(input.promoDiscount ?? 0);
  const taxRate =
    typeof input.taxRate === 'number' && Number.isFinite(input.taxRate)
      ? Math.max(0, input.taxRate)
      : DEFAULT_TAX_RATE;

  const taxable = Math.max(
    0,
    foodSubtotal + deliveryFee + serviceFee - promoDiscount,
  );
  const hst = roundMoney(taxable * taxRate);
  const totalPaid = roundMoney(taxable + hst);

  return {
    foodSubtotal,
    deliveryFee,
    serviceFee,
    promoDiscount,
    taxRate,
    hst,
    totalPaid,
  };
}

export function formatHstLabel(taxRate: number): string {
  const pct = Math.round(taxRate * 1000) / 10;
  const label = Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
  return `HST (${label}%)`;
}

export function moneyLabel(amount: number): string {
  return formatCad(amount);
}

/** Delivery / service fee display — FREE when waived (promo or zero). */
export function feeOrFreeLabel(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return 'FREE';
  return formatCad(amount);
}

/** Stable receipt number from order/payment id (display only). */
export function receiptNumberFromId(id: string | null | undefined): string {
  const raw = (id ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (raw.length >= 8) return `HO-${raw.slice(-8)}`;
  if (raw.length > 0) return `HO-${raw.padStart(8, '0')}`;
  return '—';
}
