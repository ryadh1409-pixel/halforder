import { adminRoutes } from '@/constants/adminRoutes';
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function LegacyAdminOrder() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const id = typeof orderId === 'string' ? orderId : '';
  if (!id) return <Redirect href={adminRoutes.orders()} />;
  return <Redirect href={adminRoutes.order(id)} />;
}
