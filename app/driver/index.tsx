import { Redirect } from 'expo-router';

/** Legacy `/driver` entry → canonical driver hub stack at `app/(driver)/`. */
const DRIVER_HUB_HREF = '/(driver)' as const;

export default function DriverRoute() {
  return <Redirect href={DRIVER_HUB_HREF} />;
}
