import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { OAuthProvider, signInWithCredential, updateProfile } from 'firebase/auth';
import { Platform } from 'react-native';
import { auth } from '../firebase';

type NativeAppleError = {
  name?: string;
  code?: string;
  message?: string;
  domain?: string;
  nativeStackIOS?: string;
  userInfo?: Record<string, unknown>;
  nativeErrorCode?: string | number;
  nativeErrorMessage?: string;
  cause?: unknown;
  stack?: string;
};

function serializeUnknown(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value !== 'object') return value;
  if (depth > 3) return String(value);
  if (value instanceof Error) {
    const e = value as NativeAppleError & Error;
    const out: Record<string, unknown> = {
      name: e.name,
      message: e.message,
      code: e.code ?? null,
      domain: e.domain ?? null,
      nativeErrorCode: e.nativeErrorCode ?? null,
      nativeErrorMessage: e.nativeErrorMessage ?? null,
      userInfo: e.userInfo ?? null,
      stack: e.stack ?? null,
      nativeStackIOS: e.nativeStackIOS ?? null,
    };
    // Enumerate non-enumerable / extra fields Expo may attach.
    for (const key of Reflect.ownKeys(value)) {
      const k = String(key);
      if (k in out) continue;
      try {
        out[k] = serializeUnknown(
          (value as unknown as Record<string | symbol, unknown>)[key],
          depth + 1,
        );
      } catch {
        out[k] = '[unreadable]';
      }
    }
    if (e.cause !== undefined) {
      out.cause = serializeUnknown(e.cause, depth + 1);
    }
    return out;
  }
  if (Array.isArray(value)) {
    return value.map((v) => serializeUnknown(v, depth + 1));
  }
  const obj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    obj[k] = serializeUnknown(v, depth + 1);
  }
  return obj;
}

function logAppleStage(stage: string, payload?: Record<string, unknown>): void {
  console.log(`[Apple Sign-In] ${stage}`, payload ?? {});
}

function logAppleAuthError(stage: string, error: unknown): void {
  console.error('[Apple Sign-In] ORIGINAL ERROR', {
    stage,
    serialized: serializeUnknown(error),
    raw: error,
  });
}

/**
 * Firebase / Apple sample charset (must stay URL/token safe).
 * @see https://firebase.google.com/docs/auth/ios/apple
 */
function randomNonce(length = 32): string {
  const charset =
    '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
  const bytes = Crypto.getRandomValues(new Uint8Array(length));
  let value = '';
  for (let i = 0; i < length; i += 1) {
    value += charset[bytes[i] % charset.length];
  }
  return value;
}

export async function signInWithApple(): Promise<void> {
  let executionStage:
    | 'before_availability'
    | 'before_signInAsync'
    | 'inside_signInAsync'
    | 'after_credential'
    | 'before_firebase'
    | 'during_firebase' = 'before_availability';

  try {
    if (Platform.OS !== 'ios') {
      throw new Error('Apple Sign-In is only available on iOS.');
    }

    logAppleStage('native_module_probe', {
      platform: Platform.OS,
      hasAppleAuthenticationModule: Boolean(AppleAuthentication),
      hasIsAvailableAsync: typeof AppleAuthentication.isAvailableAsync === 'function',
      hasSignInAsync: typeof AppleAuthentication.signInAsync === 'function',
    });

    const available = await AppleAuthentication.isAvailableAsync();
    logAppleStage('isAvailableAsync', { available });
    if (!available) {
      console.error('[Apple Sign-In] ORIGINAL ERROR', {
        stage: 'unavailable',
        available: false,
      });
      throw new Error('Apple Sign-In is not available on this device.');
    }

    // Firebase requires rawNonce; Apple request must receive SHA-256(hex) of that nonce.
    const rawNonce = randomNonce();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
      { encoding: Crypto.CryptoEncoding.HEX },
    );

    const requestedScopes = [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ];

    logAppleStage('nonce', {
      rawNonceLength: rawNonce.length,
      // Never log the raw nonce value in production logs beyond length; hash is safe.
      sha256Nonce: hashedNonce,
      sha256NonceLength: hashedNonce.length,
    });

    const requestOptions: AppleAuthentication.AppleAuthenticationSignInOptions = {
      requestedScopes,
      nonce: hashedNonce,
    };

    logAppleStage('signInAsync_request', {
      requestedScopes: ['FULL_NAME', 'EMAIL'],
      requestedScopeValues: requestedScopes,
      nonce: hashedNonce,
    });

    executionStage = 'before_signInAsync';
    logAppleStage('execution_checkpoint', { executionStage });

    let appleCredential: AppleAuthentication.AppleAuthenticationCredential;
    executionStage = 'inside_signInAsync';
    try {
      appleCredential = await AppleAuthentication.signInAsync(requestOptions);
    } catch (nativeError) {
      logAppleAuthError('signInAsync', nativeError);
      console.error('[Apple Sign-In] stopped_at', { executionStage });
      // Re-throw the ORIGINAL native error — do not replace it.
      throw nativeError;
    }

    executionStage = 'after_credential';
    logAppleStage('raw_credential', {
      user: appleCredential.user ?? null,
      email: appleCredential.email ?? null,
      fullName: appleCredential.fullName ?? null,
      realUserStatus: appleCredential.realUserStatus ?? null,
      state: appleCredential.state ?? null,
      identityTokenExists: Boolean(appleCredential.identityToken),
      authorizationCodeExists: Boolean(appleCredential.authorizationCode),
      identityTokenLength: appleCredential.identityToken?.length ?? 0,
      authorizationCodeLength: appleCredential.authorizationCode?.length ?? 0,
    });

    if (!appleCredential.identityToken) {
      console.error('[Apple Sign-In] ORIGINAL ERROR', {
        stage: 'missing_identity_token',
        executionStage,
        credential: {
          user: appleCredential.user,
          email: appleCredential.email,
          authorizationCodeExists: Boolean(appleCredential.authorizationCode),
        },
      });
      throw new Error('Unable to sign in with Apple. Please try again.');
    }

    executionStage = 'before_firebase';
    logAppleStage('execution_checkpoint', { executionStage });

    const provider = new OAuthProvider('apple.com');
    const firebaseCredential = provider.credential({
      idToken: appleCredential.identityToken,
      rawNonce,
    });

    executionStage = 'during_firebase';
    logAppleStage('firebase_signInWithCredential_start', {
      providerId: 'apple.com',
      hasIdToken: true,
      hasRawNonce: true,
    });

    const userCredential = await signInWithCredential(auth, firebaseCredential);

    logAppleStage('firebase_signInWithCredential_success', {
      uid: userCredential.user.uid,
      email: userCredential.user.email,
    });

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
    console.error('[Apple Sign-In] stopped_at', { executionStage });
    throw error;
  }
}
