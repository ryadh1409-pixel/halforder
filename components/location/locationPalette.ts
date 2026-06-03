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

export const LOCATION_PALETTE_DARK: LocationPalette = {
  surface: '#1C1C1E',
  surfaceMuted: '#2C2C2E',
  text: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.65)',
  textTertiary: 'rgba(255,255,255,0.42)',
  border: 'rgba(255,255,255,0.12)',
  inputBg: '#141414',
  chipBg: 'rgba(255,255,255,0.08)',
  primary: '#FF7A00',
  onPrimary: '#FFFFFF',
  danger: '#F87171',
  success: '#34D399',
};

export const LOCATION_PALETTE_LIGHT: LocationPalette = {
  surface: '#FFFFFF',
  surfaceMuted: '#F1F5F9',
  text: '#222222',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
  border: '#E2E8F0',
  inputBg: '#F8FAFC',
  chipBg: '#F1F5F9',
  primary: '#16A34A',
  onPrimary: '#FFFFFF',
  danger: '#DC2626',
  success: '#16A34A',
};
