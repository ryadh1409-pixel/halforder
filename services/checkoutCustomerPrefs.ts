/**
 * Checkout customer prefs — delivery instructions + phone on `users/{uid}`.
 * Isolated from payment / Stripe / order pricing.
 */

import {
  EMPTY_CHECKOUT_DELIVERY_PREFS,
  type CheckoutAddressBookEntry,
  type CheckoutDeliveryHandoff,
  type CheckoutDeliveryPrefs,
} from '@/types/checkoutCustomerPrefs';
import type { SavedLocation } from '@/types/savedLocation';
import { db } from '@/services/firebase';
import { logLocationDebug } from '@/lib/location/locationDebugLog';
import {
  displaySavedAddressTypeLabel,
  readSavedLocationCustomLabelFromUserDoc,
  readSavedLocationLabelFromUserDoc,
} from '@/lib/location/userLocationLabel';
import {
  fetchSavedLocationFromServer,
  readSavedLocationFromDoc,
  saveAccountSavedLocation,
} from '@/services/location/savedLocationFirestore';
import {
  doc,
  getDoc,
  getDocFromServer,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';

function asStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function parseHandoff(v: unknown): CheckoutDeliveryHandoff | null {
  if (v === 'leave_at_door' || v === 'hand_it_to_me') return v;
  return null;
}

export function parseCheckoutDeliveryPrefs(
  raw: unknown,
): CheckoutDeliveryPrefs {
  if (!raw || typeof raw !== 'object') {
    return { ...EMPTY_CHECKOUT_DELIVERY_PREFS };
  }
  const d = raw as Record<string, unknown>;
  return {
    apartment: asStr(d.apartment),
    buzzer: asStr(d.buzzer),
    unit: asStr(d.unit),
    floor: asStr(d.floor),
    gateCode: asStr(d.gateCode),
    handoff: parseHandoff(d.handoff),
    notes: asStr(d.notes),
  };
}

function parseAddressEntry(raw: unknown): CheckoutAddressBookEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const id = asStr(d.id);
  const address = asStr(d.address) || asStr(d.formattedAddress);
  const lat = typeof d.latitude === 'number' ? d.latitude : Number(d.lat);
  const lng = typeof d.longitude === 'number' ? d.longitude : Number(d.lng);
  if (!id || !address || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return {
    id,
    address,
    formattedAddress: asStr(d.formattedAddress) || address,
    latitude: lat,
    longitude: lng,
    placeId: asStr(d.placeId) || undefined,
    city: asStr(d.city) || undefined,
    province: asStr(d.province) || undefined,
    country: asStr(d.country) || undefined,
    postalCode: asStr(d.postalCode) || undefined,
    label: asStr(d.label) || 'Address',
    isDefault: d.isDefault === true,
  };
}

export function parseCheckoutAddressBook(raw: unknown): CheckoutAddressBookEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(parseAddressEntry)
    .filter((e): e is CheckoutAddressBookEntry => e != null);
}

export type CheckoutCustomerSnapshot = {
  deliveryPrefs: CheckoutDeliveryPrefs;
  addressBook: CheckoutAddressBookEntry[];
  /**
   * Canonical delivery pin from `users/{uid}.location` (+ denorm fields).
   * Checkout display and order creation must prefer this over addressBook.
   */
  profileDeliveryLocation: SavedLocation | null;
  phone: string;
  phoneNumber: string;
};

function snapshotFromUserData(
  data: Record<string, unknown> | undefined,
): CheckoutCustomerSnapshot {
  const phone =
    asStr(data?.phone) ||
    asStr(data?.phoneNumber) ||
    asStr(data?.whatsapp) ||
    '';
  return {
    deliveryPrefs: parseCheckoutDeliveryPrefs(data?.checkoutDeliveryPrefs),
    addressBook: parseCheckoutAddressBook(data?.checkoutAddressBook),
    profileDeliveryLocation: readSavedLocationFromDoc(data),
    phone,
    phoneNumber: asStr(data?.phoneNumber) || phone,
  };
}

export async function fetchCheckoutCustomerSnapshot(
  uid: string,
): Promise<CheckoutCustomerSnapshot> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snapshotFromUserData(
    snap.data() as Record<string, unknown> | undefined,
  );
}

/** Force-refresh from Firestore server — bypasses local persistence cache. */
export async function fetchCheckoutCustomerSnapshotFromServer(
  uid: string,
): Promise<CheckoutCustomerSnapshot> {
  const snap = await getDocFromServer(doc(db, 'users', uid));
  const result = snapshotFromUserData(
    snap.data() as Record<string, unknown> | undefined,
  );
  logLocationDebug('[CHECKOUT LOAD]', {
    source: 'users/{uid} getDocFromServer',
    documentPath: `users/${uid}`,
    address: result.profileDeliveryLocation?.address ?? null,
    coordinates: result.profileDeliveryLocation
      ? {
          lat: result.profileDeliveryLocation.latitude,
          lng: result.profileDeliveryLocation.longitude,
        }
      : null,
    addressBookCount: result.addressBook.length,
  });
  return result;
}

