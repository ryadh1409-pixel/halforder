/**
 * Firebase client for Expo (iOS, Android, web).
 *
 * **Auth (native):** `initializeAuth` + `getReactNativePersistence(AsyncStorage)`
 * from `firebase/auth` (resolved to RN build by Metro on native).
 *
 * **Auth (web):** `getAuth` with default browser persistence.
 *
 * Native persistence is loaded with `require()` so web bundles never static-import
 * `getReactNativePersistence` (it is not exported from the browser build).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import type { Auth, Dependencies } from 'firebase/auth';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: 'AIzaSyDbXyGYAVJU818J7mpiJXOOexAbOQuLJvo',
  authDomain: 'halforfer.firebaseapp.com',
  projectId: 'halforfer',
  // Use the modern bucket domain format for Firebase Storage endpoints.
  storageBucket: 'halforfer.firebasestorage.app',
  messagingSenderId: '297728229596',
  appId: '1:297728229596:web:1921b79403d9e2d11db419',
  measurementId: 'G-JC37LM61J6',
};

function getOrCreateApp(): FirebaseApp {
  if (getApps().length === 0) {
    return initializeApp(firebaseConfig);
  }
  return getApp();
}

function isAuthAlreadyInitialized(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code: string }).code === 'auth/already-initialized'
  );
}

function getOrCreateAuth(app: FirebaseApp): Auth {
  if (Platform.OS === 'web') {
    return getAuth(app);
  }

  /** Runtime module is Firebase Auth RN build; types use public `Dependencies`. */
  /* RN-only exports must not be static-imported for Expo web bundles. */
  /* eslint-disable @typescript-eslint/no-require-imports */
  const {
    initializeAuth: initAuth,
    getAuth: getAuthImpl,
    getReactNativePersistence,
  } = require('firebase/auth') as {
    initializeAuth: (app: FirebaseApp, deps?: Dependencies) => Auth;
    getAuth: (app?: FirebaseApp) => Auth;
    getReactNativePersistence: (
      storage: typeof AsyncStorage,
    ) => Dependencies['persistence'];
  };
  /* eslint-enable @typescript-eslint/no-require-imports */

  try {
    return initAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (e) {
    if (isAuthAlreadyInitialized(e)) {
      return getAuthImpl(app);
    }
    throw e;
  }
}

export const app = getOrCreateApp();

export const auth = getOrCreateAuth(app);
export const db = getFirestore(app);
/** Cloud Storage — uses `storageBucket` from firebaseConfig above. */
export const storage = getStorage(app);

/**
 * Callable/httpsCallable region — must match deployed Functions region (default `us-central1`).
 * Wrong region → FirebaseError `functions/not-found`.
 */
export const FIREBASE_FUNCTIONS_REGION =
  process.env.EXPO_PUBLIC_FUNCTIONS_REGION?.trim() || 'us-central1';

/**
 * Same {@link FirebaseApp} as {@link auth} (`auth` was created with this `app`).
 * Use `getFunctions(app, region)` so callables and Auth share one app instance.
 */
export const functions: Functions = getFunctions(app, FIREBASE_FUNCTIONS_REGION);

/**
 * HTTPS URL for a 2nd-gen Cloud Function exported name (same region as {@link functions}).
 * Used for Stripe Connect HTTP handlers verified with Firebase ID tokens.
 */
export function cloudFunctionHttpUrl(functionName: string): string {
  const projectId = app.options.projectId;
  if (!projectId) {
    throw new Error('Firebase app is missing projectId');
  }
  const safeName = functionName.replace(/^\//, '');
  return `https://${FIREBASE_FUNCTIONS_REGION}-${projectId}.cloudfunctions.net/${safeName}`;
}

/**
 * Waits for auth state to finish loading (debounced `onAuthStateChanged` so persistence
 * is not cut off by the first `null` emission), ensures `auth.currentUser` exists
 * (anonymous sign-in only if still none), then refreshes the ID token for callables.
 */
export async function ensureAuthReady(): Promise<void> {
  await waitForAuthStateSettled(auth);

  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
  if (!auth.currentUser) {
    throw new Error('Firebase Auth could not establish a user session.');
  }

  const user = auth.currentUser;
  await user.getIdToken(true);
  console.log(
    '[auth] ensureAuthReady ok',
    JSON.stringify({
      uid: user.uid,
      isAnonymous: user.isAnonymous,
      projectId: auth.app.options.projectId,
      functionsRegion: FIREBASE_FUNCTIONS_REGION,
    }),
  );
}

/** Wait until auth stops changing briefly (restored sessions often emit null then user). */
function waitForAuthStateSettled(a: Auth, debounceMs = 120, maxWaitMs = 8000): Promise<void> {
  return new Promise((resolve) => {
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    let unsub: (() => void) | undefined;

    const done = () => {
      if (finished) return;
      finished = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      unsub?.();
      clearTimeout(maxTimer);
      resolve();
    };

    const maxTimer = setTimeout(done, maxWaitMs);

    unsub = onAuthStateChanged(a, () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(done, debounceMs);
    });
  });
}
