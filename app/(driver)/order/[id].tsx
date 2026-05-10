import { Redirect, useLocalSearchParams } from 'expo-router';

/** Legacy driver route — unified marketplace orders live at `/order/[id]`. */
export default function DriverOrderLegacyRedirect() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const oid = typeof id === 'string' ? id.trim() : '';
  if (!oid) return <Redirect href="/(driver)" />;
  return <Redirect href={`/order/${oid}`} />;
}
