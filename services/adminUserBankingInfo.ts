/**
 * Read-only normalizer for the Admin → Users "Bank & Payout Information" card.
 *
 * Operates on the `users/{uid}` document the admin screen already subscribes to,
 * so it performs no additional Firestore reads and needs no rules changes.
 *
 * Security: secrets, tokens, CVV/CVC and encrypted blobs are never returned, and
 * card numbers are reduced to their last 4 digits before leaving this module.
 */
import { firestoreTimeToMs } from '@/lib/admin/orderHelpers';

export type AdminUserBankingInfo = {
  accountHolderName: string | null;
  bankName: string | null;
  iban: string | null;
  accountNumber: string | null;
  routingNumber: string | null;
  swift: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  verified: boolean | null;
  addedAtMs: number | null;
};

/** Keys that must never reach the UI, regardless of nesting. */
const FORBIDDEN_KEY_RE =
  /(cvv|cvc|secret|token|password|passcode|\bpin\b|apikey|api_key|privatekey|private_key)/i;

/** Containers that may hold saved payout details on the user document. */
const CONTAINER_KEYS = [
  'bankInfo',
  'bankDetails',
  'bankAccount',
  'banking',
  'payoutInfo',
  'payoutDetails',
  'payoutMethod',
  'payout',
] as const;

const FIELD_ALIASES = {
  accountHolderName: [
    'accountHolderName',
    'accountHolder',
    'holderName',
    'beneficiaryName',
    'accountName',
    'bankAccountHolder',
  ],
  bankName: ['bankName', 'bank', 'institutionName', 'bankInstitution'],
  iban: ['iban'],
  accountNumber: [
    'accountNumber',
    'bankAccountNumber',
    'accountNo',
    'accountNum',
  ],
  routingNumber: [
    'routingNumber',
    'routing',
    'transitNumber',
    'institutionNumber',
    'sortCode',
    'aba',
  ],
  swift: ['swift', 'swiftCode', 'bic', 'swiftBic', 'bicCode'],
  cardBrand: ['cardBrand', 'paymentMethodBrand', 'brand'],
  cardLast4: ['cardLast4', 'paymentMethodLast4', 'last4', 'cardNumber'],
} as const;

const VERIFIED_ALIASES = [
  'verified',
  'isVerified',
  'bankVerified',
  'payoutVerified',
  'payoutsEnabled',
] as const;

const ADDED_AT_ALIASES = [
  'addedAt',
  'linkedAt',
  'bankAddedAt',
  'payoutAddedAt',
  'createdAt',
  'updatedAt',
] as const;

function isEncryptedLooking(value: string): boolean {
  if (/^(enc|encrypted|cipher|vault):/i.test(value)) return true;
  // Long opaque blobs (base64 / hex ciphertext) are never human-readable bank data.
  if (value.length > 64 && !/\s/.test(value)) return true;
  return false;
}

/** Trimmed, display-safe string — or `null` when unusable. */
function safeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isEncryptedLooking(trimmed)) return null;
  return trimmed;
}

function readField(
  sources: Record<string, unknown>[],
  aliases: readonly string[],
): string | null {
  for (const source of sources) {
    for (const alias of aliases) {
      if (FORBIDDEN_KEY_RE.test(alias)) continue;
      const found = safeString(source[alias]);
      if (found) return found;
    }
  }
  return null;
}

function readBoolean(
  sources: Record<string, unknown>[],
  aliases: readonly string[],
): boolean | null {
  for (const source of sources) {
    for (const alias of aliases) {
      const raw = source[alias];
      if (typeof raw === 'boolean') return raw;
    }
  }
  return null;
}

function readTimestampMs(
  sources: Record<string, unknown>[],
  aliases: readonly string[],
): number | null {
  for (const source of sources) {
    for (const alias of aliases) {
      const ms = firestoreTimeToMs(source[alias]);
      if (ms != null) return ms;
    }
  }
  return null;
}

/** Never let a full PAN escape: keep the final 4 digits only. */
function toLast4(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  return digits.slice(-4);
}

function normalizeCardBrand(value: string | null): string | null {
  if (!value) return null;
  const brand = value.toLowerCase();
  if (brand === 'visa') return 'Visa';
  if (brand === 'mastercard' || brand === 'master_card') return 'Mastercard';
  if (brand === 'amex' || brand === 'american_express' || brand === 'american express') {
    return 'Amex';
  }
  if (brand === 'discover') return 'Discover';
  if (brand === 'card') return null;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Extract payout details from a user document.
 * @returns `null` when the user has no saved payment or payout information.
 */
export function extractAdminUserBankingInfo(
  profile: Record<string, unknown> | null | undefined,
): AdminUserBankingInfo | null {
  if (!profile) return null;

  const containers: Record<string, unknown>[] = [];
  for (const key of CONTAINER_KEYS) {
    const raw = profile[key];
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      containers.push(raw as Record<string, unknown>);
    }
  }
  // Nested containers win over loose top-level fields.
  const sources = [...containers, profile];

  const cardSource = profile.card;
  if (cardSource && typeof cardSource === 'object' && !Array.isArray(cardSource)) {
    sources.unshift(cardSource as Record<string, unknown>);
  }

  const info: AdminUserBankingInfo = {
    accountHolderName: readField(sources, FIELD_ALIASES.accountHolderName),
    bankName: readField(sources, FIELD_ALIASES.bankName),
    iban: readField(sources, FIELD_ALIASES.iban),
    accountNumber: readField(sources, FIELD_ALIASES.accountNumber),
    routingNumber: readField(sources, FIELD_ALIASES.routingNumber),
    swift: readField(sources, FIELD_ALIASES.swift),
    cardBrand: normalizeCardBrand(readField(sources, FIELD_ALIASES.cardBrand)),
    cardLast4: toLast4(readField(sources, FIELD_ALIASES.cardLast4)),
    verified: readBoolean(sources, VERIFIED_ALIASES),
    addedAtMs: null,
  };

  const hasAnyDetail =
    info.accountHolderName != null ||
    info.bankName != null ||
    info.iban != null ||
    info.accountNumber != null ||
    info.routingNumber != null ||
    info.swift != null ||
    info.cardBrand != null ||
    info.cardLast4 != null;

  if (!hasAnyDetail) return null;

  info.addedAtMs = readTimestampMs(
    containers.length > 0 ? [...containers, profile] : [profile],
    ADDED_AT_ALIASES,
  );

  return info;
}
