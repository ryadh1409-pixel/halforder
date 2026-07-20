import { wirePushNotificationDeepLinks } from '@/services/pushDeepLink';
import { useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';

/** Listens for notification taps and routes to `data.deepLink`. */
export function PushNotificationDeepLinkListener() {
  const router = useRouter();

  useEffect(() => {
    return wirePushNotificationDeepLinks((href) => {
      router.push(href as Href);
    });
  }, [router]);

  return null;
}
