/**
 * Admin consoles — premium dark enterprise tokens (Stripe / Linear / Raycast feel).
 */
import { Platform, type TextStyle, type ViewStyle } from 'react-native';
import { shadows, theme } from './theme';

const t = theme.colors;

/** SF Pro on iOS; system UI font elsewhere. */
export const adminFontFamily =
  Platform.OS === 'ios' ? 'System' : Platform.OS === 'android' ? 'sans-serif' : undefined;

export const adminType = {
  hero: {
    fontFamily: adminFontFamily,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: t.text,
  } satisfies TextStyle,
  title: {
    fontFamily: adminFontFamily,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: t.text,
  } satisfies TextStyle,
  section: {
    fontFamily: adminFontFamily,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'rgba(148,163,184,0.95)',
  } satisfies TextStyle,
  body: {
    fontFamily: adminFontFamily,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    color: t.text,
  } satisfies TextStyle,
  meta: {
    fontFamily: adminFontFamily,
    fontSize: 12,
    fontWeight: '600',
    color: t.textMuted,
  } satisfies TextStyle,
};

/** Consistent elevated card shell for admin lists / stats */
export const adminCardShell = {
  backgroundColor: 'rgba(24, 24, 27, 0.96)',
  borderRadius: 18,
  padding: 16,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.08)',
  ...Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.28,
      shadowRadius: 18,
    },
    android: { elevation: 6 },
    default: {},
  }),
} as const satisfies ViewStyle;

export const adminColors = {
  background: '#09090B',
  card: 'rgba(24, 24, 27, 0.96)',
  cardElevated: 'rgba(39, 39, 42, 0.95)',
  text: '#FAFAFA',
  textMuted: '#A1A1AA',
  primary: t.primary,
  primarySoft: 'rgba(168, 85, 247, 0.16)',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  error: t.dangerText,
  accentBlue: '#38BDF8',
  accentGreen: '#22C55E',
  accentAmber: '#F59E0B',
  dangerBg: 'rgba(239, 68, 68, 0.12)',
  successBg: 'rgba(34, 197, 94, 0.12)',
  successText: '#4ADE80',
  onPrimary: '#FFFFFF',
  gradientTop: '#12121A',
  gradientBottom: '#09090B',
} as const;

/** Keep legacy export used by older cards. */
void shadows;
void theme;
