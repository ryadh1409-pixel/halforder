import { DRIVER_ROUTES } from '@/lib/navigationPaths';
import { Redirect, useLocalSearchParams } from 'expo-router';

/** Legacy `/driver/active/:id` → canonical route inside `app/(driver)/`. */
export default function LegacyDriverActiveRedirect() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const oid = typeof id === 'string' ? id.trim() : '';
  if (!oid) {
    return <Redirect href={DRIVER_ROUTES.active} />;
  }
  return <Redirect href={DRIVER_ROUTES.activeOrder(oid)} />;
}
