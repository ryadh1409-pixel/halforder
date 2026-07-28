import {
  type ActiveWorkspace,
} from '@/services/activeWorkspace';
import { navigateForRole } from '@/lib/navigation';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Props = {
  availableWorkspaces: ActiveWorkspace[];
  activeWorkspace: ActiveWorkspace;
  onSwitch: (workspace: ActiveWorkspace) => Promise<void>;
  /** Visual variant — driver shell is dark green; restaurant is light. */
  variant: 'driver' | 'restaurant';
};

const LABELS: Record<ActiveWorkspace, string> = {
  user: 'Customer',
  driver: 'Driver',
  restaurant: 'Restaurant',
};

/**
 * Workspace switcher for Driver / Restaurant profiles.
 * Customer-only → single "Switch to Customer" button.
 * Multiple partner roles → radio-style selector.
 */
export function WorkspaceSwitcher({
  availableWorkspaces,
  activeWorkspace,
  onSwitch,
  variant,
}: Props) {
  const [busy, setBusy] = useState(false);
  const styles = variant === 'driver' ? driverStyles : restaurantStyles;

  const select = useCallback(
    async (workspace: ActiveWorkspace) => {
      if (busy || workspace === activeWorkspace) return;
      setBusy(true);
      try {
        await onSwitch(workspace);
        navigateForRole(workspace);
      } finally {
        setBusy(false);
      }
    },
    [activeWorkspace, busy, onSwitch],
  );

  const partnerRoles = availableWorkspaces.filter((w) => w !== 'user');
  const showSelector = partnerRoles.length >= 2;

  if (showSelector) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Current Workspace</Text>
        {availableWorkspaces.map((workspace) => {
          const selected = workspace === activeWorkspace;
          return (
            <Pressable
              key={workspace}
              style={styles.optionRow}
              onPress={() => void select(workspace)}
              disabled={busy}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={LABELS[workspace]}
            >
              <View style={[styles.radio, selected && styles.radioOn]}>
                {selected ? <View style={styles.radioDot} /> : null}
              </View>
              <Text style={styles.optionLabel}>{LABELS[workspace]}</Text>
            </Pressable>
          );
        })}
        {busy ? (
          <ActivityIndicator
            color={variant === 'driver' ? '#86EFAC' : '#16a34a'}
            style={{ marginTop: 8 }}
          />
        ) : null}
      </View>
    );
  }

  if (!availableWorkspaces.includes('user')) return null;

  return (
    <Pressable
      style={[styles.switchBtn, busy && styles.switchBtnDisabled]}
      onPress={() => void select('user')}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel="Switch to Customer"
    >
      {busy ? (
        <ActivityIndicator color={variant === 'driver' ? '#052e1b' : '#FFFFFF'} />
      ) : (
        <Text style={styles.switchBtnText}>Switch to Customer</Text>
      )}
    </Pressable>
  );
}

const driverStyles = StyleSheet.create({
  switchBtn: {
    marginTop: 16,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#86EFAC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchBtnDisabled: { opacity: 0.7 },
  switchBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#052e1b',
  },
  card: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#12151C',
    borderWidth: 1,
    borderColor: 'rgba(134, 239, 172, 0.28)',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#86EFAC',
    letterSpacing: 0.4,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#86EFAC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: {
    borderColor: '#86EFAC',
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#86EFAC',
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
});

const restaurantStyles = StyleSheet.create({
  switchBtn: {
    marginTop: 16,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchBtnDisabled: { opacity: 0.7 },
  switchBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  card: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#16a34a',
    letterSpacing: 0.4,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: {
    borderColor: '#16a34a',
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#16a34a',
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
});
