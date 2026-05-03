import { adminRoutes } from '@/constants/adminRoutes';
import { Redirect } from 'expo-router';

/** Legacy route: catalog lives on admin home. */
export default function AdminFoodTemplatesRedirect() {
  return <Redirect href={adminRoutes.home} />;
}
