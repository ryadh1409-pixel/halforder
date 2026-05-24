import AppLogo from '../components/AppLogo';
import { ONBOARDING_COMPLETE_KEY } from '../constants/onboarding';
import { useUserTermsStatus } from '../hooks/useUserTermsStatus';
import { isRegisteredAuthUser } from '@/lib/authSession';
import { useAuth } from '../services/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

type GateState =
  | { phase: 'loading' }
  | { phase: 'ready'; onboardingDone: boolean };

/**
 * App root (`/`): onboarding/terms for guests; registered users rely on
 * `StartupRedirectOrchestrator` for role landing (no infinite spinner here).
 */
export default function Index() {
  const [gate, setGate] = useState<GateState>({ phase: 'loading' });
  const { user, loading } = useAuth();
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
    isRegisteredAuthUser(user) && !termsReady && gate.phase === 'ready';
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
    if (isRegisteredAuthUser(user) && termsReady && !termsAccepted) {
      router.replace('/terms-acceptance?returnTo=/(tabs)' as never);
      return;
    }
    if (isRegisteredAuthUser(user)) return;
    router.replace('/(tabs)' as never);
  }, [
    loading,
    gateReady,
    onboardingDone,
    waitingForTerms,
    user,
    termsReady,
    termsAccepted,
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
          backgroundColor: '#0F172A',
        }}
      >
        <AppLogo size={112} marginTop={0} />
        <ActivityIndicator size="large" style={{ marginTop: 40 }} />
      </View>
    );
  }

  /** Registered: transparent shell while orchestrator navigates to role home. */
  if (isRegisteredAuthUser(user)) {
    return <View style={{ flex: 1, backgroundColor: '#0F172A' }} />;
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <AppLogo size={112} marginTop={0} />
      <ActivityIndicator size="large" style={{ marginTop: 40 }} />
    </View>
  );
}
