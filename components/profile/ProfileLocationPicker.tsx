import React from 'react';

import { AccountLocationPicker } from '@/components/location/AccountLocationPicker';
import type { LocationPalette } from '@/components/location/locationPalette';

type Props = {
  userId: string | null;
  palette: LocationPalette;
};

export function ProfileLocationPicker({ userId, palette }: Props) {
  return <AccountLocationPicker role="user" accountId={userId} palette={palette} />;
}
