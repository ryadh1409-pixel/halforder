import type { SavedLocation } from '@/types/savedLocation';

/** Dropoff / delivery preferences stored on `users/{uid}.checkoutDeliveryPrefs`. */
export type CheckoutDeliveryHandoff = 'leave_at_door' | 'hand_it_to_me';

export type CheckoutDeliveryPrefs = {
  apartment: string;
  buzzer: string;
  unit: string;
  floor: string;
  gateCode: string;
  handoff: CheckoutDeliveryHandoff | null;
  notes: string;
};

export const EMPTY_CHECKOUT_DELIVERY_PREFS: CheckoutDeliveryPrefs = {
  apartment: '',
  buzzer: '',
  unit: '',
  floor: '',
  gateCode: '',
  handoff: null,
  notes: '',
};

/** Saved address book entry on `users/{uid}.checkoutAddressBook`. */
export type CheckoutAddressBookEntry = SavedLocation & {
  id: string;
  label: string;
  isDefault: boolean;
};

export function summarizeDeliveryPrefs(prefs: CheckoutDeliveryPrefs): string {
  const parts: string[] = [];
  if (prefs.handoff === 'leave_at_door') parts.push('Leave at door');
  if (prefs.handoff === 'hand_it_to_me') parts.push('Hand it to me');
  if (prefs.apartment.trim()) parts.push(`Apt ${prefs.apartment.trim()}`);
  if (prefs.unit.trim()) parts.push(`Unit ${prefs.unit.trim()}`);
  if (prefs.floor.trim()) parts.push(`Floor ${prefs.floor.trim()}`);
  if (prefs.buzzer.trim()) parts.push(`Buzzer ${prefs.buzzer.trim()}`);
  if (prefs.gateCode.trim()) parts.push(`Gate ${prefs.gateCode.trim()}`);
  if (prefs.notes.trim()) parts.push(prefs.notes.trim());
  return parts.length > 0 ? parts.join(' · ') : 'Add delivery instructions';
}
