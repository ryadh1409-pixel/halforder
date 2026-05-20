import { Bike, Building2, Store } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import {
  PROFILE_GROW_ICON_COLOR,
  type ProfileGrowIconKind,
} from './profileGrowIconShared';

const LUCIDE_PROPS = {
  size: 20,
  color: PROFILE_GROW_ICON_COLOR,
  strokeWidth: 1.75,
  fill: 'none' as const,
};

type Props = {
  kind: ProfileGrowIconKind;
};

export function ProfileGrowIcon({ kind }: Props) {
  return (
    <View style={styles.wrap}>
      {kind === 'business' ? (
        <Building2 {...LUCIDE_PROPS} />
      ) : kind === 'restaurant' ? (
        <Store {...LUCIDE_PROPS} />
      ) : (
        <Bike {...LUCIDE_PROPS} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 158, 64, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 158, 64, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
