import {
  formatDriverProfilePhoneDisplay,
  isTrustedDriverProfilePhotoUrl,
  resolveDriverProfileIdentity,
  resolveDriverProfilePhone,
} from '@/lib/driverProfileIdentity';

describe('driverProfileIdentity', () => {
  it('resolves phone from users.phone before auth.phoneNumber', () => {
    const phone = resolveDriverProfilePhone({
      authUser: { phoneNumber: null } as never,
      userDoc: { phone: '+1 (555) 123-4567' },
      driverDoc: undefined,
    });
    expect(phone).toBe('+1 (555) 123-4567');
  });

  it('falls back to drivers.phone when users doc has no phone', () => {
    const phone = resolveDriverProfilePhone({
      authUser: { phoneNumber: null } as never,
      userDoc: {},
      driverDoc: { phone: '+1 (555) 987-6543' },
    });
    expect(phone).toBe('+1 (555) 987-6543');
  });

  it('shows Add phone number when no phone exists', () => {
    expect(formatDriverProfilePhoneDisplay(null)).toBe('Add phone number');
  });

  it('rejects Google Places photo URLs', () => {
    expect(
      isTrustedDriverProfilePhotoUrl(
        'https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=abc',
      ),
    ).toBe(false);
  });

  it('accepts Firebase Storage profile URLs', () => {
    expect(
      isTrustedDriverProfilePhotoUrl(
        'https://firebasestorage.googleapis.com/v0/b/demo/o/profiles%2Fuid.jpg',
      ),
    ).toBe(true);
  });

  it('resolves display name and trusted photo from Firestore docs', () => {
    const identity = resolveDriverProfileIdentity({
      authUser: {
        displayName: 'Auth Name',
        phoneNumber: null,
        photoURL:
          'https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=bad',
      } as never,
      userDoc: {
        displayName: 'Tkal',
        phone: '+1 (555) 111-2222',
        photoURL:
          'https://firebasestorage.googleapis.com/v0/b/demo/o/profiles%2Fuid.jpg',
      },
      driverDoc: { name: 'Driver Doc Name', phone: '+1 (555) 333-4444' },
    });

    expect(identity.displayName).toBe('Driver Doc Name');
    expect(identity.phoneRaw).toBe('+1 (555) 111-2222');
    expect(identity.photoURL).toContain('firebasestorage.googleapis.com');
  });
});
