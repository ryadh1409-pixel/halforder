/**
 * HalfOrder Partner Wallet (Restaurant / Driver).
 * Admin credits only — isolated from customer payments & earnings ledgers.
 */

import { db } from '@/services/firebase';
import {
  partnerWalletDocId,
  type HalfOrderPartnerWallet,
  type HalfOrderPartnerWalletCredit,
  type PartnerWalletOwnerType,
} from '@/types/halfOrderPartnerWallet';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

export const PARTNER_WALLETS_COLLECTION = 'halfOrderPartnerWallets';
export const PARTNER_WALLET_CREDITS_COLLECTION = 'halfOrderPartnerWalletCredits';

function money(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function emptyWallet(
  ownerType: PartnerWalletOwnerType,
  ownerId: string,
): HalfOrderPartnerWallet {
  return {
    ownerType,
    ownerId,
    currentBalance: 0,
    updatedAt: null,
  };
}

function mapWallet(
  data: Record<string, unknown> | undefined,
  ownerType: PartnerWalletOwnerType,
  ownerId: string,
): HalfOrderPartnerWallet {
  if (!data) return emptyWallet(ownerType, ownerId);
  return {
    ownerType: (data.ownerType as PartnerWalletOwnerType) || ownerType,
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : ownerId,
    currentBalance: money(Number(data.currentBalance ?? 0)),
    updatedAt: data.updatedAt ?? null,
    createdAt: data.createdAt ?? null,
  };
}

function mapCredit(
  id: string,
  data: Record<string, unknown>,
): HalfOrderPartnerWalletCredit {
  return {
    id,
    walletId: String(data.walletId ?? ''),
    ownerType: data.ownerType as PartnerWalletOwnerType,
    ownerId: String(data.ownerId ?? ''),
    amount: money(Number(data.amount ?? 0)),
    balanceAfter: money(Number(data.balanceAfter ?? 0)),
    orderId: data.orderId == null || data.orderId === '' ? null : String(data.orderId),
    note: data.note == null || data.note === '' ? null : String(data.note),
    description:
      typeof data.description === 'string' && data.description.trim()
        ? data.description.trim()
        : 'Balance added by HalfOrder',
    createdAt: data.createdAt ?? null,
  };
}

export function subscribePartnerWallet(
  ownerType: PartnerWalletOwnerType,
  ownerId: string,
  onChange: (wallet: HalfOrderPartnerWallet) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  const id = partnerWalletDocId(ownerType, ownerId);
  return onSnapshot(
    doc(db, PARTNER_WALLETS_COLLECTION, id),
    (snap) => {
      onChange(
        mapWallet(snap.data() as Record<string, unknown> | undefined, ownerType, ownerId),
      );
    },
    (err) => onError?.(err),
  );
}

export function subscribePartnerWalletCredits(
  ownerType: PartnerWalletOwnerType,
  ownerId: string,
  onChange: (credits: HalfOrderPartnerWalletCredit[]) => void,
  onError?: (err: unknown) => void,
  max = 100,
): Unsubscribe {
  const walletId = partnerWalletDocId(ownerType, ownerId);
  const q = query(
    collection(db, PARTNER_WALLET_CREDITS_COLLECTION),
    where('walletId', '==', walletId),
    orderBy('createdAt', 'desc'),
    limit(max),
  );
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs
          .map((d) => mapCredit(d.id, d.data() as Record<string, unknown>))
          .filter((c) => c.amount > 0),
      );
    },
    (err) => onError?.(err),
  );
}

export async function getPartnerWallet(
  ownerType: PartnerWalletOwnerType,
  ownerId: string,
): Promise<HalfOrderPartnerWallet> {
  const id = partnerWalletDocId(ownerType, ownerId);
  const snap = await getDoc(doc(db, PARTNER_WALLETS_COLLECTION, id));
  return mapWallet(snap.data() as Record<string, unknown> | undefined, ownerType, ownerId);
}

export type SendPartnerBalanceInput = {
  ownerType: PartnerWalletOwnerType;
  ownerId: string;
  amount: number;
  note?: string | null;
  /** Optional order / delivery reference for history. */
  orderId?: string | null;
  actorUid: string;
};

/**
 * HalfOrder credit → Restaurant or Driver wallet.
 * Creates an immutable credit row and updates currentBalance atomically.
 */
export async function sendPartnerWalletBalance(
  input: SendPartnerBalanceInput,
): Promise<{ creditId: string; balanceAfter: number }> {
  const amount = money(input.amount);
  if (!(amount > 0)) throw new Error('Amount must be greater than zero.');
  const ownerId = input.ownerId.trim();
  if (!ownerId) throw new Error('Recipient is required.');

  const walletId = partnerWalletDocId(input.ownerType, ownerId);
  const walletRef = doc(db, PARTNER_WALLETS_COLLECTION, walletId);
  const creditRef = doc(collection(db, PARTNER_WALLET_CREDITS_COLLECTION));
  const note =
    typeof input.note === 'string' && input.note.trim() ? input.note.trim() : null;
  const orderId =
    typeof input.orderId === 'string' && input.orderId.trim()
      ? input.orderId.trim()
      : null;

  let balanceAfter = 0;

  await runTransaction(db, async (tx) => {
    const walletSnap = await tx.get(walletRef);
    const prev = money(Number(walletSnap.data()?.currentBalance ?? 0));
    balanceAfter = money(prev + amount);
    const now = serverTimestamp();

    tx.set(creditRef, {
      walletId,
      ownerType: input.ownerType,
      ownerId,
      amount,
      balanceAfter,
      orderId,
      note,
      description: 'Balance added by HalfOrder',
      createdAt: now,
      createdBy: input.actorUid,
    });

    tx.set(
      walletRef,
      {
        ownerType: input.ownerType,
        ownerId,
        currentBalance: balanceAfter,
        updatedAt: now,
        createdAt: walletSnap.exists()
          ? walletSnap.data()?.createdAt ?? now
          : now,
      },
      { merge: true },
    );
  });

  return { creditId: creditRef.id, balanceAfter };
}

/** Admin list helpers — read-only scans of partner directories. */
export type PartnerWalletListItem = {
  ownerId: string;
  name: string;
  currentBalance: number;
};

export async function listRestaurantWalletSummaries(
  max = 80,
): Promise<PartnerWalletListItem[]> {
  const snap = await getDocs(query(collection(db, 'restaurants'), limit(max)));
  const rows = await Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data() as Record<string, unknown>;
      const ownerId = d.id;
      const name =
        (typeof data.name === 'string' && data.name.trim()) ||
        (typeof data.restaurantName === 'string' && data.restaurantName.trim()) ||
        ownerId;
      const wallet = await getPartnerWallet('restaurant', ownerId);
      return { ownerId, name, currentBalance: wallet.currentBalance };
    }),
  );
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

export async function listDriverWalletSummaries(
  max = 80,
): Promise<PartnerWalletListItem[]> {
  const snap = await getDocs(query(collection(db, 'drivers'), limit(max)));
  const rows = await Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data() as Record<string, unknown>;
      const ownerId = d.id;
      const name =
        (typeof data.name === 'string' && data.name.trim()) ||
        (typeof data.displayName === 'string' && data.displayName.trim()) ||
        (typeof data.fullName === 'string' && data.fullName.trim()) ||
        ownerId;
      const wallet = await getPartnerWallet('driver', ownerId);
      return { ownerId, name, currentBalance: wallet.currentBalance };
    }),
  );
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}