export function subscribeCheckoutCustomerSnapshot(
  uid: string,
  onChange: (snap: CheckoutCustomerSnapshot) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', uid),
    (docSnap) => {
      const result = snapshotFromUserData(
        docSnap.data() as Record<string, unknown> | undefined,
      );
      logLocationDebug('[CHECKOUT LOAD]', {
        source: 'users/{uid} onSnapshot',
        documentPath: `users/${uid}`,
        address: result.profileDeliveryLocation?.address ?? null,
        coordinates: result.profileDeliveryLocation
          ? {
              lat: result.profileDeliveryLocation.latitude,
              lng: result.profileDeliveryLocation.longitude,
            }
          : null,
        addressBookCount: result.addressBook.length,
      });
      onChange(result);
    },
    (err) => onError?.(err),
  );
}

export async function saveCheckoutDeliveryPrefs(
  uid: string,
  prefs: CheckoutDeliveryPrefs,
): Promise<void> {
  await setDoc(
    doc(db, 'users', uid),
    {
      checkoutDeliveryPrefs: {
        apartment: prefs.apartment.trim(),
        buzzer: prefs.buzzer.trim(),
        unit: prefs.unit.trim(),
        floor: prefs.floor.trim(),
        gateCode: prefs.gateCode.trim(),
        handoff: prefs.handoff,
        notes: prefs.notes.trim(),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function saveCheckoutPhone(
  uid: string,
  phoneDisplay: string,
): Promise<void> {
  const value = phoneDisplay.trim();
  await setDoc(
    doc(db, 'users', uid),
    {
      phone: value,
      phoneNumber: value,
      whatsapp: value,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

function newAddressId(): string {
  return `addr_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function toSavedLocation(entry: CheckoutAddressBookEntry): SavedLocation {
  return {
    address: entry.address,
    formattedAddress: entry.formattedAddress ?? entry.address,
    latitude: entry.latitude,
    longitude: entry.longitude,
    placeId: entry.placeId,
    city: entry.city,
    province: entry.province,
    country: entry.country,
    postalCode: entry.postalCode,
  };
}

async function writeAddressBook(
  uid: string,
  book: CheckoutAddressBookEntry[],
  options?: { mirrorDefaultToProfile?: boolean },
): Promise<void> {
  const mirrorDefaultToProfile = options?.mirrorDefaultToProfile !== false;
  const normalized = book.map((e) => ({
    ...e,
    isDefault: e.isDefault === true,
  }));
  if (normalized.length > 0 && !normalized.some((e) => e.isDefault)) {
    normalized[0] = { ...normalized[0], isDefault: true };
  }
  const defaultEntry = normalized.find((e) => e.isDefault) ?? null;

  await setDoc(
    doc(db, 'users', uid),
    {
      checkoutAddressBook: normalized,
      defaultCheckoutAddressId: defaultEntry?.id ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  if (defaultEntry && mirrorDefaultToProfile) {
    // Preserve address type / custom label already on the customer profile.
    const snap = await getDoc(doc(db, 'users', uid));
    const data = snap.exists() ? (snap.data() as Record<string, unknown>) : undefined;
    const existingLabel = readSavedLocationLabelFromUserDoc(data);
    const existingCustom = readSavedLocationCustomLabelFromUserDoc(data);
    await saveAccountSavedLocation('users', uid, toSavedLocation(defaultEntry), {
      role: 'user',
      skipAddressBookSync: true,
      ...(existingLabel
        ? {
            label: existingLabel,
            customLabel: existingLabel === 'custom' ? existingCustom : null,
          }
        : {}),
    });
  }
}

export async function upsertCheckoutAddress(
  uid: string,
  input: {
    id?: string;
    location: SavedLocation;
    label?: string;
    makeDefault?: boolean;
  },
): Promise<CheckoutAddressBookEntry[]> {
  const snap = await fetchCheckoutCustomerSnapshot(uid);
  const id = input.id?.trim() || newAddressId();
  const makeDefault =
    input.makeDefault === true ||
    snap.addressBook.length === 0 ||
    snap.addressBook.every((e) => !e.isDefault);

  let book = snap.addressBook.map((e) =>
    makeDefault ? { ...e, isDefault: false } : e,
  );
  const next: CheckoutAddressBookEntry = {
    id,
    address: input.location.address,
    formattedAddress: input.location.formattedAddress ?? input.location.address,
    latitude: input.location.latitude,
    longitude: input.location.longitude,
    placeId: input.location.placeId,
    city: input.location.city,
    province: input.location.province,
    country: input.location.country,
    postalCode: input.location.postalCode,
    label: (input.label ?? 'Address').trim() || 'Address',
    isDefault: makeDefault,
  };
  const idx = book.findIndex((e) => e.id === id);
  if (idx >= 0) book[idx] = next;
  else book = [...book, next];

  await writeAddressBook(uid, book);
  return book;
}

export async function setDefaultCheckoutAddress(
  uid: string,
  addressId: string,
): Promise<CheckoutAddressBookEntry[]> {
  const snap = await fetchCheckoutCustomerSnapshot(uid);
  const book = snap.addressBook.map((e) => ({
    ...e,
    isDefault: e.id === addressId,
  }));
  if (!book.some((e) => e.isDefault)) {
    throw new Error('Address not found.');
  }
  await writeAddressBook(uid, book);
  return book;
}

export async function deleteCheckoutAddress(
  uid: string,
  addressId: string,
): Promise<CheckoutAddressBookEntry[]> {
  const snap = await fetchCheckoutCustomerSnapshot(uid);
  const wasDefault = snap.addressBook.some(
    (e) => e.id === addressId && e.isDefault,
  );
  let book = snap.addressBook.filter((e) => e.id !== addressId);
  if (wasDefault && book.length > 0) {
    book = book.map((e, i) => ({ ...e, isDefault: i === 0 }));
  }
  await writeAddressBook(uid, book);
  return book;
}

/**
 * Build the checkout display/order address from the canonical profile pin.
 * Address-book metadata (id/label) is retained when present; coordinates/address
 * always come from `users.location`.
 */
export function resolveCheckoutDeliveryAddress(input: {
  profileDeliveryLocation: SavedLocation | null;
  addressBook: CheckoutAddressBookEntry[];
}): CheckoutAddressBookEntry | null {
  const profile = input.profileDeliveryLocation;
  if (!profile?.address?.trim()) {
    return defaultCheckoutAddress(input.addressBook);
  }
  const bookDefault = defaultCheckoutAddress(input.addressBook);
  return {
    id: bookDefault?.id ?? 'profile_delivery',
    address: profile.address,
    formattedAddress: profile.formattedAddress ?? profile.address,
    latitude: profile.latitude,
    longitude: profile.longitude,
    placeId: profile.placeId,
    city: profile.city,
    province: profile.province,
    country: profile.country,
    postalCode: profile.postalCode,
    label: bookDefault?.label ?? 'Home',
    isDefault: true,
  };
}

export function defaultCheckoutAddress(
  book: CheckoutAddressBookEntry[],
): CheckoutAddressBookEntry | null {
  return book.find((e) => e.isDefault) ?? book[0] ?? null;
}

/**
 * True when the address-book default already mirrors the profile pin.
 */
function addressBookMatchesProfile(
  book: CheckoutAddressBookEntry[],
  profile: SavedLocation,
): boolean {
  const def = defaultCheckoutAddress(book);
  if (!def) return false;
  const sameAddress =
    def.address.trim() === profile.address.trim() ||
    (def.formattedAddress ?? '').trim() ===
      (profile.formattedAddress ?? profile.address).trim();
  const sameCoords =
    Math.abs(def.latitude - profile.latitude) < 1e-7 &&
    Math.abs(def.longitude - profile.longitude) < 1e-7;
  return sameAddress && sameCoords;
}

/** Keep address book in sync with the canonical profile `location` after `/location` edits. */
export async function syncProfileLocationToAddressBook(
  uid: string,
): Promise<CheckoutAddressBookEntry[]> {
  const id = uid.trim();
  if (!id) return [];

  const saved = await fetchSavedLocationFromServer('users', id);
  const snap = await fetchCheckoutCustomerSnapshot(id);
  if (!saved.location) {
    logLocationDebug('[LOCATION SYNC] profile→addressBook skipped (no profile location)', {
      uid: id,
      bookCount: snap.addressBook.length,
    });
    return snap.addressBook;
  }

  if (addressBookMatchesProfile(snap.addressBook, saved.location)) {
    logLocationDebug('[LOCATION SYNC] address book already matches profile', {
      uid: id,
      address: saved.location.address,
    });
    return snap.addressBook;
  }

  const displayLabel =
    displaySavedAddressTypeLabel(saved.label, saved.customLabel) || 'Home';
  const def = defaultCheckoutAddress(snap.addressBook);
  const idToUse = def?.id?.trim() || newAddressId();
  const next: CheckoutAddressBookEntry = {
    id: idToUse,
    address: saved.location.address,
    formattedAddress:
      saved.location.formattedAddress ?? saved.location.address,
    latitude: saved.location.latitude,
    longitude: saved.location.longitude,
    placeId: saved.location.placeId,
    city: saved.location.city,
    province: saved.location.province,
    country: saved.location.country,
    postalCode: saved.location.postalCode,
    label: displayLabel,
    isDefault: true,
  };

  let book = snap.addressBook.map((e) => ({ ...e, isDefault: false }));
  const idx = book.findIndex((e) => e.id === idToUse);
  if (idx >= 0) book[idx] = next;
  else book = [...book, next];

  // Profile is already SSOT — do not mirror book back into profile (avoids loops).
  await writeAddressBook(id, book, { mirrorDefaultToProfile: false });
  logLocationDebug('[LOCATION SYNC] profile→addressBook', {
    uid: id,
    address: next.address,
    entryId: next.id,
    bookCount: book.length,
  });
  return book;
}
