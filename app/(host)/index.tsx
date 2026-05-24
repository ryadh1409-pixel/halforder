import { HOST_ROUTES } from '@/lib/navigationPaths';
import { Redirect } from 'expo-router';

export default function HostIndex() {
  return <Redirect href={HOST_ROUTES.dashboard} />;
}
