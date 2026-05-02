import { Redirect } from 'expo-router';

/** Legacy path — canonical driver UI is `/(driver)` (index). */
export default function DriverDashboardAlias() {
  return <Redirect href="/(driver)" />;
}
