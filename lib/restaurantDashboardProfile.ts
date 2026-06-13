import { formatProfileWhatsAppDisplay } from '@/lib/profileWhatsAppPhone';

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return null;
}

export function resolveRestaurantLogoUrl(
  data: Record<string, unknown> | null | undefined,
): string | null {
  if (!data) return null;
  return pickString(data.logoUrl, data.logo, data.image);
}

export function resolveRestaurantDisplayName(
  data: Record<string, unknown> | null | undefined,
): string {
  if (!data) return 'Restaurant';
  return pickString(data.name, data.restaurantName) ?? 'Restaurant';
}

export function resolveRestaurantPhoneNumber(
  data: Record<string, unknown> | null | undefined,
  userDoc?: Record<string, unknown> | null,
): string | null {
  return pickString(
    data?.phoneNumber,
    data?.phone,
    userDoc?.phoneNumber,
    userDoc?.phone,
    userDoc?.whatsapp,
  );
}

/** Restaurant dashboard display — doc phone first, then Firebase Auth phone. */
export function resolveRestaurantProfilePhone(params: {
  restaurantData?: Record<string, unknown> | null;
  authPhoneNumber?: string | null;
}): string | null {
  return pickString(
    params.restaurantData?.phoneNumber,
    params.restaurantData?.phone,
    params.authPhoneNumber,
  );
}

export function formatRestaurantPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return 'No phone number';
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 10) {
    return formatProfileWhatsAppDisplay(digits);
  }
  return phone;
}
