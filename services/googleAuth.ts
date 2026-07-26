import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { GoogleAuthProvider, signInWithCredential, type User } from 'firebase/auth';
import { useCallback, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { getReadableErrorMessage } from '../utils/errorMessages';
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

function iosReversedClientId(iosClientId: string): string | null {
  const id = iosClientId.trim();
  if (!id.endsWith('.apps.googleusercontent.com')) return null;
  const prefix = id.replace(/\.apps\.googleusercontent\.com$/, '');
  if (!prefix) return null;
  return `com.googleusercontent.apps.${prefix}`;
}

function logGoogleAuthError(stage: string, error: unknown): void {
  const e = error as {
    code?: string;
    message?: string;
    stack?: string;
  };
  console.error('[Google Sign-In] ORIGINAL ERROR', {
    stage,
    code: e?.code ?? null,
    message: e?.message ?? String(error),
    stack: e?.stack ?? null,
    raw: error,
  });
}

export function useGoogleAuth() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? '';
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? '';
  const reversedClientId = useMemo(
    () => iosReversedClientId(iosClientId),
    [iosClientId],
  );

  /**
   * Google iOS OAuth clients require:
   *   com.googleusercontent.apps.{IOS_CLIENT_PREFIX}:/oauthredirect
   * That scheme MUST also be in CFBundleURLTypes (app.json).
   */
  const redirectUri = useMemo(() => {
    if (Platform.OS === 'ios' && reversedClientId) {
      return AuthSession.makeRedirectUri({
        native: `${reversedClientId}:/oauthredirect`,
      });
    }
    return AuthSession.makeRedirectUri({
      scheme: 'halforder',
    });
  }, [reversedClientId]);

  const [request, , promptAsync] = Google.useAuthRequest({
    iosClientId: iosClientId || undefined,
    webClientId: webClientId || undefined,
    scopes: ['openid', 'profile', 'email'],
    redirectUri,
  });

  const signInWithGoogle = useCallback(async (): Promise<GoogleLoginResult> => {
    setLoading(true);
    setError(null);
    try {
      if (!iosClientId || !webClientId) {
        console.error('[Google Sign-In] ORIGINAL ERROR', {
          stage: 'missing_client_ids',
          hasIosClientId: Boolean(iosClientId),
          hasWebClientId: Boolean(webClientId),
        });
        throw new Error('Unable to sign in with Google. Please try again.');
      }
      if (Platform.OS === 'ios' && !reversedClientId) {
        console.error('[Google Sign-In] ORIGINAL ERROR', {
          stage: 'invalid_reversed_client_id',
          iosClientId,
        });
        throw new Error('Unable to sign in with Google. Please try again.');
      }
      if (!request) {
        throw new Error('Google sign-in is not ready yet.');
      }

      console.log('[Google Sign-In] starting', {
        iosClientId,
        webClientId,
        reversedClientId,
        redirectUri,
      });

      // Exact native/OAuth failure point for redirect_uri_mismatch / scheme errors:
      // promptAsync() — Google rejects redirect or app cannot open reversed client URL scheme.
      const result = await promptAsync();
      console.log('[Google Sign-In] promptAsync result', {
        type: result.type,
        params:
          result.type === 'success'
            ? {
                hasIdToken: Boolean(
                  result.authentication?.idToken ?? result.params?.id_token,
                ),
                hasCode: Boolean(result.params?.code),
                error: result.params?.error ?? null,
                errorDescription: result.params?.error_description ?? null,
              }
            : result,
      });

      if (result.type !== 'success') {
        const googleError =
          result.type === 'error'
            ? result.error ?? result
            : result;
        logGoogleAuthError('promptAsync', googleError);
        throw new Error(
          result.type === 'dismiss' || result.type === 'cancel'
            ? 'Google sign-in was cancelled.'
            : 'Unable to sign in with Google. Please try again.',
        );
      }

      const idToken =
        result.authentication?.idToken ??
        (typeof result.params?.id_token === 'string'
          ? result.params.id_token
          : null);
      if (!idToken) {
        logGoogleAuthError('missing_id_token', result);
        throw new Error('Unable to sign in with Google. Please try again.');
      }

      const credential = GoogleAuthProvider.credential(idToken);
      // Exact Firebase failure point:
      // signInWithCredential → FirebaseError (e.g. auth/invalid-credential).
      const userCredential = await signInWithCredential(auth, credential);
      return { user: mapUser(userCredential.user) };
    } catch (e) {
      logGoogleAuthError('signInWithGoogle', e);
      const message = getReadableErrorMessage(e);
      setError(message);
      throw e instanceof Error ? e : new Error(message);
    } finally {
      setLoading(false);
    }
  }, [promptAsync, request, iosClientId, webClientId, reversedClientId, redirectUri]);

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
