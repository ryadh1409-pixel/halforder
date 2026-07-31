import { Redirect } from 'expo-router';

/**
 * Legacy route — production restaurant dashboard lives in the host shell.
 * Keep this path for deep links / old navigation; do not reintroduce a second UI.
 */
export default function RestaurantDashboardRedirect() {
  return <Redirect href="/(host)/dashboard" />;
}
