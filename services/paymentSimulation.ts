export type PaymentBreakdown = {
  subtotalPerUser: number;
  hstAmount: number;
  platformFee: number;
  restaurantAmount: number;
  totalPerUser: number;
};

export function calculatePaymentBreakdown(sharedPrice: number): PaymentBreakdown {
  const base = Number.isFinite(sharedPrice) ? Math.max(0, sharedPrice) : 0;
  const hstAmount = Number((base * 0.13).toFixed(2));
  const platformFee = Number((base * 0.07).toFixed(2));
  const restaurantAmount = Number((base - platformFee).toFixed(2));
  const totalPerUser = Number((base + hstAmount).toFixed(2));
  return {
    subtotalPerUser: Number(base.toFixed(2)),
    hstAmount,
    platformFee,
    restaurantAmount,
    totalPerUser,
  };
}
