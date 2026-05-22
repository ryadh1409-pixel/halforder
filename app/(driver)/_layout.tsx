import { DriverPresenceProvider } from '@/contexts/DriverPresenceContext';
import { DriverRealtimeProvider } from '@/contexts/DriverRealtimeContext';
import { refreshAuthRoleClaims } from '@/services/authRoleClaims';
import { useAuth } from '@/services/AuthContext';
import { auth, ensureAuthReady } from '@/services/firebase';
import { Tabs } from 'expo-router';
import React, { useEffect, useRef } from 'react';

export default function DriverLayout() {
  const { user, loading: authLoading } = useAuth();
  const claimsSyncedForUidRef = useRef<string | null>(null);

  useEffect(() => {
    const uid = user?.uid?.trim() ?? '';
    if (authLoading || !uid) return;
    if (claimsSyncedForUidRef.current === uid) return;

    claimsSyncedForUidRef.current = uid;
    void (async () => {
      try {
        await ensureAuthReady();
        const currentUser = auth.currentUser;
        if (currentUser) {
          await currentUser.getIdToken(true);
        }
        await refreshAuthRoleClaims();
      } catch (err) {
        claimsSyncedForUidRef.current = null;
        console.error('[driver] driver auth token refresh failed', err);
      }
    })();
  }, [authLoading, user?.uid]);

  return (
    <DriverPresenceProvider>
      <DriverRealtimeProvider>
        <Tabs
          screenOptions={{
            headerShown: false,
          }}
        >
          <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
          <Tabs.Screen name="orders" options={{ title: 'Orders' }} />
          <Tabs.Screen name="earnings" options={{ title: 'Earnings' }} />
          <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
          <Tabs.Screen name="dashboard" options={{ href: null }} />
          <Tabs.Screen name="active" options={{ href: null }} />
          <Tabs.Screen name="order/[id]" options={{ href: null }} />
        </Tabs>
      </DriverRealtimeProvider>
    </DriverPresenceProvider>
  );
}
