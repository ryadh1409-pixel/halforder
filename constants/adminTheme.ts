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
  backgroundColor: 'rgba(21, 17, 38, 0.96)',
  borderRadius: 20,
  padding: 16,
  borderWidth: 1,
  borderColor: 'rgba(168, 85, 247, 0.18)',
  ...Platform.select({
    ios: {
      shadowColor: '#7C3AED',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.22,
      shadowRadius: 22,
    },
    android: { elevation: 8 },
    default: {},
  }),
} as const satisfies ViewStyle;

export const adminColors = {
  background: '#0B0816',
  card: 'rgba(21, 17, 38, 0.96)',
  cardElevated: 'rgba(27, 22, 48, 0.96)',
  text: '#FAFAFA',
  textMuted: '#9B93B0',
  primary: t.primary,
  primarySoft: 'rgba(168, 85, 247, 0.16)',
  border: 'rgba(168, 85, 247, 0.18)',
  borderStrong: 'rgba(168, 85, 247, 0.28)',
  error: t.dangerText,
  accentBlue: '#38BDF8',
  accentGreen: '#22C55E',
  accentAmber: '#F59E0B',
  dangerBg: 'rgba(239, 68, 68, 0.12)',
  successBg: 'rgba(34, 197, 94, 0.12)',
  successText: '#4ADE80',
  onPrimary: '#FFFFFF',
  gradientTop: '#151126',
  gradientBottom: '#0B0816',
} as const;

/** Keep legacy export used by older cards. */
void shadows;
void theme;
