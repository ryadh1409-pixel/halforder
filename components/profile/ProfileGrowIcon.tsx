import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

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
        size={20}
        color={PROFILE_GROW_ICON_COLOR}
      />
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
