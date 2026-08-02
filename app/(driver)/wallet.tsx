import { PartnerWalletScreen } from '@/components/partnerWallet/PartnerWalletScreen';
import { useAuth } from '@/services/AuthContext';
import React from 'react';

/** Driver HalfOrder Wallet — isolated from customer payments. */
export default function DriverWalletRoute() {
  const { user } = useAuth();
  const driverId = user?.uid ?? '';

  return (
    <PartnerWalletScreen
      ownerType="driver"
      ownerId={driverId}
      title="Wallet for Driver"
      orderIdLabel="Delivery ID"
      emptyHistoryText="Credits from HalfOrder will appear here."
    />
  );
}
