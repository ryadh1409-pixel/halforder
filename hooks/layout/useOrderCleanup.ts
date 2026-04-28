import { startFoodCardAutomation } from '@/services/foodCards';
import { startExpiredOrdersCleanup } from '@/services/orderExpiryClient';
import { useEffect } from 'react';

export function useOrderCleanup() {
  useEffect(() => {
    const stopOrders = startExpiredOrdersCleanup();
    const stopCards = startFoodCardAutomation();
    return () => {
      stopOrders();
      stopCards();
    };
  }, []);
}
