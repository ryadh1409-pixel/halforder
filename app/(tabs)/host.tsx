import { HOST_ROUTES } from '@/lib/navigationPaths';
import { Redirect } from 'expo-router';

/** Legacy `(tabs)/host` — restaurant UI lives in `(host)`. */
export default function LegacyHostTabRedirect() {
  return <Redirect href={HOST_ROUTES.dashboard} />;
}
