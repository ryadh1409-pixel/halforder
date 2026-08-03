/**
 * Tracking status header — uses resolveCustomerTrackingUi fields as-is.
 */
import { UE } from '@/constants/uberEatsTheme';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  title: string;
  subtitle: string;
  progress: number;
  delivered: boolean;
  etaPrimary?: string;
  etaSecondary?: string;
};

export function DeliveryStatusHeader({
  title,
  subtitle,
  progress,
  delivered,
  etaPrimary,
  etaSecondary,
}: Props) {
  const pct = Math.max(0, Math.min(1, progress));

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        </View>
        {!delivered && etaPrimary ? (
          <View style={styles.etaPill}>
            <Text style={styles.etaPrimary} numberOfLines={1}>
              {etaPrimary}
            </Text>
            {etaSecondary ? (
              <Text style={styles.etaSecondary} numberOfLines={1}>
                {etaSecondary}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {delivered ? (
        <View style={styles.doneBadge} accessibilityRole="text">
          <Text style={styles.doneTxt}>Delivered</Text>
        </View>
      ) : (
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityValue={{
            min: 0,
            max: 100,
            now: Math.round(pct * 100),
          }}
        >
          <View style={[styles.fill, { width: `${Math.round(pct * 100)}%` }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14, marginBottom: 16 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleBlock: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: UE.text,
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '600',
    color: UE.textSecondary,
    lineHeight: 21,
  },
  etaPill: {
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: UE.radiusL,
    backgroundColor: UE.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: UE.border,
    minWidth: 88,
  },
  etaPrimary: {
    fontSize: 18,
    fontWeight: '900',
    color: UE.text,
  },
  etaSecondary: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: UE.accent,
  },
  track: {
    height: 5,
    borderRadius: 3,
    backgroundColor: UE.borderLight,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: UE.accent,
  },
  doneBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: UE.radiusPill,
    backgroundColor: 'rgba(34,197,94,0.16)',
  },
  doneTxt: {
    color: '#4ADE80',
    fontWeight: '900',
    fontSize: 13,
  },
});
