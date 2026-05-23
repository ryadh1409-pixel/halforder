import { DRIVER_ROUTES } from '@/lib/navigationPaths';
import { Redirect } from 'expo-router';

/** Legacy `/driver/dashboard` → canonical driver hub stack at `app/(driver)/`. */
export default function LegacyDriverPath() {
  return <Redirect href={DRIVER_ROUTES.hub} />;
}
