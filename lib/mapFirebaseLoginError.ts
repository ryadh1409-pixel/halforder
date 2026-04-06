/** Maps Firebase Auth errors to user-facing copy. Never expose raw `error.message`. */
export function mapFirebaseLoginError(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code: string }).code)
      : '';

  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/invalid-login-credentials' ||
    code === 'auth/user-not-found' ||
    code === 'auth/wrong-password'
  ) {
    return 'Incorrect email or password';
  }

  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Try again later.';
  }

  if (code === 'auth/invalid-email') {
    return 'Please enter a valid email address.';
  }

  if (code === 'auth/network-request-failed') {
    return 'Check your connection and try again.';
  }

  if (code === 'auth/user-disabled') {
    return 'This account has been disabled.';
  }

  return 'Something went wrong';
}
