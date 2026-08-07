/**
 * /i-want-ai — Emo AI Concierge route.
 *
 * ADMIN-ONLY while feature flag PUBLIC_ENABLED = false.
 * Non-admin users are redirected before EmoOrderScreen ever mounts.
 *
 * To open for all users: flip PUBLIC_ENABLED in useIWantFeatureFlag.ts.
 * No changes needed here.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/services/AuthContext';
import { isRegisteredAuthUser } from '@/lib/authSession';
import { useHomeMarketplaceLocation } from '@/contexts/HomeMarketplaceLocationContext';
import { useAccountSavedLocation } from '@/hooks/useAccountSavedLocation';
import { useIWantFeatureFlag } from '@/hooks/useIWantFeatureFlag';
import { EmoOrderScreen } from '@/components/emoOrder/EmoOrderScreen';
import { EMO_AI_BG } from '@/types/emoAi';
import type { EmoOrderAddressDraft } from '@/types/emoOrder';

export default function IWantAiRoute() {
  const router = useRouter();
  const { user } = useAuth();
  const { enabled, loading } = useIWantFeatureFlag();
  const redirectedRef = useRef(false);

  // ── Route guard — redirect non-admins before screen mounts ───────────────
  useEffect(() => {
    if (loading) return; // wait for role to resolve
    if (!enabled) {
      if (redirectedRef.current) return;
      redirectedRef.current = true;
      // Use goBack if we can, otherwise go to tabs root
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/' as never);
      }
    }
  }, [enabled, loading, router]);

  // ── Location + auth resolution ───────────────────────────────────────────
  const uid = isRegisteredAuthUser(user) ? user!.uid : null;
  const { userCoords, addressLine } = useHomeMarketplaceLocation();
  const { saved } = useAccountSavedLocation('users', uid);

  const city = useMemo<string | null>(() => {
    if (!addressLine?.trim()) return null;
    const parts = addressLine.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    const candidate = parts.length >= 3 ? parts[1] : parts[parts.length - 1];
    return candidate?.replace(/\b[A-Z]{2}\b/g, '').replace(/\d+/g, '').trim() ?? null;
  }, [addressLine]);

  const savedAddress = useMemo<EmoOrderAddressDraft | null>(() => {
    if (!saved?.address || !Number.isFinite(saved.latitude) || !Number.isFinite(saved.longitude)) {
      return null;
    }
    return { address: saved.address, lat: saved.latitude, lng: saved.longitude };
  }, [saved]);

  const userName = useMemo<string | null>(() => {
    if (!user) return null;
    return (user as { displayName?: string | null }).displayName?.trim() || null;
  }, [user]);

  // ── While role is loading or access is denied — show neutral spinner ──────
  if (loading || !enabled) {
    return (
      <View style={styles.guard}>
        <ActivityIndicator color="#A855F7" />
      </View>
    );
  }

  // ── Admin confirmed — mount the concierge ─────────────────────────────────
  return (
    <EmoOrderScreen
      uid={uid}
      userCoords={userCoords}
      city={city}
      savedAddress={savedAddress}
      userName={userName}
      onBack={() => router.back()}
    />
  );
}

const styles = StyleSheet.create({
  guard: {
    flex: 1,
    backgroundColor: EMO_AI_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
