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
import {
  displaySavedAddressTypeLabel,
  readSavedLocationCustomLabelFromUserDoc,
  readSavedLocationLabelFromUserDoc,
} from '@/lib/location/userLocationLabel';
import {
  fetchSavedLocationFromServer,
  saveAccountSavedLocation,
} from '@/services/location/savedLocationFirestore';
import {
  doc,
  getDoc,
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
  phone: string;
  phoneNumber: string;
};

export async function fetchCheckoutCustomerSnapshot(
  uid: string,
): Promise<CheckoutCustomerSnapshot> {
  const snap = await getDoc(doc(db, 'users', uid));
  const data = snap.data() as Record<string, unknown> | undefined;
  const phone =
    asStr(data?.phone) ||
    asStr(data?.phoneNumber) ||
    asStr(data?.whatsapp) ||
    '';
  return {
    deliveryPrefs: parseCheckoutDeliveryPrefs(data?.checkoutDeliveryPrefs),
    addressBook: parseCheckoutAddressBook(data?.checkoutAddressBook),
    phone,
    phoneNumber: asStr(data?.phoneNumber) || phone,
  };
}

export function subscribeCheckoutCustomerSnapshot(
  uid: string,
  onChange: (snap: CheckoutCustomerSnapshot) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', uid),
    (docSnap) => {
      const data = docSnap.data() as Record<string, unknown> | undefined;
      const phone =
        asStr(data?.phone) ||
        asStr(data?.phoneNumber) ||
        asStr(data?.whatsapp) ||
        '';
      onChange({
        deliveryPrefs: parseCheckoutDeliveryPrefs(data?.checkoutDeliveryPrefs),
        addressBook: parseCheckoutAddressBook(data?.checkoutAddressBook),
        phone,
        phoneNumber: asStr(data?.phoneNumber) || phone,
      });
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
): Promise<void> {
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

  if (defaultEntry) {
    // Preserve address type / custom label already on the customer profile.
    const snap = await getDoc(doc(db, 'users', uid));
    const data = snap.exists() ? (snap.data() as Record<string, unknown>) : undefined;
    const existingLabel = readSavedLocationLabelFromUserDoc(data);
    const existingCustom = readSavedLocationCustomLabelFromUserDoc(data);
    await saveAccountSavedLocation('users', uid, toSavedLocation(defaultEntry), {
      role: 'user',
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

export function defaultCheckoutAddress(
  book: CheckoutAddressBookEntry[],
): CheckoutAddressBookEntry | null {
  return book.find((e) => e.isDefault) ?? book[0] ?? null;
}

/** Keep address book in sync with the canonical profile `location` after `/location` edits. */
export async function syncProfileLocationToAddressBook(
  uid: string,
): Promise<CheckoutAddressBookEntry[]> {
  const saved = await fetchSavedLocationFromServer('users', uid);
  const snap = await fetchCheckoutCustomerSnapshot(uid);
  if (!saved.location) return snap.addressBook;
  const displayLabel =
    displaySavedAddressTypeLabel(saved.label, saved.customLabel) || 'Home';
  const def = defaultCheckoutAddress(snap.addressBook);
  if (def) {
    return upsertCheckoutAddress(uid, {
      id: def.id,
      location: saved.location,
      label: displayLabel,
      makeDefault: true,
    });
  }
  return upsertCheckoutAddress(uid, {
    location: saved.location,
    label: displayLabel,
    makeDefault: true,
  });
}
