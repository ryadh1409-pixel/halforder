import { DRIVER_ROUTES } from '@/lib/navigationPaths';
import { Redirect } from 'expo-router';

/** Legacy `/driver` entry → canonical driver hub stack at `app/(driver)/`. */
export default function DriverRoute() {
  return <Redirect href={DRIVER_ROUTES.hub} />;
}
