import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { SETTINGS_ROW_ICON_SIZE } from '../settings/SettingsList';
import {
  PROFILE_GROW_ICON_COLOR,
  type ProfileGrowIconKind,
} from './profileGrowIconShared';

export { PROFILE_GROW_ICON_COLOR, type ProfileGrowIconKind } from './profileGrowIconShared';

/** Lucide-equivalent glyphs when RNSVG is unavailable in the dev client (Building2, Store, Bike). */
const ICON_BY_KIND: Record<
  ProfileGrowIconKind,
  React.ComponentProps<typeof MaterialCommunityIcons>['name']
> = {
  business: 'office-building-outline',
  restaurant: 'store-outline',
  driver: 'bike',
};

type Props = {
  kind: ProfileGrowIconKind;
};

export function ProfileGrowIcon({ kind }: Props) {
  return (
    <View style={styles.wrap}>
      <MaterialCommunityIcons
        name={ICON_BY_KIND[kind]}
        size={SETTINGS_ROW_ICON_SIZE}
        color={PROFILE_GROW_ICON_COLOR}
      />
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
