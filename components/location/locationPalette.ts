import { ordersPalette } from '@/theme/theme';

export type LocationPalette = {
  surface: string;
  surfaceMuted: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  inputBg: string;
  chipBg: string;
  primary: string;
  onPrimary: string;
  danger: string;
  success: string;
};

/** Orders Hub dark palette — used for all location UI. */
export const LOCATION_PALETTE_DARK: LocationPalette = {
  surface: ordersPalette.surfaceSolid,
  surfaceMuted: ordersPalette.surfaceElevated,
  text: ordersPalette.text,
  textSecondary: ordersPalette.textSecondary,
  textTertiary: ordersPalette.textTertiary,
  border: ordersPalette.border,
  inputBg: ordersPalette.input,
  chipBg: 'rgba(255,255,255,0.08)',
  primary: ordersPalette.accent,
  onPrimary: ordersPalette.text,
  danger: ordersPalette.danger,
  success: ordersPalette.success,
};

/** Same as dark — app is Orders-themed throughout. */
export const LOCATION_PALETTE_LIGHT: LocationPalette = {
  ...LOCATION_PALETTE_DARK,
};
