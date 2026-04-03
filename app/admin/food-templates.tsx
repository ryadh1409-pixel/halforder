import { Redirect } from 'expo-router';

/** Legacy route: catalog lives on `/admin`. */
export default function AdminFoodTemplatesRedirect() {
  return <Redirect href="/admin" />;
}
