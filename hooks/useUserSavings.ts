import { useMoneySavedDetail } from '@/hooks/useMoneySavedDetail';

export type UserSavingsSnapshot = {
  totalMoneySaved: number;
  savedFromSharedFood: number;
  savedFromPromotions: number;
  savedFromFreeDelivery: number;
  savedFromFreeServiceFee: number;
  savedFromSharedDelivery: number;
  savedFromSharedServiceFee: number;
  totalOrdersCompleted: number;
  totalSharedOrders: number;
  lifetimeSavings: number;
  loading: boolean;
};

export function useUserSavings(uid: string | null | undefined): UserSavingsSnapshot {
  const detail = useMoneySavedDetail(uid);
  return {
    totalMoneySaved: detail.lifetime.totalLifetimeSavings,
    savedFromSharedFood: detail.savedFromSharedFood,
    savedFromPromotions: detail.savedFromPromotions,
    savedFromFreeDelivery: detail.savedFromFreeDelivery,
    savedFromFreeServiceFee: detail.savedFromFreeServiceFee,
    savedFromSharedDelivery: detail.savedFromSharedDelivery,
    savedFromSharedServiceFee: detail.savedFromSharedServiceFee,
    totalOrdersCompleted: detail.lifetime.lifetimeCompletedOrders,
    totalSharedOrders: detail.lifetime.lifetimeSharedOrders,
    lifetimeSavings: detail.lifetime.totalLifetimeSavings,
    loading: detail.loading,
  };
}
