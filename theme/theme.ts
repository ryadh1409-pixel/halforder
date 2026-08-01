/**
 * HalfOrder design system — premium deep purple-black.
 * Color / typography / surface tokens only; spacing metrics unchanged unless noted.
 */
import { StyleSheet, type TextStyle } from 'react-native';

import { platformElevation } from '../utils/platformElevation';

/**
 * Centralized premium palette.
 * Brand gradient: #7C3AED → #8B5CF6 → #A855F7
 */
export const ordersPalette = {
  /** Page / safe-area background — deep purple-black */
  bg: '#0B0816',
  bgDeep: '#0B0816',
  bgMid: '#100C1C',
  bgWash: '#151126',
  /** Secondary background */
  bgSecondary: '#100C1C',
  /** Card — premium dark surface */
  surfaceSolid: '#151126',
  /** Elevated / secondary surface */
  surfaceElevated: '#1B1630',
  /** Input fill */
  input: '#1B1630',
  /** Translucent card surface (depth on dark bg) */
  surface: 'rgba(21,17,38,0.96)',
  surfaceSoft: 'rgba(27,22,48,0.82)',
  surfaceChip: 'rgba(139,92,246,0.10)',
  surfacePill: 'rgba(168,85,247,0.12)',
  /** Subtle purple glow borders */
  border: 'rgba(168, 85, 247, 0.24)',
  borderStrong: 'rgba(168, 85, 247, 0.42)',
  borderMuted: 'rgba(139, 92, 246, 0.16)',
  text: '#FFFFFF',
  textBright: '#FFFFFF',
  textBody: '#F1EFFF',
  textSecondary: '#C4BDD9',
  textMuted: '#9B93B0',
  textTertiary: '#8A829E',
  textDim: '#8A829E',
  textSubtle: '#8A829E',
  textSection: '#C4BDD9',
  textSlate: '#9B93B0',
  textSlateSolid: '#9B93B0',
  /** Primary brand — premium purple */
  accent: '#A855F7',
  accentCta: '#A855F7',
  accentMid: '#8B5CF6',
  accentDeep: '#7C3AED',
  accentGlow: 'rgba(168, 85, 247, 0.32)',
  purple: '#A855F7',
  purpleSoft: 'rgba(168, 85, 247, 0.18)',
  purpleGlow: 'rgba(139, 92, 246, 0.30)',
  purpleBorder: 'rgba(168, 85, 247, 0.38)',
  /** Promotional “Free …” labels */
  freeGold: '#D4AF37',
  freeGoldText: '#FFFFFF',
  /** Semantic success (status only — not decorative branding) */
  success: '#22C55E',
  successBright: '#22C55E',
  successSoft: 'rgba(34,197,94,0.16)',
  successBorder: 'rgba(34,197,94,0.4)',
  successText: '#22C55E',
  successMuted: 'rgba(34,197,94,0.85)',
  warning: '#F59E0B',
  warningSoft: 'rgba(245,158,11,0.14)',
  warningBorder: 'rgba(245,158,11,0.35)',
  warningText: '#F59E0B',
  danger: '#EF4444',
  dangerSoft: 'rgba(239,68,68,0.14)',
  dangerBorder: 'rgba(239,68,68,0.35)',
  dangerText: '#EF4444',
  dangerTextBright: '#EF4444',
  info: '#A855F7',
  infoSoft: 'rgba(168,85,247,0.18)',
  whatsapp: '#25D366',
  /** Deprecated decorative alias → purple soft */
  greenGlow: 'rgba(168, 85, 247, 0.14)',
  /** Navigation glass */
  navGlass: 'rgba(11,8,22,0.90)',
  shadow: '#05030A',
  overlayScrim: 'rgba(5,3,10,0.58)',
  badgeScrim: 'rgba(5,3,10,0.22)',
} as const;

export const palette = {
  primaryGreen: ordersPalette.successBright,
  /** Legacy name — now maps to primary purple */
  primaryOrange: ordersPalette.purple,
  background: ordersPalette.bg,
  lightGray: ordersPalette.surfaceSolid,
  textDark: ordersPalette.text,
} as const;

