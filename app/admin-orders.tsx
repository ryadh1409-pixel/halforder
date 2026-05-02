import { adminRoutes } from '../constants/adminRoutes';
import { Redirect } from 'expo-router';

export default function LegacyAdminOrders() {
  return <Redirect href={adminRoutes.orders()} />;
}
