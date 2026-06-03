import { serverTimestamp } from 'firebase/firestore';

import type { CustomerLocationRecord } from '@/types/location';

export function buildCustomerLocationRecord(
  latitude: number,
  longitude: number,
): CustomerLocationRecord {
  return {
    latitude,
    longitude,
    timestamp: serverTimestamp(),
  };
}
