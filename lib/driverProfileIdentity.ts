import {
  displayFromStoredProfilePhone,
  formatProfileWhatsAppDisplay,
} from '@/lib/profileWhatsAppPhone';
import type { User } from 'firebase/auth';
import type { DocumentData } from 'firebase/firestore';

export type DriverProfileIdentitySources = {
  authUser: User | null;
  userDoc: DocumentData | undefined;
  driverDoc: DocumentData | undefined;
};

export type ResolvedDriverProfileIdentity = {
  displayName: string;
  phoneRaw: string | null;
  phoneDisplay: string;
  photoURL: string | null;
};

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return null;
}

/** Reject Google Places / map imagery accidentally stored as profile photos. */
export function isTrustedDriverProfilePhotoUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const normalized = url.trim().toLowerCase();
  if (!normalized.startsWith('http')) return false;
  if (normalized.includes('maps.googleapis.com/maps/api/place/photo')) return false;
  if (normalized.includes('/maps/api/place/photo')) return false;
  if (normalized.includes('streetview')) return false;
  if (normalized.includes('staticmap')) return false;
  if (normalized.includes('firebasestorage.googleapis.com')) return true;
  if (normalized.includes('googleusercontent.com')) return true;
  if (normalized.includes('/profiles/')) return true;
  return false;
}

function resolvePhotoFromSources(sources: DriverProfileIdentitySources): string | null {
  const { authUser, userDoc, driverDoc } = sources;
  const candidates = [
    userDoc?.photo,
    userDoc?.photoURL,
    userDoc?.avatar,
    driverDoc?.photoURL,
    driverDoc?.avatar,
    driverDoc?.photo,
    authUser?.photoURL,
  ];
  for (const candidate of candidates) {
    const url = pickString(candidate);
    if (url && isTrustedDriverProfilePhotoUrl(url)) {
      return url;
    }
  }
  return null;
}

export function resolveDriverProfilePhone(
  sources: DriverProfileIdentitySources,
): string | null {
  const { authUser, userDoc, driverDoc } = sources;
  return pickString(
    userDoc?.phone,
    userDoc?.phoneNumber,
    userDoc?.whatsapp,
    driverDoc?.phone,
    driverDoc?.phoneNumber,
    authUser?.phoneNumber,
  );
}

export function formatDriverProfilePhoneDisplay(phoneRaw: string | null): string {
  if (!phoneRaw) return 'Add phone number';
  const digits = phoneRaw.replace(/\D/g, '');
  if (digits.length >= 10) {
    return formatProfileWhatsAppDisplay(digits);
  }
  return displayFromStoredProfilePhone(phoneRaw);
}

export function resolveDriverProfileIdentity(
  sources: DriverProfileIdentitySources,
): ResolvedDriverProfileIdentity {
  const { authUser, userDoc, driverDoc } = sources;
  const displayName =
    pickString(driverDoc?.name, userDoc?.name, userDoc?.displayName, authUser?.displayName) ??
    'Driver';
  const phoneRaw = resolveDriverProfilePhone(sources);
  return {
    displayName,
    phoneRaw,
    phoneDisplay: formatDriverProfilePhoneDisplay(phoneRaw),
    photoURL: resolvePhotoFromSources(sources),
  };
}
