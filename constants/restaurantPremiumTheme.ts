import { ordersPalette } from '@/theme/theme';

/** Restaurant surfaces — Orders Hub dark palette (colors only; layout metrics unchanged). */
export const RP = {
  bg: ordersPalette.bg,
  surface: ordersPalette.surfaceSolid,
  surface2: ordersPalette.surfaceElevated,
  text: ordersPalette.text,
  textSecondary: ordersPalette.textSecondary,
  textMuted: ordersPalette.textMuted,
  border: ordersPalette.border,
  shadow: 'rgba(0, 0, 0, 0.28)',
  accent: ordersPalette.success,
  offer: ordersPalette.danger,
  gold: ordersPalette.warning,
  blackBtn: ordersPalette.accent,
  radiusL: 24,
  radiusM: 16,
  radiusS: 12,
  fontH1: 28,
  fontH2: 20,
  fontBody: 16,
  fontCaption: 13,
} as const;
