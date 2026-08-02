import { PartnerWalletScreen } from '@/components/partnerWallet/PartnerWalletScreen';
import { useAuth } from '@/services/AuthContext';
import React from 'react';

/** Restaurant HalfOrder Wallet — isolated from customer payments. */
export default function HostWalletRoute() {
  const { user } = useAuth();
  const restaurantId = user?.uid ?? '';

  return (
    <PartnerWalletScreen
      ownerType="restaurant"
      ownerId={restaurantId}
      title="Wallet for Restaurant"
      orderIdLabel="Order ID"
      emptyHistoryText="Credits from HalfOrder will appear here."
    />
  );
}
