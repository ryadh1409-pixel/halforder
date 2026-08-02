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
  /** Always a positive credit amount. */
  amount: number;
  balanceAfter: number;
  /** Optional linked order / delivery id. */
  orderId: string | null;
  note: string | null;
  description: string;
  /** Firestore server timestamp — never client Date.now() for event time. */
  createdAt: unknown;
};

export function partnerWalletDocId(
  ownerType: PartnerWalletOwnerType,
  ownerId: string,
): string {
  return `${ownerType}_${ownerId}`;
}
