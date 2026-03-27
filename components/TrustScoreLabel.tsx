import { theme } from '@/constants/theme';
import React from 'react';
import { Text, View } from 'react-native';

const STAR_COLOR = theme.colors.warning;
const TEXT_COLOR = theme.colors.text;

type TrustScoreLabelProps = {
  average: number;
  count: number;
  showTrusted?: boolean;
  compact?: boolean;
  tierLabel?: 'Trusted User 🔥' | 'New User' | 'Low Reliability ⚠️';
};

export function TrustScoreLabel({
  average,
  count,
  showTrusted = false,
  compact = false,
  tierLabel,
}: TrustScoreLabelProps) {
  if (count === 0 && !tierLabel) return null;
  const numStr = average.toFixed(1);
  const suffix = compact
    ? ` ${numStr}`
    : ` ${numStr} (${count} review${count === 1 ? '' : 's'})`;
  const statusText = tierLabel ?? (showTrusted && count >= 1 ? 'Trusted User 🔥' : null);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {count > 0 ? (
        <>
          <Text style={{ color: STAR_COLOR, fontSize: compact ? 13 : 14 }}>★</Text>
          <Text
            style={{
              color: TEXT_COLOR,
              fontSize: compact ? 13 : 14,
              fontWeight: '600',
            }}
          >
            {suffix}
          </Text>
        </>
      ) : null}
      {statusText ? (
        <Text style={{ color: TEXT_COLOR, fontSize: 12, fontWeight: '500' }}>
          {statusText}
        </Text>
      ) : null}
    </View>
  );
}
