import { Redirect } from 'expo-router';

/** Deep link / legacy `/host` → host dashboard inside the tab shell. */
export default function HostLegacyRedirect() {
  return <Redirect href="/(tabs)/host" />;
}

