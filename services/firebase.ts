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
import { getStorage } from 'firebase/storage';
import { Platform } from 'react-native';

// Configure these values in your local `.env` file (see `.env.example`).
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
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

const app = getOrCreateApp();

export const auth = getOrCreateAuth(app);
export const db = getFirestore(app);
/** Cloud Storage — uses `storageBucket` from firebaseConfig above. */
export const storage = getStorage(app);

let authBootstrapPromise: Promise<void> | null = null;

/**
 * Ensures Firebase Auth is initialized and a user exists.
 * If no user session exists at app start, signs in anonymously.
 */
export function ensureAuthReady(): Promise<void> {
  if (authBootstrapPromise) return authBootstrapPromise;

  authBootstrapPromise = new Promise((resolve, reject) => {
    if (auth.currentUser) {
      console.log('[auth] UID:', auth.currentUser.uid);
      resolve();
      return;
    }

    let settled = false;
    let signingIn = false;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (settled) return;

      if (user) {
        settled = true;
        unsub();
        console.log('[auth] UID:', user.uid);
        resolve();
        return;
      }

      if (signingIn) return;
      signingIn = true;
      try {
        const cred = await signInAnonymously(auth);
        settled = true;
        unsub();
        console.log('[auth] UID:', cred.user.uid);
        resolve();
      } catch (error) {
        settled = true;
        unsub();
        reject(error);
      }
    });
  });

  return authBootstrapPromise;
}
