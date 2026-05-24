import { HOST_ROUTES } from '@/lib/navigationPaths';
import { Redirect } from 'expo-router';

/** Legacy `(tabs)/menu` — restaurant UI lives in `(host)`. */
export default function LegacyMenuTabRedirect() {
  return <Redirect href={HOST_ROUTES.menu} />;
}
