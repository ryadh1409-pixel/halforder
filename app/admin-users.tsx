import { adminRoutes } from '../constants/adminRoutes';
import { Redirect } from 'expo-router';

export default function LegacyAdminUsers() {
  return <Redirect href={adminRoutes.users} />;
}
