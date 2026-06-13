import {
  formatRestaurantPhoneDisplay,
  resolveRestaurantDisplayName,
  resolveRestaurantLogoUrl,
  resolveRestaurantPhoneNumber,
  resolveRestaurantProfilePhone,
} from '@/lib/restaurantDashboardProfile';

describe('restaurantDashboardProfile', () => {
  it('prefers logoUrl over legacy logo', () => {
    expect(
      resolveRestaurantLogoUrl({
        logo: 'https://example.com/legacy.jpg',
        logoUrl: 'https://example.com/logo.jpg',
      }),
    ).toBe('https://example.com/logo.jpg');
  });

  it('resolves phoneNumber before phone', () => {
    expect(
      resolveRestaurantPhoneNumber({
        phone: '+1 (555) 111-2222',
        phoneNumber: '+1 (555) 999-8888',
      }),
    ).toBe('+1 (555) 999-8888');
  });

  it('falls back to users doc phone', () => {
    expect(
      resolveRestaurantPhoneNumber({}, { phone: '+1 (555) 444-3333' }),
    ).toBe('+1 (555) 444-3333');
  });

  it('falls back to auth phone when restaurant doc has no phone', () => {
    expect(
      resolveRestaurantProfilePhone({
        restaurantData: {},
        authPhoneNumber: '+15551234567',
      }),
    ).toBe('+15551234567');
  });

  it('shows No phone number when missing', () => {
    expect(formatRestaurantPhoneDisplay(null)).toBe('No phone number');
  });

  it('resolves restaurant display name', () => {
    expect(resolveRestaurantDisplayName({ name: 'Tkal Kitchen' })).toBe('Tkal Kitchen');
    expect(resolveRestaurantDisplayName({})).toBe('Restaurant');
  });
});
