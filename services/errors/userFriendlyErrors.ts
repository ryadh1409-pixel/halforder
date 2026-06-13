import {
  getReadableErrorMessage,
  type ReadableErrorContext,
} from '@/utils/errorMessages';

export type UserRole = 'customer' | 'driver' | 'restaurant';

export type UserFriendlyErrorOptions = {
  context?: ReadableErrorContext;
  role?: UserRole;
  fallback?: string;
  useAlert?: boolean;
  alertTitle?: string;
};

/** Production-safe order lifecycle copy by actor. */
export const ROLE_ORDER_UPDATE_ERROR = {
  customer:
    'We are having trouble updating your order. Please refresh and try again.',
  driver: 'Unable to update delivery status. Please try again.',
  restaurant: 'Unable to update order status. Please try again.',
} as const;

const ORDER_FAILURE_CODES = new Set([
  'permission-denied',
  'firestore/permission-denied',
  'unavailable',
  'firestore/unavailable',
  'deadline-exceeded',
  'firestore/deadline-exceeded',
  'failed-precondition',
  'firestore/failed-precondition',
  'internal',
  'functions/internal',
  'auth/network-request-failed',
  'network-request-failed',
]);

function normalizeOptions(
  options?: UserFriendlyErrorOptions | ReadableErrorContext,
): UserFriendlyErrorOptions {
  if (typeof options === 'string') {
    return { context: options };
  }
  return options ?? {};
}

function extractCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code.trim() ? code.trim().toLowerCase() : null;
}

function roleOrderFailureMessage(role: UserRole | undefined): string | null {
  if (!role) return null;
  return ROLE_ORDER_UPDATE_ERROR[role];
}

/**
 * Maps Firebase / network / app errors to production-safe user copy.
 * Never returns raw SDK messages, codes, or stack traces.
 */
export function getUserFriendlyError(
  error: unknown,
  options?: UserFriendlyErrorOptions | ReadableErrorContext,
): string {
  const opts = normalizeOptions(options);
  const context = opts.context ?? 'default';
  const code = extractCode(error);

  if (
    code &&
    ORDER_FAILURE_CODES.has(code) &&
    (context === 'order' || opts.role)
  ) {
    const roleMessage = roleOrderFailureMessage(opts.role);
    if (roleMessage) return roleMessage;
  }

  const mapped = getReadableErrorMessage(error, context);
  if (mapped) return mapped;
  return opts.fallback ?? 'Something went wrong. Please try again.';
}
