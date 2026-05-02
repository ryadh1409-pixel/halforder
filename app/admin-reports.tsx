import { adminRoutes } from '../constants/adminRoutes';
import { Redirect } from 'expo-router';

export default function LegacyAdminReports() {
  return <Redirect href={adminRoutes.reports} />;
}
