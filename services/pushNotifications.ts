/**
 * Firestore sync for Expo push tokens (uses `./notifications` for channels + project id).
 */
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

import { db } from '@/services/firebase';
import {
  configureForegroundNotificationHandler,
  ensureAndroidNotificationChannelAsync,
  resolveExpoProjectId,
} from '@/services/notifications';
import * as Notifications from 'expo-notifications';

const PUSH_TOKEN_DOC_ID = 'default';

/** Avoid duplicate token fetch / Firestore writes when `onAuthStateChanged` fires more than once for the same uid+token. */
let lastExpoPushSynced: { uid: string; token: string } | null = null;

/** @see configureForegroundNotificationHandler in `./notifications` */
export function configureExpoPushNotificationHandler(): void {
  configureForegroundNotificationHandler();
}

/**
 * Ask for notification permission on app start (native only).
 */
export async function requestNotificationPermissionOnAppLaunch(): Promise<Notifications.PermissionStatus> {
  if (Platform.OS === 'web') {
    return Notifications.PermissionStatus.UNDETERMINED;
  }

  await ensureAndroidNotificationChannelAsync();

  try {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    if (status !== Notifications.PermissionStatus.GRANTED) {
      console.log(
        '[push] Notification permission not granted at launch:',
        status,
      );
    }
    return status;
  } catch (e) {
    console.warn('[push] requestPermissionsAsync failed:', e);
    return Notifications.PermissionStatus.DENIED;
  }
}

/**
 * Writes `users/{uid}` with `setDoc(..., { merge: true })`.
 * Includes `expoPushToken` plus mirrors for Cloud Functions / legacy readers.
 */
export async function persistUserPushTokens(
  uid: string,
  token: string,
): Promise<void> {
  if (Platform.OS === 'web' || !uid?.trim() || !token?.trim()) return;

  const userRef = doc(db, 'users', uid);
  const tokenRef = doc(db, 'users', uid, 'pushToken', PUSH_TOKEN_DOC_ID);

  await setDoc(
    userRef,
    {
      expoPushToken: token,
      expoPushTokenUpdatedAt: serverTimestamp(),
      fcmToken: token,
      fcmTokenUpdatedAt: serverTimestamp(),
      pushToken: token,
      pushTokenUpdatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await setDoc(
    tokenRef,
    {
      token,
      platform: Platform.OS,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  lastExpoPushSynced = { uid, token };
}

/**
 * After Firebase Auth login: read Expo push token and merge onto `users/{uid}`.
 * Skips duplicate work for the same uid+token in one app session.
 */
export async function registerExpoPushTokenAndSyncToFirestore(
  uid: string,
): Promise<void> {
  if (Platform.OS === 'web' || !uid?.trim()) return;

  await ensureAndroidNotificationChannelAsync();

  let permission: Notifications.PermissionStatus;
  try {
    const perm = await Notifications.getPermissionsAsync();
    permission = perm.status;
  } catch (e) {
    console.warn('[push] getPermissionsAsync failed:', e);
    return;
  }

  if (permission !== Notifications.PermissionStatus.GRANTED) {
    console.log(
      '[push] Notification permission denied or not determined; skipping Expo token sync.',
      permission,
    );
    return;
  }

  const projectId = resolveExpoProjectId();
  let token: string;
  try {
    const result = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    token = result.data;
  } catch (e) {
    console.warn('[push] getExpoPushTokenAsync failed:', e);
    return;
  }

  if (typeof token !== 'string' || !token.trim()) {
    console.log('[push] No Expo push token returned.');
    return;
  }

  if (lastExpoPushSynced?.uid === uid && lastExpoPushSynced?.token === token) {
    return;
  }

  console.log('Expo Push Token:', token);

  try {
    await persistUserPushTokens(uid, token);
  } catch (e) {
    console.warn('[push] Failed to save Expo token to Firestore:', e);
  }
}
