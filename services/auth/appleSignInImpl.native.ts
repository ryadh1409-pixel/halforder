import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { OAuthProvider, signInWithCredential, updateProfile } from 'firebase/auth';
import { auth } from '../firebase';

function logAppleAuthError(stage: string, error: unknown): void {
  const e = error as {
    code?: string;
    message?: string;
    nativeErrorCode?: string | number;
    nativeErrorMessage?: string;
    stack?: string;
  };
  console.error('[Apple Sign-In] ORIGINAL ERROR', {
    stage,
    code: e?.code ?? null,
    message: e?.message ?? String(error),
    nativeErrorCode: e?.nativeErrorCode ?? null,
    nativeErrorMessage: e?.nativeErrorMessage ?? null,
    stack: e?.stack ?? null,
    raw: error,
  });
}

function randomNonce(length = 32): string {
  const charset =
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._';
  const bytes = Crypto.getRandomValues(new Uint8Array(length));
  let value = '';
  for (let i = 0; i < length; i += 1) {
    value += charset[bytes[i] % charset.length];
  }
  return value;
}

export async function signInWithApple(): Promise<void> {
  try {
    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
      throw new Error(
        'Apple Sign-In is not available on this device. Ensure ios.usesAppleSignIn is true and rebuild the iOS app.',
      );
    }

    // Firebase requires rawNonce; Apple requires the SHA-256 of that nonce.
    const rawNonce = randomNonce();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );

    // Exact native failure point when Sign In with Apple entitlement is missing:
    // AppleAuthentication.signInAsync → AuthorizationError (e.g. code 1000).
    const appleCredential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!appleCredential.identityToken) {
      throw new Error('Apple sign-in failed: missing identity token.');
    }

    const provider = new OAuthProvider('apple.com');
    const firebaseCredential = provider.credential({
      idToken: appleCredential.identityToken,
      rawNonce,
    });

    // Exact Firebase failure point when nonce/provider/config is wrong:
    // signInWithCredential → FirebaseError (e.g. auth/invalid-credential).
    const userCredential = await signInWithCredential(auth, firebaseCredential);

    // Apple only returns the full name on the first authorization.
    const given = appleCredential.fullName?.givenName?.trim() ?? '';
    const family = appleCredential.fullName?.familyName?.trim() ?? '';
    const displayName = [given, family].filter(Boolean).join(' ').trim();
    if (displayName && !userCredential.user.displayName) {
      try {
        await updateProfile(userCredential.user, { displayName });
      } catch (profileErr) {
        logAppleAuthError('updateProfile', profileErr);
      }
    }
  } catch (error) {
    logAppleAuthError('signInWithApple', error);
    throw error;
  }
}
