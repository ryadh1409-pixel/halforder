import { Bike, Building2, Store } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { SETTINGS_ROW_ICON_SIZE } from '../settings/SettingsList';
import {
  PROFILE_GROW_ICON_COLOR,
  type ProfileGrowIconKind,
} from './profileGrowIconShared';

const LUCIDE_PROPS = {
  size: SETTINGS_ROW_ICON_SIZE,
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
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
