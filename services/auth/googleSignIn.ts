import {
  GoogleAuthProvider,
  signInAnonymously,
  signInWithCredential,
} from 'firebase/auth';
import { Platform } from 'react-native';
import { auth } from '@/services/firebase';

type DemoGoogleSignInResult = {
  user: {
    id: string;
  };
};

export async function signInWithGoogle(): Promise<void | DemoGoogleSignInResult> {
  if (Platform.OS === 'web') {
    // Web demo-safe path: avoid native-module-dependent auth flow.
    if (!auth.currentUser) {
      await signInAnonymously(auth);
    }
    console.log('Google Sign-In web demo mode');
    return { user: { id: 'demo' } };
  }

  const AuthSession = await import('expo-auth-session');
  const WebBrowser = await import('expo-web-browser');
  WebBrowser.maybeCompleteAuthSession();

  const GOOGLE_DISCOVERY = {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
  };

  const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';
  if (!clientId) {
    throw new Error('Missing EXPO_PUBLIC_GOOGLE_CLIENT_ID');
  }

  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'halforder',
  });

  const request = new AuthSession.AuthRequest({
    clientId,
    scopes: ['openid', 'profile', 'email'],
    responseType: AuthSession.ResponseType.IdToken,
    redirectUri,
    prompt: AuthSession.Prompt.SelectAccount,
  });

  const result = await request.promptAsync(GOOGLE_DISCOVERY);
  if (result.type !== 'success') {
    throw new Error('Google sign-in was cancelled.');
  }

  const idToken = result.params.id_token;
  if (!idToken) {
    throw new Error('Google sign-in failed: missing id_token');
  }

  const credential = GoogleAuthProvider.credential(idToken);
  await signInWithCredential(auth, credential);
}
