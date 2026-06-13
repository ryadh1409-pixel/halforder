import {
  getUserFriendlyError,
  ROLE_ORDER_UPDATE_ERROR,
} from '@/services/errors/userFriendlyErrors';

describe('userFriendlyErrors', () => {
  it('maps permission-denied to generic safe copy', () => {
    expect(getUserFriendlyError({ code: 'permission-denied' })).toBe(
      "We couldn't complete your request. Please try again.",
    );
  });

  it('maps auth/network-request-failed to connection copy', () => {
    expect(getUserFriendlyError({ code: 'auth/network-request-failed' })).toBe(
      'Connection problem. Check your internet and try again.',
    );
  });

  it('maps storage/unknown to upload copy', () => {
    expect(getUserFriendlyError({ code: 'storage/unknown' }, { context: 'upload' })).toBe(
      'Unable to upload the file. Please try again.',
    );
  });

  it('maps auth/invalid-credential to sign-in copy', () => {
    expect(getUserFriendlyError({ code: 'auth/invalid-credential' })).toBe(
      'Unable to sign in. Please check your details.',
    );
  });

  it('maps auth/user-not-found to account copy', () => {
    expect(getUserFriendlyError({ code: 'auth/user-not-found' })).toBe('Account not found.');
  });

  it('maps auth/wrong-password to credential copy', () => {
    expect(getUserFriendlyError({ code: 'auth/wrong-password' })).toBe(
      'Incorrect email or password.',
    );
  });

  it('uses customer order lifecycle copy for role failures', () => {
    expect(
      getUserFriendlyError(
        { code: 'permission-denied' },
        { role: 'customer', context: 'order' },
      ),
    ).toBe(ROLE_ORDER_UPDATE_ERROR.customer);
  });

  it('uses driver order lifecycle copy for role failures', () => {
    expect(
      getUserFriendlyError(
        { code: 'permission-denied' },
        { role: 'driver', context: 'driver' },
      ),
    ).toBe(ROLE_ORDER_UPDATE_ERROR.driver);
  });

  it('uses restaurant order lifecycle copy for role failures', () => {
    expect(
      getUserFriendlyError(
        { code: 'permission-denied' },
        { role: 'restaurant', context: 'restaurant' },
      ),
    ).toBe(ROLE_ORDER_UPDATE_ERROR.restaurant);
  });

  it('never returns raw FirebaseError text', () => {
    expect(
      getUserFriendlyError({
        code: 'permission-denied',
        message: 'FirebaseError: Missing or insufficient permissions.',
      }),
    ).toBe("We couldn't complete your request. Please try again.");
  });
});