export const colors = {
  ...palette,
  textMuted: ordersPalette.textSecondary,
  textSecondary: ordersPalette.textMuted,
  border: ordersPalette.border,
  borderSubtle: ordersPalette.border,
  white: ordersPalette.text,
  danger: ordersPalette.danger,
  /** Primary CTA — purple */
  primary: ordersPalette.purple,
  primaryLight: ordersPalette.purpleSoft,
  primaryDark: ordersPalette.accentDeep,
  purple: ordersPalette.purple,
  purpleSoft: ordersPalette.purpleSoft,
  purpleGlow: ordersPalette.purpleGlow,
  purpleBorder: ordersPalette.purpleBorder,
  surface: ordersPalette.surfaceSolid,
  /** Legacy alias */
  backgroundDark: ordersPalette.bg,
  text: palette.textDark,
  textOnPrimary: '#FFFFFF',
  accentBlue: ordersPalette.purple,
  iconInactive: ordersPalette.textMuted,
  dotInactive: ordersPalette.borderMuted,
  success: ordersPalette.successBright,
  warning: ordersPalette.warning,
  whatsapp: ordersPalette.whatsapp,
  successBackground: ordersPalette.successSoft,
  successTextDark: ordersPalette.successText,
  successBannerBorder: ordersPalette.success,
  warningBackground: ordersPalette.warningSoft,
  warningTextDark: ordersPalette.warningText,
  warningSoft: ordersPalette.warningSoft,
  dangerBackground: ordersPalette.dangerSoft,
  dangerText: ordersPalette.dangerText,
  dangerBorder: ordersPalette.dangerBorder,
  surfaceMuted: ordersPalette.surface,
  borderStrong: ordersPalette.borderStrong,
  textSlate: ordersPalette.textSlateSolid,
  textSlateDark: ordersPalette.textBody,
  chatBubbleMine: 'rgba(168,85,247,0.22)',
  overlayScrim: ordersPalette.overlayScrim,
  timerAccent: ordersPalette.accentCta,
  shadow: ordersPalette.shadow,
  chromeWash: ordersPalette.bgSecondary,
  sheetDark: ordersPalette.bg,
  surfaceDark: ordersPalette.surfaceSolid,
  surfaceDarkElevated: ordersPalette.surfaceElevated,
  mapRouteTint: 'rgba(168, 85, 247, 0.45)',
  imessageGreen: ordersPalette.success,
  instagramBrand: '#E4405F',
  bannerNavy: ordersPalette.bgSecondary,
  /** Orders hub aliases */
  ordersBg: ordersPalette.bg,
  ordersSurface: ordersPalette.surface,
  ordersSurfaceSolid: ordersPalette.surfaceSolid,
  ordersBorder: ordersPalette.border,
  ordersAccentCta: ordersPalette.accentCta,
  ordersTextSecondary: ordersPalette.textSecondary,
  ordersTextMuted: ordersPalette.textMuted,
  ordersTextSection: ordersPalette.textSection,
  freeGold: ordersPalette.freeGold,
  freeGoldText: ordersPalette.freeGoldText,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  screen: 24,
  section: 20,
  tight: 12,
  /** Minimum tap target (iOS HIG / accessibility) */
  touchMin: 44,
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  full: 9999,
  button: 14,
  card: 20,
  input: 14,
  dot: 6,
};

export const typography = {
  hero: {
    fontSize: 34,
    fontWeight: '800' as TextStyle['fontWeight'],
    lineHeight: 40,
    letterSpacing: -0.9,
    color: colors.textDark,
  },
  screenTitle: {
    fontSize: 30,
    fontWeight: '800' as TextStyle['fontWeight'],
    lineHeight: 36,
    letterSpacing: -0.7,
    color: colors.textDark,
  },
  title: {
    fontSize: 22,
    fontWeight: '700' as TextStyle['fontWeight'],
    lineHeight: 28,
    letterSpacing: -0.3,
    color: colors.textDark,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 25,
    color: colors.textMuted,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 25,
    color: colors.textDark,
  },
  bodyMedium: {
    fontSize: 16,
    fontWeight: '500' as TextStyle['fontWeight'],
    lineHeight: 25,
    color: colors.textDark,
  },
  bodyMuted: {
    fontSize: 15,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 23,
    color: colors.textMuted,
  },
  caption: {
    fontSize: 13,
    fontWeight: '500' as TextStyle['fontWeight'],
    lineHeight: 19,
    color: colors.textMuted,
  },
  button: {
    fontSize: 16,
    fontWeight: '700' as TextStyle['fontWeight'],
    letterSpacing: 0.2,
  },
};

