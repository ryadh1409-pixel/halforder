import {
  enrollInDriverLaunchCampaign,
  subscribeDriverLaunchCampaignSettings,
  subscribeMyDriverLaunchEnrollment,
} from '@/services/driverLaunchCampaign';
import {
  canEnrollInDriverLaunchCampaign,
  type DriverLaunchCampaignSettings,
  type DriverLaunchEnrollment,
} from '@/types/driverLaunchCampaign';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { showError, showSuccess } from '@/utils/toast';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Props = {
  driverId: string | null | undefined;
};

/**
 * Additive driver-hub card for the Limited Driver Launch Campaign.
 * Does not alter delivery, payout, or matching UI beyond this banner.
 */
export function DriverLaunchCampaignCard({ driverId }: Props) {
  const [settings, setSettings] = useState<DriverLaunchCampaignSettings | null>(
    null,
  );
  const [enrollment, setEnrollment] = useState<DriverLaunchEnrollment | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return subscribeDriverLaunchCampaignSettings(setSettings);
  }, []);

  useEffect(() => {
    if (!driverId) {
      setEnrollment(null);
      return undefined;
    }
    return subscribeMyDriverLaunchEnrollment(driverId, setEnrollment);
  }, [driverId]);

  const canEnroll = useMemo(() => {
    if (!settings || enrollment) return false;
    return canEnrollInDriverLaunchCampaign(settings);
  }, [settings, enrollment]);

  if (!settings?.enabled) return null;
  if (!enrollment && !canEnroll) return null;

  const onEnroll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await enrollInDriverLaunchCampaign();
      showSuccess(res.message);
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  if (enrollment) {
    const pct = Math.min(
      100,
      Math.round(
        (enrollment.completedDeliveries / enrollment.requiredDeliveries) * 100,
      ),
    );
    return (
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Launch bonus</Text>
        <Text style={styles.title}>
          {enrollment.status === 'bonus_paid'
            ? 'Bonus paid'
            : enrollment.status === 'bonus_unlocked'
              ? 'Bonus unlocked!'
              : enrollment.status === 'expired'
                ? 'Promotion ended'
                : `Seat #${enrollment.slotIndex} reserved`}
        </Text>
        <Text style={styles.body}>
          {enrollment.status === 'active'
            ? `${enrollment.completedDeliveries}/${enrollment.requiredDeliveries} deliveries · unlock CA$${enrollment.bonusAmountCad.toFixed(0)}`
            : enrollment.status === 'bonus_unlocked'
              ? `CA$${enrollment.bonusAmountCad.toFixed(0)} ready — admin will pay your bonus.`
              : enrollment.status === 'bonus_paid'
                ? `CA$${enrollment.bonusAmountCad.toFixed(0)} bonus marked paid.`
                : 'Your seat was reserved while the promotion was active.'}
        </Text>
        {enrollment.status === 'active' ? (
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${pct}%` }]} />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Limited launch offer</Text>
      <Text style={styles.title}>
        Complete {settings.requiredDeliveries} deliveries · earn $
        {settings.bonusAmountCad.toFixed(0)} CAD
      </Text>
      <Text style={styles.body}>
        First {settings.eligibleDriverLimit} eligible drivers only. Your seat is
        permanently reserved once you join.
      </Text>
      <Pressable
        style={[styles.cta, busy && styles.ctaDisabled]}
        disabled={busy}
        onPress={() => void onEnroll()}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.ctaTxt}>Reserve my seat</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 14,
    borderRadius: 18,
    padding: 16,
    backgroundColor: 'rgba(168, 85, 247, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.28)',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: '#C4B5FD',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 6,
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFF',
    marginBottom: 6,
  },
  body: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B7BDC9',
    lineHeight: 19,
    marginBottom: 12,
  },
  barTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#A855F7',
  },
  cta: {
    backgroundColor: '#A855F7',
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.65 },
  ctaTxt: { color: '#FFF', fontWeight: '900', fontSize: 14 },
});
