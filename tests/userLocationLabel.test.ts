import {
  displaySavedAddressTypeLabel,
  readSavedLocationCustomLabelFromUserDoc,
  readSavedLocationLabelFromUserDoc,
} from '@/lib/location/userLocationLabel';

describe('userLocationLabel', () => {
  it('reads locationLabel and nested type', () => {
    expect(
      readSavedLocationLabelFromUserDoc({ locationLabel: 'apartment' }),
    ).toBe('apartment');
    expect(
      readSavedLocationLabelFromUserDoc({
        location: { type: 'Building' },
      }),
    ).toBe('building');
  });

  it('reads custom label from top-level and nested fields', () => {
    expect(
      readSavedLocationCustomLabelFromUserDoc({
        locationCustomLabel: 'Office',
      }),
    ).toBe('Office');
    expect(
      readSavedLocationCustomLabelFromUserDoc({
        location: { customLabel: 'Parents' },
      }),
    ).toBe('Parents');
  });

  it('displays custom label for Custom type', () => {
    expect(displaySavedAddressTypeLabel('custom', 'Campus')).toBe('Campus');
    expect(displaySavedAddressTypeLabel('custom', '')).toBe('Custom');
    expect(displaySavedAddressTypeLabel('home')).toBe('Home');
  });
});
