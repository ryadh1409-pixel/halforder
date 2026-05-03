import AppLogo from '../components/AppLogo';
import { ONBOARDING_COMPLETE_KEY } from '../constants/onboarding';
import { useUserTermsStatus } from '../hooks/useUserTermsStatus';
import { useAuth } from '../services/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

type GateState =
  | { phase: 'loading' }
  | { phase: 'ready'; onboardingDone: boolean };

/**
 * App root (`/`): wait for auth + role loading, gate onboarding/terms, then `router.replace`
 * (no `<Redirect />` while `loading` is true — avoids navigation before the tree is stable).
 */
export default function Index() {
  const [gate, setGate] = useState<GateState>({ phase: 'loading' });
  const router = useRouter();
  const { user, loading, firestoreUserRole } = useAuth();
  const { ready: termsReady, accepted: termsAccepted } = useUserTermsStatus(
    user?.uid,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const obRaw = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
        if (!cancelled) {
          setGate({
            phase: 'ready',
            onboardingDone: obRaw === 'true',
          });
        }
      } catch {
        if (!cancelled) {
          setGate({
            phase: 'ready',
            onboardingDone: false,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const waitingForTerms =
    Boolean(user) && !termsReady && gate.phase === 'ready';
  const gateReady = gate.phase === 'ready';
  const onboardingDone = gateReady ? gate.onboardingDone : false;

  useLayoutEffect(() => {
    if (loading) return;
    if (!gateReady) return;
    if (!onboardingDone) {
      router.replace('/onboarding');
      return;
    }
    if (waitingForTerms) return;
    if (user && termsReady && !termsAccepted) {
      router.replace('/terms-acceptance?returnTo=/(tabs)' as never);
      return;
    }
    if (firestoreUserRole === 'restaurant') {
      router.replace('/(tabs)/host' as never);
      return;
    }
    router.replace('/(tabs)' as never);
  }, [
    loading,
    gateReady,
    onboardingDone,
    waitingForTerms,
    user,
    termsReady,
    termsAccepted,
    firestoreUserRole,
    router,
  ]);

  if (
    loading ||
    !gateReady ||
    waitingForTerms ||
    (gateReady && !onboardingDone)
  ) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingTop: 60,
        }}
      >
        <AppLogo size={112} marginTop={0} />
        <ActivityIndicator size="large" style={{ marginTop: 40 }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <AppLogo size={112} marginTop={0} />
      <ActivityIndicator size="large" style={{ marginTop: 40 }} />
    </View>
  );
}
