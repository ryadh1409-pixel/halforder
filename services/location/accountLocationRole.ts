import { logLocationDebug } from '@/lib/location/locationDebugLog';
import type { AccountLocationCollection } from '@/types/savedLocation';

export type AccountLocationRole = 'user' | 'driver' | 'restaurant';

export type AccountLocationRoleConfig = {
  role: AccountLocationRole;
  collection: AccountLocationCollection;
  logTag: '[USER GPS]' | '[DRIVER GPS]' | '[RESTAURANT GPS]';
  title: string;
  hint: string;
  signedOutHint: string;
  saveSuccessMessage: string;
  showAddressLabels: boolean;
  deliveryMode: boolean;
};

const ROLE_CONFIG: Record<AccountLocationRole, AccountLocationRoleConfig> = {
  user: {
    role: 'user',
    collection: 'users',
    logTag: '[USER GPS]',
    title: 'Delivery address',
    hint: 'Search your address with Google Places, or use GPS for your current location.',
    signedOutHint: 'Sign in to save your delivery address.',
    saveSuccessMessage: 'Delivery address saved',
    showAddressLabels: true,
    deliveryMode: true,
  },
  driver: {
    role: 'driver',
    collection: 'drivers',
    logTag: '[DRIVER GPS]',
    title: 'Home base',
    hint: 'Search your starting area or use live GPS for dispatch and route planning.',
    signedOutHint: 'Sign in to save your driver location.',
    saveSuccessMessage: 'Driver location saved',
    showAddressLabels: false,
    deliveryMode: false,
  },
  restaurant: {
    role: 'restaurant',
    collection: 'restaurants',
    logTag: '[RESTAURANT GPS]',
    title: 'Venue location',
    hint: 'Search your business address with Google Places, or use GPS for setup.',
    signedOutHint: 'Sign in to save your venue location.',
    saveSuccessMessage: 'Venue location saved',
    showAddressLabels: false,
    deliveryMode: false,
  },
};

export function getAccountLocationRoleConfig(
  role: AccountLocationRole,
): AccountLocationRoleConfig {
  return ROLE_CONFIG[role];
}

export function logRoleGps(
  role: AccountLocationRole,
  event: string,
  payload?: Record<string, unknown>,
): void {
  const tag = getAccountLocationRoleConfig(role).logTag;
  logLocationDebug(tag, payload ? { event, ...payload } : { event });
}
