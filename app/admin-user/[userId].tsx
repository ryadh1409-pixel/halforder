import { adminRoutes } from '../../constants/adminRoutes';
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function LegacyAdminUser() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const id = typeof userId === 'string' ? userId : '';
  if (!id) return <Redirect href={adminRoutes.users as never} />;
  return <Redirect href={adminRoutes.user(id) as never} />;
}
