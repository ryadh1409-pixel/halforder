import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { GoogleAuthProvider, signInWithCredential, type User } from 'firebase/auth';
import { useCallback, useMemo, useState } from 'react';

import { auth } from './firebase';

WebBrowser.maybeCompleteAuthSession();

export type GoogleLoginUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
};

type GoogleLoginResult = {
  user: GoogleLoginUser;
};

export function useGoogleAuth() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectUri = useMemo(
    () =>
      AuthSession.makeRedirectUri({
        scheme: 'halforder',
      }),
    [],
  );

  const [request, , promptAsync] = Google.useAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    expoClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    scopes: ['openid', 'profile', 'email'],
    redirectUri,
  });

  const signInWithGoogle = useCallback(async (): Promise<GoogleLoginResult> => {
    setLoading(true);
    setError(null);
    try {
      if (!request) {
        throw new Error('Google sign-in is not ready yet.');
      }
      const result = await promptAsync();
      if (result.type !== 'success') {
        throw new Error('Google sign-in was cancelled.');
      }

      const idToken =
        result.authentication?.idToken ??
        (typeof result.params?.id_token === 'string'
          ? result.params.id_token
          : null);
      if (!idToken) {
        throw new Error('Google sign-in failed: missing id_token');
      }

      const credential = GoogleAuthProvider.credential(idToken);
      const userCredential = await signInWithCredential(auth, credential);
      return { user: mapUser(userCredential.user) };
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Google sign-in failed. Please try again.';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [promptAsync, request]);

  return {
    signInWithGoogle,
    loading,
    error,
    requestReady: Boolean(request),
  };
}

function mapUser(user: User): GoogleLoginUser {
  return {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
  };
}
