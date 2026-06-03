import type { SavedAddressLabel } from '@/types/userLocation';

export type DeliveryAddressType = 'Home' | 'Apartment' | 'Building' | 'Custom';

const LABEL_TO_TYPE: Record<SavedAddressLabel, DeliveryAddressType> = {
  home: 'Home',
  apartment: 'Apartment',
  building: 'Building',
  custom: 'Custom',
};

export function savedAddressLabelToDeliveryType(label: SavedAddressLabel): DeliveryAddressType {
  return LABEL_TO_TYPE[label];
}
