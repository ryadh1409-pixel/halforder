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

type GoogleAuthSuccessResult = {
  type: 'success';
  params: Record<string, string>;
  authentication: AuthSession.TokenResponse | null;
};

function pickIdToken(result: {
  authentication?: AuthSession.TokenResponse | null;
  params?: Record<string, string>;
}): string | null {
  const fromAuth = result.authentication?.idToken;
  if (typeof fromAuth === 'string' && fromAuth.trim()) return fromAuth.trim();
  const fromParams = result.params?.id_token;
  if (typeof fromParams === 'string' && fromParams.trim()) return fromParams.trim();
  return null;
}

/**
 * On native, Google.useAuthRequest defaults to response_type=code.
 * promptAsync resolves with the authorization code before the provider hook's
 * auto-exchange updates React state — so we exchange the code for tokens here.
 */
async function resolveGoogleIdToken(params: {
  result: GoogleAuthSuccessResult;
  request: AuthSession.AuthRequest;
  clientId: string;
  redirectUri: string;
}): Promise<string> {
  const { result, request, clientId, redirectUri } = params;

  const existing = pickIdToken(result);
  if (existing) return existing;

  const code =
    typeof result.params?.code === 'string' ? result.params.code.trim() : '';
  if (!code) {
    logGoogleAuthError('missing_authorization_code', result);
    throw new Error('Unable to sign in with Google. Please try again.');
  }

  console.log('[Google Sign-In] exchanging authorization code for tokens', {
    hasCode: true,
    hasCodeVerifier: Boolean(request.codeVerifier),
    clientId,
    redirectUri,
  });

  try {
    const tokenResponse = await AuthSession.exchangeCodeAsync(
      {
        clientId,
        code,
        redirectUri,
        extraParams: {
          code_verifier: request.codeVerifier ?? '',
        },
      },
      Google.discovery,
    );

    const idToken =
      typeof tokenResponse.idToken === 'string' && tokenResponse.idToken.trim()
        ? tokenResponse.idToken.trim()
        : null;

    console.log('[Google Sign-In] code exchange result', {
      hasIdToken: Boolean(idToken),
      hasAccessToken: Boolean(tokenResponse.accessToken),
    });

    if (!idToken) {
      logGoogleAuthError('missing_id_token_after_code_exchange', tokenResponse);
      throw new Error('Unable to sign in with Google. Please try again.');
    }

    return idToken;
  } catch (error) {
    logGoogleAuthError('exchangeCodeAsync', error);
    throw error instanceof Error
      ? error
      : new Error('Unable to sign in with Google. Please try again.');
  }
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

  /** Platform OAuth client used for the auth request + code exchange. */
  const oauthClientId = useMemo(() => {
    if (Platform.OS === 'ios') return iosClientId;
    if (Platform.OS === 'android') return webClientId;
    return webClientId;
  }, [iosClientId, webClientId]);

  const [request, , promptAsync] = Google.useAuthRequest({
    iosClientId: iosClientId || undefined,
    webClientId: webClientId || undefined,
    scopes: ['openid', 'profile', 'email'],
    redirectUri,
    // We exchange the code ourselves right after promptAsync (see resolveGoogleIdToken).
    shouldAutoExchangeCode: false,
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
      if (!oauthClientId) {
        console.error('[Google Sign-In] ORIGINAL ERROR', {
          stage: 'missing_oauth_client_id',
          platform: Platform.OS,
        });
        throw new Error('Unable to sign in with Google. Please try again.');
      }

      console.log('[Google Sign-In] starting', {
        iosClientId,
        webClientId,
        reversedClientId,
        redirectUri,
        oauthClientId,
      });

      // Exact native/OAuth failure point for redirect_uri_mismatch / scheme errors:
      // promptAsync() — Google rejects redirect or app cannot open reversed client URL scheme.
      const result = await promptAsync();
      console.log('[Google Sign-In] promptAsync result', {
        type: result.type,
        params:
          result.type === 'success'
            ? {
                hasIdToken: Boolean(pickIdToken(result)),
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

      const idToken = await resolveGoogleIdToken({
        result: {
          type: 'success',
          params: result.params,
          authentication: result.authentication,
        },
        request,
        clientId: oauthClientId,
        redirectUri,
      });

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
  }, [
    promptAsync,
    request,
    iosClientId,
    webClientId,
    reversedClientId,
    redirectUri,
    oauthClientId,
  ]);

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
