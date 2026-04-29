import { Redirect } from 'expo-router';

export default function LegacyRestaurantDashboardRedirect() {
  return <Redirect href="/(restaurant)/dashboard" />;
}
