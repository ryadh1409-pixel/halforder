import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

/** Native list tokens — HalfOrder dark theme with purple accent. */
export const SETTINGS_LIST_COLORS = {
  text: '#FFFFFF',
  subtitle: '#8B93A7',
  sectionTitle: '#8B93A7',
  icon: '#A855F7',
  separator: 'rgba(255,255,255,0.08)',
  danger: '#EF4444',
} as const;

/** Leading icon column — keeps every title on the same optical baseline. */
const ICON_SLOT = 28;
const ICON_GAP = 14;
export const SETTINGS_ROW_ICON_SIZE = 22;

export type SettingsRowTone = 'default' | 'accent' | 'danger';

export type SettingsSectionProps = {
  /** Rendered above the rows; omit for an unlabeled group. */
  title?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function SettingsSection({ title, children, style }: SettingsSectionProps) {
  return (
    <View style={[styles.section, style]}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

export type SettingsRowProps = {
  title: string;
  subtitle?: string | null;
  /** MaterialIcons glyph name; ignored when `renderIcon` is provided. */
  icon?: React.ComponentProps<typeof MaterialIcons>['name'];
  /** Custom leading visual (existing icon components, badges, avatars). */
  renderIcon?: () => React.ReactNode;
  iconColor?: string;
  onPress?: () => void;
  /** Trailing control such as a Switch, count badge or value label. */
  trailing?: React.ReactNode;
  /** Only for rows where hierarchy is not otherwise obvious. */
  showChevron?: boolean;
  tone?: SettingsRowTone;
  /** First row in a group skips the separator. */
  isFirst?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
};

export function SettingsRow({
  title,
  subtitle,
  icon,
  renderIcon,
  iconColor,
  onPress,
  trailing,
  showChevron = false,
  tone = 'default',
  isFirst = false,
  disabled = false,
  accessibilityLabel,
}: SettingsRowProps) {
  const titleColor =
    tone === 'danger'
      ? SETTINGS_LIST_COLORS.danger
      : tone === 'accent'
        ? SETTINGS_LIST_COLORS.icon
        : SETTINGS_LIST_COLORS.text;
  const glyphColor =
    iconColor ??
    (tone === 'danger' ? SETTINGS_LIST_COLORS.danger : SETTINGS_LIST_COLORS.icon);

  const content = (
    <>
      <View style={styles.iconSlot}>
        {renderIcon ? (
          renderIcon()
        ) : icon ? (
          <MaterialIcons
            name={icon}
            size={SETTINGS_ROW_ICON_SIZE}
            color={glyphColor}
          />
        ) : null}
      </View>
      <View style={styles.textCol}>
        <Text style={[styles.title, { color: titleColor }]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? null}
      {showChevron ? (
        <MaterialIcons
          name="chevron-right"
          size={20}
          color={SETTINGS_LIST_COLORS.subtitle}
        />
      ) : null}
    </>
  );

  const rowStyle = [styles.row, !isFirst && styles.rowSeparator];

  if (!onPress) {
    return <View style={rowStyle}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => [
        rowStyle,
        pressed && styles.rowPressed,
        disabled && styles.rowDisabled,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: SETTINGS_LIST_COLORS.sectionTitle,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ICON_GAP,
    minHeight: 56,
    paddingVertical: 13,
  },
  rowSeparator: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SETTINGS_LIST_COLORS.separator,
  },
  rowPressed: {
    opacity: 0.55,
  },
  rowDisabled: {
    opacity: 0.45,
  },
  iconSlot: {
    width: ICON_SLOT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '400',
    color: SETTINGS_LIST_COLORS.subtitle,
    lineHeight: 18,
  },
});
