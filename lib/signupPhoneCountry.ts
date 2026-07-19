/** Dial-code countries for email/password sign-up phone field only. */
export type SignupCountry = {
  code: string;
  name: string;
  dial: string;
  flag: string;
};

export const SIGNUP_COUNTRIES: SignupCountry[] = [
  { code: 'CA', name: 'Canada', dial: '1', flag: '🇨🇦' },
  { code: 'US', name: 'United States', dial: '1', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', dial: '44', flag: '🇬🇧' },
  { code: 'AU', name: 'Australia', dial: '61', flag: '🇦🇺' },
  { code: 'FR', name: 'France', dial: '33', flag: '🇫🇷' },
  { code: 'DE', name: 'Germany', dial: '49', flag: '🇩🇪' },
  { code: 'IN', name: 'India', dial: '91', flag: '🇮🇳' },
  { code: 'MX', name: 'Mexico', dial: '52', flag: '🇲🇽' },
  { code: 'BR', name: 'Brazil', dial: '55', flag: '🇧🇷' },
  { code: 'AE', name: 'United Arab Emirates', dial: '971', flag: '🇦🇪' },
  { code: 'SA', name: 'Saudi Arabia', dial: '966', flag: '🇸🇦' },
  { code: 'EG', name: 'Egypt', dial: '20', flag: '🇪🇬' },
  { code: 'NG', name: 'Nigeria', dial: '234', flag: '🇳🇬' },
  { code: 'ZA', name: 'South Africa', dial: '27', flag: '🇿🇦' },
  { code: 'PH', name: 'Philippines', dial: '63', flag: '🇵🇭' },
  { code: 'PK', name: 'Pakistan', dial: '92', flag: '🇵🇰' },
  { code: 'BD', name: 'Bangladesh', dial: '880', flag: '🇧🇩' },
  { code: 'TR', name: 'Turkey', dial: '90', flag: '🇹🇷' },
  { code: 'IT', name: 'Italy', dial: '39', flag: '🇮🇹' },
  { code: 'ES', name: 'Spain', dial: '34', flag: '🇪🇸' },
  { code: 'NL', name: 'Netherlands', dial: '31', flag: '🇳🇱' },
  { code: 'SE', name: 'Sweden', dial: '46', flag: '🇸🇪' },
  { code: 'NO', name: 'Norway', dial: '47', flag: '🇳🇴' },
  { code: 'DK', name: 'Denmark', dial: '45', flag: '🇩🇰' },
  { code: 'IE', name: 'Ireland', dial: '353', flag: '🇮🇪' },
  { code: 'NZ', name: 'New Zealand', dial: '64', flag: '🇳🇿' },
  { code: 'SG', name: 'Singapore', dial: '65', flag: '🇸🇬' },
  { code: 'JP', name: 'Japan', dial: '81', flag: '🇯🇵' },
  { code: 'KR', name: 'South Korea', dial: '82', flag: '🇰🇷' },
  { code: 'CN', name: 'China', dial: '86', flag: '🇨🇳' },
];

export const DEFAULT_SIGNUP_COUNTRY =
  SIGNUP_COUNTRIES.find((c) => c.code === 'CA') ?? SIGNUP_COUNTRIES[0];

export function signupPhoneDigitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/** Digits for Firestore: country dial + national number. */
export function signupPhoneForFirestore(
  country: SignupCountry,
  national: string,
): string {
  const nationalDigits = signupPhoneDigitsOnly(national);
  return `${country.dial}${nationalDigits}`;
}

/** Display string with dial prefix. */
export function formatSignupPhoneDisplay(
  country: SignupCountry,
  national: string,
): string {
  const nationalDigits = signupPhoneDigitsOnly(national);
  return nationalDigits
    ? `+${country.dial} ${nationalDigits}`
    : `+${country.dial}`;
}

export function isCompleteSignupPhone(
  country: SignupCountry,
  national: string,
): boolean {
  const nationalDigits = signupPhoneDigitsOnly(national);
  const total = country.dial.length + nationalDigits.length;
  return nationalDigits.length >= 6 && total >= 8 && total <= 15;
}
