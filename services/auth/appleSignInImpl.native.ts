import * as AppleAuthentication from 'expo-apple-authentication';
import { OAuthProvider, signInWithCredential, updateProfile } from 'firebase/auth';
import { auth } from '../firebase';

export async function signInWithApple(): Promise<void> {
  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) {
    throw new Error('Apple Sign-In is not available on this device.');
  }

  const appleCredential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!appleCredential.identityToken) {
    throw new Error('Apple sign-in failed: missing identity token.');
  }

  const provider = new OAuthProvider('apple.com');
  const firebaseCredential = provider.credential({
    idToken: appleCredential.identityToken,
  });
  const userCredential = await signInWithCredential(auth, firebaseCredential);

  // Apple only returns the full name on the first authorization.
  const given = appleCredential.fullName?.givenName?.trim() ?? '';
  const family = appleCredential.fullName?.familyName?.trim() ?? '';
  const displayName = [given, family].filter(Boolean).join(' ').trim();
  if (displayName && !userCredential.user.displayName) {
    try {
      await updateProfile(userCredential.user, { displayName });
    } catch {
      // Non-fatal — Firestore profile bootstrap still runs from auth state.
    }
  }
}