/** Brand gradients — premium purple. */
export const gradients = {
  brand: {
    colors: ['#7C3AED', '#8B5CF6', '#A855F7'] as [string, string, string],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  brandHorizontal: {
    colors: ['#7C3AED', '#8B5CF6', '#A855F7'] as [string, string, string],
    start: { x: 0, y: 0.5 },
    end: { x: 1, y: 0.5 },
  },
  /** Purple brand hairline */
  brandAccent: {
    colors: ['#7C3AED', '#A855F7'] as [string, string],
    start: { x: 0, y: 0.5 },
    end: { x: 1, y: 0.5 },
  },
  /** Orders cinematic wash */
  ordersCinematic: {
    colors: [
      ordersPalette.bgDeep,
      ordersPalette.bgMid,
      ordersPalette.bgWash,
      ordersPalette.bgDeep,
    ] as [string, string, string, string],
    start: { x: 0.5, y: 0 },
    end: { x: 0.5, y: 1 },
  },
} as const;

export const theme = {
  colors,
  spacing,
  radius,
  typography,
  orders: ordersPalette,
};

/** Soft elevation — cards with subtle purple glow */
export const shadows = {
  card: platformElevation({
    web: '0px 10px 32px rgba(124, 58, 237, 0.18)',
    ios: {
      shadowColor: '#7C3AED',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.22,
      shadowRadius: 28,
    },
    android: { elevation: 8 },
  }),
} as const;

const shadowCard = shadows.card;

/**
 * Reusable UI blocks — compose with TouchableOpacity + Text children.
 * Colors remapped to premium purple-black; sizes largely unchanged.
 */
export const layoutStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  containerMuted: {
    flex: 1,
    backgroundColor: colors.lightGray,
  },
  /** Card with purple-tinted border + soft shadow */
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadowCard,
  },
  /** Flat panel (no shadow) */
  cardFlat: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.card,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  /** Purple — main call-to-action */
  primaryButton: {
    backgroundColor: colors.purple,
    paddingVertical: 16,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    ...platformElevation({
      web: '0px 8px 22px rgba(124, 58, 237, 0.45)',
      ios: {
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.42,
        shadowRadius: 16,
      },
      android: { elevation: 6 },
    }),
  },
  primaryButtonText: {
    ...typography.button,
    color: colors.textOnPrimary,
  },
  /** Purple outline — secondary */
  secondaryButton: {
    backgroundColor: ordersPalette.surfaceElevated,
    paddingVertical: 16,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: colors.purpleBorder,
  },
  secondaryButtonText: {
    ...typography.button,
    color: colors.purple,
  },
  outlineButton: {
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 16,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.purpleBorder,
  },
  outlineButtonText: {
    ...typography.button,
    color: colors.textDark,
  },
  ghostButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  ghostButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textMuted,
  },
});

/** Expo template hook compatibility — both modes use premium dark */
export const Colors = {
  light: {
    text: ordersPalette.text,
    background: ordersPalette.bg,
    tint: ordersPalette.purple,
    icon: ordersPalette.textDim,
    tabIconDefault: ordersPalette.textDim,
    tabIconSelected: ordersPalette.purple,
  },
  dark: {
    text: ordersPalette.text,
    background: ordersPalette.bg,
    tint: ordersPalette.purple,
    icon: ordersPalette.textDim,
    tabIconDefault: ordersPalette.textDim,
    tabIconSelected: ordersPalette.purple,
  },
} as const;
