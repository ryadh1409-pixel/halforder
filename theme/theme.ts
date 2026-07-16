/**
 * HalfOrder design system — premium luxury dark palette (single source of truth).
 * Color tokens only; spacing / radius / typography sizes unchanged.
 */
import { StyleSheet, type TextStyle } from 'react-native';

import { platformElevation } from '../utils/platformElevation';

/**
 * Centralized premium palette (Linear / Stripe / Apple–inspired luxury dark).
 * Orange accent: #FF6B35
 */
export const ordersPalette = {
  /** Page / safe-area background */
  bg: '#09090B',
  bgDeep: '#09090B',
  bgMid: '#111217',
  bgWash: '#111217',
  /** Secondary background */
  bgSecondary: '#111217',
  /** Card */
  surfaceSolid: '#171923',
  /** Elevated card */
  surfaceElevated: '#1E2230',
  /** Input fill */
  input: '#1C2030',
  /** Translucent card surface (depth on dark bg) */
  surface: 'rgba(23,25,35,0.92)',
  surfaceSoft: 'rgba(23,25,35,0.72)',
  surfaceChip: 'rgba(255,255,255,0.05)',
  surfacePill: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.08)',
  borderMuted: 'rgba(255,255,255,0.08)',
  text: '#FFFFFF',
  textBright: '#FFFFFF',
  textBody: '#B7BDC9',
  textSecondary: '#B7BDC9',
  textMuted: '#7D8493',
  textTertiary: '#7D8493',
  textDim: '#7D8493',
  textSubtle: '#7D8493',
  textSection: '#B7BDC9',
  textSlate: '#7D8493',
  textSlateSolid: '#7D8493',
  /** Primary accent */
  accent: '#FF6B35',
  accentCta: '#FF6B35',
  accentGlow: 'rgba(255, 107, 53, 0.14)',
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
  info: '#3B82F6',
  infoSoft: 'rgba(59,130,246,0.18)',
  purple: '#3B82F6',
  whatsapp: '#25D366',
  greenGlow: 'rgba(34, 197, 94, 0.1)',
  /** Navigation glass */
  navGlass: 'rgba(15,17,24,0.82)',
  shadow: '#000000',
  overlayScrim: 'rgba(0,0,0,0.55)',
  badgeScrim: 'rgba(0,0,0,0.2)',
} as const;

export const palette = {
  primaryGreen: ordersPalette.successBright,
  primaryOrange: ordersPalette.accent,
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
  /** Primary CTA — orange accent */
  primary: palette.primaryOrange,
  primaryLight: 'rgba(255,107,53,0.35)',
  primaryDark: '#FF6B35',
  surface: ordersPalette.surfaceSolid,
  /** Legacy alias */
  backgroundDark: ordersPalette.bg,
  text: palette.textDark,
  textOnPrimary: '#FFFFFF',
  accentBlue: ordersPalette.info,
  iconInactive: ordersPalette.textMuted,
  dotInactive: ordersPalette.border,
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
  chatBubbleMine: 'rgba(255,107,53,0.18)',
  overlayScrim: ordersPalette.overlayScrim,
  timerAccent: ordersPalette.accentCta,
  shadow: ordersPalette.shadow,
  chromeWash: ordersPalette.bgSecondary,
  sheetDark: ordersPalette.bg,
  surfaceDark: ordersPalette.surfaceSolid,
  surfaceDarkElevated: ordersPalette.surfaceElevated,
  mapRouteTint: 'rgba(255, 107, 53, 0.55)',
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
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
  button: 12,
  card: 16,
  input: 12,
  dot: 6,
};

export const typography = {
  hero: {
    fontSize: 32,
    fontWeight: '700' as TextStyle['fontWeight'],
    lineHeight: 38,
    letterSpacing: -0.8,
    color: colors.textDark,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700' as TextStyle['fontWeight'],
    lineHeight: 34,
    letterSpacing: -0.6,
    color: colors.textDark,
  },
  title: {
    fontSize: 20,
    fontWeight: '600' as TextStyle['fontWeight'],
    lineHeight: 26,
    color: colors.textDark,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 24,
    color: colors.textMuted,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 24,
    color: colors.textDark,
  },
  bodyMedium: {
    fontSize: 16,
    fontWeight: '500' as TextStyle['fontWeight'],
    lineHeight: 24,
    color: colors.textDark,
  },
  bodyMuted: {
    fontSize: 15,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 22,
    color: colors.textMuted,
  },
  caption: {
    fontSize: 13,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 18,
    color: colors.textMuted,
  },
  button: {
    fontSize: 16,
    fontWeight: '600' as TextStyle['fontWeight'],
    letterSpacing: 0.15,
  },
};

/** Green → orange (diagonal). Use with expo-linear-gradient. */
export const gradients = {
  brand: {
    colors: [palette.primaryGreen, palette.primaryOrange] as [string, string],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  brandHorizontal: {
    colors: [palette.primaryGreen, palette.primaryOrange] as [string, string],
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

/** Subtle elevation — cards, floating panels (Orders marketplace card) */
export const shadows = {
  card: platformElevation({
    web: '0px 8px 24px rgba(0, 0, 0, 0.28)',
    ios: {
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.28,
      shadowRadius: 24,
    },
    android: { elevation: 6 },
  }),
} as const;

const shadowCard = shadows.card;

/**
 * Reusable UI blocks — compose with TouchableOpacity + Text children.
 * Colors only remapped to Orders dark; sizes unchanged.
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
  /** Card with border + soft shadow */
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadowCard,
  },
  /** Flat panel (no shadow) */
  cardFlat: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  /** Orange — main call-to-action */
  primaryButton: {
    backgroundColor: colors.primaryOrange,
    paddingVertical: 16,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonText: {
    ...typography.button,
    color: colors.textOnPrimary,
  },
  /** Green — secondary emphasis */
  secondaryButton: {
    backgroundColor: colors.primaryGreen,
    paddingVertical: 16,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  secondaryButtonText: {
    ...typography.button,
    color: colors.textOnPrimary,
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
    borderColor: colors.border,
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

/** Expo template hook compatibility — both modes use Orders dark */
export const Colors = {
  light: {
    text: ordersPalette.text,
    background: ordersPalette.bg,
    tint: colors.primaryOrange,
    icon: ordersPalette.textDim,
    tabIconDefault: ordersPalette.textDim,
    tabIconSelected: colors.primaryOrange,
  },
  dark: {
    text: ordersPalette.text,
    background: ordersPalette.bg,
    tint: colors.primaryOrange,
    icon: ordersPalette.textDim,
    tabIconDefault: ordersPalette.textDim,
    tabIconSelected: colors.primaryOrange,
  },
} as const;
