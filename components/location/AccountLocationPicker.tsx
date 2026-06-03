import React from 'react';

import { LocationSearchInput } from '@/components/location/LocationSearchInput';
import type { LocationPalette } from '@/components/location/locationPalette';
import {
  getAccountLocationRoleConfig,
  type AccountLocationRole,
} from '@/services/location/accountLocationRole';

type Props = {
  role: AccountLocationRole;
  accountId: string | null;
  palette: LocationPalette;
  title?: string;
  hint?: string;
  signedOutHint?: string;
  saveSuccessMessage?: string;
};

/**
 * Unified production location picker for users, drivers, and restaurants.
 * Google Places search, live GPS, reverse geocode, Firestore sync — one implementation.
 */
export function AccountLocationPicker({
  role,
  accountId,
  palette,
  title,
  hint,
  signedOutHint,
  saveSuccessMessage,
}: Props) {
  const config = getAccountLocationRoleConfig(role);

  return (
    <LocationSearchInput
      role={role}
      accountId={accountId}
      collection={config.collection}
      palette={palette}
      title={title ?? config.title}
      hint={hint ?? config.hint}
      signedOutHint={signedOutHint ?? config.signedOutHint}
      saveSuccessMessage={saveSuccessMessage ?? config.saveSuccessMessage}
      showAddressLabels={config.showAddressLabels}
      deliveryMode={config.deliveryMode}
    />
  );
}
