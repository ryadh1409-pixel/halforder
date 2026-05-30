import { DRIVER_ROUTES } from '@/lib/navigationPaths';
import { Redirect } from 'expo-router';

/** Legacy route — driver workflow is consolidated on Hub. */
export default function DriverDispatchRedirect() {
  return <Redirect href={DRIVER_ROUTES.hub} />;
}
