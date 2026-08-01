import React from 'react';

import {
  SETTINGS_LIST_COLORS,
  SettingsRow,
} from '../settings/SettingsList';
import { ProfileGrowIcon } from './ProfileGrowIcon';
import type { ProfileGrowIconKind } from './profileGrowIconShared';

export const PROFILE_MENU_COLORS = {
  surface: '#151126',
  text: SETTINGS_LIST_COLORS.text,
  textSecondary: '#B7BDC9',
  textTertiary: SETTINGS_LIST_COLORS.subtitle,
  border: SETTINGS_LIST_COLORS.separator,
} as const;

export type ProfileMenuItemProps = {
  title: string;
  subtitle: string;
  iconKind: ProfileGrowIconKind;
  onPress: () => void;
  /** Separators are drawn above rows; kept for callers that still pass it. */
  isLast?: boolean;
  /** Skip the leading separator on the first row of a group. */
  isFirst?: boolean;
};

export function ProfileMenuItem({
  title,
  subtitle,
  iconKind,
  onPress,
  isFirst = false,
}: ProfileMenuItemProps) {
  return (
    <SettingsRow
      title={title}
      subtitle={subtitle}
      renderIcon={() => <ProfileGrowIcon kind={iconKind} />}
      onPress={onPress}
      isFirst={isFirst}
    />
  );
}
