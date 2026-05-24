import { HOST_ROUTES } from '@/lib/navigationPaths';
import { Redirect } from 'expo-router';

/** Legacy `(tabs)/orders` — restaurant UI lives in `(host)`. */
export default function LegacyOrdersTabRedirect() {
  return <Redirect href={HOST_ROUTES.orders} />;
}
