import type { SavedLocation } from '@/types/savedLocation';

type GoogleAddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

/** Extract city / province / country / postal from Google address_components. */
export function pickSavedLocationFieldsFromComponents(
  components: GoogleAddressComponent[] | undefined,
): Pick<SavedLocation, 'city' | 'province' | 'country' | 'postalCode'> {
  if (!components?.length) return {};

  let city: string | undefined;
  let province: string | undefined;
  let country: string | undefined;
  let postalCode: string | undefined;

  for (const c of components) {
    const types = c.types ?? [];
    const long = c.long_name?.trim();
    const short = c.short_name?.trim();
    if (!long && !short) continue;

    if (!city && (types.includes('locality') || types.includes('postal_town'))) {
      city = long ?? short;
    }
    if (
      !city &&
      types.includes('administrative_area_level_3')
    ) {
      city = long ?? short;
    }
    if (!province && types.includes('administrative_area_level_1')) {
      province = short ?? long;
    }
    if (!country && types.includes('country')) {
      country = long ?? short;
    }
    if (!postalCode && types.includes('postal_code')) {
      postalCode = long ?? short;
    }
  }

  const out: Pick<SavedLocation, 'city' | 'province' | 'country' | 'postalCode'> = {};
  if (city) out.city = city;
  if (province) out.province = province;
  if (country) out.country = country;
  if (postalCode) out.postalCode = postalCode;
  return out;
}
