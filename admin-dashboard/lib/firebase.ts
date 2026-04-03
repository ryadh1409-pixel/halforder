/**
 * Firebase client for the OurFood / HalfOrder admin web dashboard.
 * Must match the Expo app project (`services/firebase.ts`).
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyDbXyGYAVJU818J7mpiJXOOexAbOQuLJvo',
  authDomain: 'halforfer.firebaseapp.com',
  projectId: 'halforfer',
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

const app = getOrCreateApp();

export { firebaseConfig };
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
