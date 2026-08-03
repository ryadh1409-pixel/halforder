/**
 * HalfOrder Partner Wallet — Restaurant & Driver only.
 * Independent from customer wallet, Stripe, cashback, and earnings ledgers.
 */

export type PartnerWalletOwnerType = 'restaurant' | 'driver';

export type HalfOrderPartnerWallet = {
  ownerType: PartnerWalletOwnerType;
  ownerId: string;
  /** Current HalfOrder balance (credits only). */
  currentBalance: number;
  /** Firestore server timestamp of last balance change. */
  updatedAt: unknown;
  createdAt?: unknown;
};

export type HalfOrderPartnerWalletCredit = {
  id: string;
  walletId: string;
  ownerType: PartnerWalletOwnerType;
  ownerId: string;
  /** Positive credit amount, or abs(adjustment) for balance edits. */
  amount: number;
  balanceAfter: number;
  /** Optional linked order / delivery id. */
  orderId: string | null;
  note: string | null;
  description: string;
  /** Firestore server timestamp — never client Date.now() for event time. */
  createdAt: unknown;
  /** Present on admin direct balance edits. */
  type?: 'admin_balance_adjustment' | 'credit' | null;
  previousBalance?: number | null;
  newBalance?: number | null;
  adjustmentAmount?: number | null;
  reason?: string | null;
  adminUid?: string | null;
};

export function partnerWalletDocId(
  ownerType: PartnerWalletOwnerType,
  ownerId: string,
): string {
  return `${ownerType}_${ownerId}`;
}
