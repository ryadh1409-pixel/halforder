import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

/**
 * Universal-link bridge for shared invites: `https://halforder.app/group/{orderId}`.
 * Redirects to the in-app order route while preserving optional `ref` attribution.
 */
export default function GroupInviteRedirectScreen() {
  const router = useRouter();
  const { orderId, ref } = useLocalSearchParams<{
    orderId?: string;
    ref?: string;
  }>();

  useEffect(() => {
    const id = (orderId ?? '').trim();
    if (!id) {
      router.replace('/' as never);
      return;
    }
    const base = `/join/${encodeURIComponent(id)}`;
    const next = ref ? `${base}?ref=${encodeURIComponent(String(ref))}` : base;
    router.replace(next as never);
  }, [orderId, ref, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator />
    </View>
  );
}
