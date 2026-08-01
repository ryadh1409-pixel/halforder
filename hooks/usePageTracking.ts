/**
 * usePageTracking — call at the top of any screen component to log page views.
 *
 * Usage:
 *   import { usePageTracking } from '@/hooks/usePageTracking';
 *   // Inside component:
 *   usePageTracking('home');
 *   usePageTracking('restaurant_menu');
 *   usePageTracking('checkout');
 */
import { auth } from '@/services/firebase';
import { trackPageView } from '@/services/userActivityTracker';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

export function usePageTracking(pageName: string): void {
  useFocusEffect(
    useCallback(() => {
      const user = auth.currentUser;
      // Only track real (non-anonymous) users
      if (!user || user.isAnonymous) return;
      void trackPageView(user.uid, pageName);
    }, [pageName]),
  );
}
