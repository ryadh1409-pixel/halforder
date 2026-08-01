/**
 * User Activity Tracker
 * Logs sign-in events, page views, and button clicks to Firestore.
 *
 * Structure:
 *   userActivity/{uid}            - summary doc (lastPage, lastActiveAt, signInCount…)
 *   userActivity/{uid}/events/{…} - individual event docs
 */
import { db } from '@/services/firebase';
import {
  collection,
  doc,
  increment,
  serverTimestamp,
  setDoc,
  addDoc,
} from 'firebase/firestore';
import { InteractionManager, Platform } from 'react-native';

export type ActivityEventType = 'signin' | 'page_view' | 'button_click';

export interface ActivityEvent {
  type: ActivityEventType;
  page?: string;
  buttonName?: string;
  platform: string;
  createdAt: ReturnType<typeof serverTimestamp>;
}

const platform = Platform.OS; // 'ios' | 'android' | 'web'

/** Update the summary doc + write an event. Fire-and-forget (never throws). */
async function writeEvent(
  uid: string,
  event: Omit<ActivityEvent, 'platform' | 'createdAt'>,
  summaryPatch: Record<string, unknown>,
): Promise<void> {
  try {
    const summaryRef = doc(db, 'userActivity', uid);
    const eventsRef = collection(db, 'userActivity', uid, 'events');

    await Promise.all([
      setDoc(
        summaryRef,
        {
          uid,
          ...summaryPatch,
          lastActiveAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ),
      addDoc(eventsRef, {
        ...event,
        platform,
        createdAt: serverTimestamp(),
      }),
    ]);
  } catch {
    // Never throw — tracking must not disrupt UX
  }
}

/**
 * Defer a write until after all JS-thread interactions (animations, transitions)
 * have finished. This ensures tracking never competes with the UI thread.
 */
function afterInteractions(fn: () => void): void {
  InteractionManager.runAfterInteractions(fn);
}

/**
 * Call when a non-anonymous user signs in.
 * Updates lastSignInAt, increments signInCount, logs a signin event.
 */
export async function trackSignIn(
  uid: string,
  displayName: string | null,
  email: string | null,
): Promise<void> {
  await writeEvent(
    uid,
    { type: 'signin' },
    {
      displayName: displayName ?? null,
      email: email ?? null,
      lastSignInAt: serverTimestamp(),
      signInCount: increment(1),
    },
  );
}

/**
 * Call from usePageTracking hook when a screen comes into focus.
 * Deferred via InteractionManager so the tab-switch animation finishes first.
 */
export function trackPageView(uid: string, page: string): void {
  afterInteractions(() => {
    void writeEvent(uid, { type: 'page_view', page }, { lastPage: page });
  });
}

/**
 * Call from any pressable to log a meaningful button tap.
 * Keep buttonName concise: 'place_order', 'open_cart', etc.
 * Deferred so the press feedback animation is never blocked.
 */
export function trackButtonClick(
  uid: string,
  buttonName: string,
  page: string,
): void {
  afterInteractions(() => {
    void writeEvent(
      uid,
      { type: 'button_click', buttonName, page },
      { lastPage: page },
    );
  });
}
