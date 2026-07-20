import { USER_ROLE } from '@/constants/roles';
import {
  logAuthRoleDetected, normalizeRoleForRouting, roleForSignupIntent,
  type SignupIntent
} from '@/lib/authRole';
import { isRegisteredAuthUser } from '@/lib/authSession';
import {
  markAuthSessionBootstrapComplete,
  markAuthSessionBootstrapFailed,
  markAuthSessionBootstrapStarted,
  resetAuthSessionBootstrap,
  shouldRunAuthSessionBootstrap,
} from '@/lib/authSessionBootstrap';
import {
  applySignupRole,
  assignUserRole,
  migrateUserRoleIfNeeded,
} from '@/services/authRoleAssignment';
import { refreshAuthRoleClaims } from '@/services/authRoleClaims';
import { resetForcedTokenRefreshUid } from '@/services/authTokenRefresh';
import { markDriverOffline } from '@/services/driverPresence';
import { useDevProviderMount } from '@/utils/devBootstrapDiagnostics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ConfirmationResult,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  RecaptchaVerifier,
  reload,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { useUserRole } from '../hooks/useUserRole';
import { REFERRAL_ORDER_ID_KEY, REFERRAL_STORAGE_KEY } from '../lib/invite-link';
import {
  formatProfileWhatsAppDisplay,
  profilePhoneDigitsOnly,
} from '../lib/profileWhatsAppPhone';
import { syncUserRoleToFirestore } from '../utils/admin';
import {
  getUserFriendlyError,
  isFirebaseAuthUserInvalidated,
} from '../utils/errorHandler';
import { logError } from '../utils/errorLogger';
import { createAlert } from './alerts';
import { auth, db } from './firebase';
import {
  beginFirestoreQuery,
  logFirestoreOpError,
  logFirestoreQueryFailed,
} from './firestoreQueryDiagnostics';
import { subscribeExpoPushTokenRefresh } from './notifications';
import {
  persistUserPushTokens,
  registerExpoPushTokenAndSyncToFirestore,
} from './pushNotifications';
import { claimReferralInboxRewards } from './referralRewards';
import { createRestaurant } from './restaurantService';
import { uploadImageAsync } from './uploadImage';
import type { UserRole } from './userService';
import {
  isEmailAlreadyInUseError,
  resolveAuthEmailAccountStatus,
  throwAuthFlowError,
} from './auth/emailAccountStatus';

const REFERRAL_CREDIT = 2;

export type EmailSignUpPayload = {
  email: string;
  password: string;
  fullName: string;
  whatsapp: string;
  /** Display form of phone (includes country dial code). Stored on `phone` / `whatsapp`. */
  phoneDisplay?: string;
  /** User accepted WhatsApp coordination consent on the sign-up form */
  whatsappConsent: boolean;
  /** Terms of Service accepted on the sign-up form */
  termsAccepted?: boolean;
  /** Privacy Policy accepted on the sign-up form */
  privacyAccepted?: boolean;
  /** Local file URI from ImagePicker; uploaded to `users/{uid}/profile.jpg` */
  localPhotoUri?: string | null;
  /** Account type from register URL or host/driver signup entry points. */
  signupIntent?: SignupIntent;
};

type AuthContextValue = {
  user: User | null;
  /** Auth + Firestore role subscription — false before navigation should run from `/`. */
  loading: boolean;
  /** Firebase auth listener has settled (signed-in or signed-out). */
  authReady: boolean;
  /** Firestore role subscription finished when `user` is set. */
  roleResolved: boolean;
  role: UserRole | null;
  /** `users/{uid}.role` from Firestore (for promoted admins). Always `null` when signed out. */
  firestoreUserRole: UserRole | null;
  signUpWithEmail: (payload: EmailSignUpPayload) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithPhone: (phoneNumber: string) => Promise<void>;
  confirmPhoneCode: (code: string) => Promise<void>;
  /** Reload current user from server (e.g. after email verification). */
  reloadAuthUser: () => Promise<void>;
  signOutUser: () => Promise<void>;
  switchRoleMode: (role: 'user' | 'driver' | 'restaurant') => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function ensureUserDocument(
  uid: string,
  displayName: string | null,
  email: string | null,
  phoneNumber: string | null,
  photoURL: string | null = null,
): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const promiseId = beginFirestoreQuery({
    file: 'services/AuthContext.tsx',
    listener: 'ensureUserDocument.users',
    collection: `users/${uid}`,
    filters: { op: 'getDoc' },
  });
  let snap;
  try {
    console.log('[PRE FIRESTORE]', {
      path: `users/${uid}`,
      operation: 'getDoc(ensureUserDocument)',
    });
    snap = await getDoc(userRef);
    console.log('[POST FIRESTORE]', {
      path: `users/${uid}`,
      operation: 'getDoc(ensureUserDocument)',
    });
  } catch (err) {
    console.error('[FAILED FIRESTORE]', {
      path: `users/${uid}`,
      operation: 'getDoc(ensureUserDocument)',
      error: err,
    });
    logFirestoreQueryFailed(promiseId, 'ensureUserDocument.users', err);
    throw err;
  }
  if (snap.exists()) {
    const data = snap.data();
    const updates: Record<string, unknown> = {};
    if (typeof data?.displayName !== 'string') updates.displayName = displayName ?? '';
    if (typeof data?.name !== 'string' && displayName) updates.name = displayName;
    if (data?.email == null) updates.email = email ?? null;
    if (
      typeof data?.phone !== 'string' &&
      phoneNumber &&
      phoneNumber.trim().length > 0
    ) {
      updates.phone = formatProfileWhatsAppDisplay(
        profilePhoneDigitsOnly(phoneNumber),
      );
    }
    if (
      typeof data?.whatsapp !== 'string' &&
      phoneNumber &&
      phoneNumber.trim().length > 0
    ) {
      updates.whatsapp = formatProfileWhatsAppDisplay(
        profilePhoneDigitsOnly(phoneNumber),
      );
    }
    if (
      (data?.photoURL == null || data?.photoURL === '') &&
      photoURL &&
      photoURL.trim()
    ) {
      const p = photoURL.trim();
      updates.photoURL = p;
      updates.avatar = p;
      updates.photo = p;
    } else if (
      (typeof data?.photo !== 'string' || !String(data.photo).trim()) &&
      typeof data?.photoURL === 'string' &&
      data.photoURL.trim().length > 0
    ) {
      updates.photo = data.photoURL.trim();
    } else if (
      (typeof data?.photo !== 'string' || !String(data.photo).trim()) &&
      typeof data?.avatar === 'string' &&
      data.avatar.trim().length > 0
    ) {
      updates.photo = data.avatar.trim();
    }
    if (data?.uid === undefined) updates.uid = uid;
    if (data?.activeOrderId === undefined) updates.activeOrderId = null;
    if (data?.credits === undefined) updates.credits = 0;
    if (data?.role === undefined) updates.role = USER_ROLE.USER;
    if (data?.createdAt === undefined) updates.createdAt = serverTimestamp();
    if (data?.notificationsEnabled === undefined) updates.notificationsEnabled = true;
    if (data?.restaurantId === undefined) updates.restaurantId = null;
    if (data?.ordersCount === undefined) updates.ordersCount = 0;
    if (data?.averageRating === undefined) updates.averageRating = 0;
    if (data?.totalRatings === undefined) updates.totalRatings = 0;
    if (data?.totalOrdersCompleted === undefined) updates.totalOrdersCompleted = 0;
    if (data?.cancellationRate === undefined) updates.cancellationRate = 0;
    if (data?.reportCount === undefined) updates.reportCount = 0;
    if (data?.trustScore === undefined) updates.trustScore = 0;
    if (data?.stripeAccountId === undefined) updates.stripeAccountId = null;
    if (data?.stripeOnboardingComplete === undefined) updates.stripeOnboardingComplete = false;
    if (data?.taxGiftEligible === undefined) updates.taxGiftEligible = false;
    if (data?.appOpenCount === undefined) updates.appOpenCount = 0;
    if (data?.ordersCreated === undefined) updates.ordersCreated = 0;
    if (data?.ordersJoined === undefined) updates.ordersJoined = 0;
    if (data?.activeOrderCount === undefined) updates.activeOrderCount = 0;
    if (data?.cancelledOrders === undefined) updates.cancelledOrders = 0;
    if (data?.cancellationCount24h === undefined) updates.cancellationCount24h = 0;
    if (data?.cancellationWindowStartMs === undefined)
      updates.cancellationWindowStartMs = 0;
    if (data?.restricted === undefined) updates.restricted = false;
    if (data?.suspicious === undefined) updates.suspicious = false;
    if (!Array.isArray(data?.suspiciousSignals)) updates.suspiciousSignals = [];
    if (data?.messagesSent === undefined) updates.messagesSent = 0;
    if (!Array.isArray(data?.badges)) updates.badges = [];
    if (Object.keys(updates).length > 0) {
      try {
        console.log('[PRE FIRESTORE]', {
          path: `users/${uid}`,
          operation: 'setDoc(merge ensureUserDocument)',
        });
        await setDoc(userRef, updates, { merge: true });
        console.log('[POST FIRESTORE]', {
          path: `users/${uid}`,
          operation: 'setDoc(merge ensureUserDocument)',
        });
      } catch (err) {
        console.error('[FAILED FIRESTORE]', {
          path: `users/${uid}`,
          operation: 'setDoc(merge ensureUserDocument)',
          error: err,
        });
        logFirestoreOpError(`users/${uid}`, 'setDoc(merge)', err);
        throw err;
      }
    }
    return;
  }

  let referredBy: string | null = null;
  try {
    const stored = await AsyncStorage.getItem(REFERRAL_STORAGE_KEY);
    if (stored?.trim() && stored.trim() !== uid) referredBy = stored.trim();
  } catch {
    // ignore
  }

  const phoneLine =
    phoneNumber && phoneNumber.trim().length > 0
      ? formatProfileWhatsAppDisplay(profilePhoneDigitsOnly(phoneNumber))
      : '';
  const initialPhoto = photoURL?.trim() || null;
  try {
    console.log('[PRE FIRESTORE]', {
      path: `users/${uid}`,
      operation: 'setDoc(create ensureUserDocument)',
    });
    await setDoc(userRef, {
      uid,
      name: displayName ?? '',
      displayName: displayName ?? '',
      email: email ?? null,
      phone: phoneLine,
      whatsapp: phoneLine,
      phoneNumber: phoneNumber ?? null,
      photoURL: initialPhoto,
      avatar: initialPhoto,
      photo: initialPhoto ?? '',
      createdAt: serverTimestamp(),
      activeOrderId: null,
      credits: referredBy ? REFERRAL_CREDIT : 0,
      referredBy: referredBy ?? null,
      role: USER_ROLE.USER,
      restaurantId: null,
      notificationsEnabled: true,
      ordersCount: 0,
      averageRating: 0,
      totalRatings: 0,
      totalOrdersCompleted: 0,
      cancellationRate: 0,
      reportCount: 0,
      trustScore: 0,
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      taxGiftEligible: false,
      appOpenCount: 0,
      ordersCreated: 0,
      ordersJoined: 0,
      activeOrderCount: 0,
      cancelledOrders: 0,
      cancellationCount24h: 0,
      cancellationWindowStartMs: 0,
      restricted: false,
      suspicious: false,
      suspiciousSignals: [],
      messagesSent: 0,
      badges: [],
    });
    console.log('[POST FIRESTORE]', {
      path: `users/${uid}`,
      operation: 'setDoc(create ensureUserDocument)',
    });
  } catch (err) {
    console.error('[FAILED FIRESTORE]', {
      path: `users/${uid}`,
      operation: 'setDoc(create ensureUserDocument)',
      error: err,
    });
    logFirestoreOpError(`users/${uid}`, 'setDoc(create)', err);
    throw err;
  }
  await createAlert('new_user', 'New user joined');

  if (referredBy) {
    try {
      let referralOrderId: string | null = null;
      try {
        const storedOrderId = await AsyncStorage.getItem(REFERRAL_ORDER_ID_KEY);
        if (storedOrderId?.trim()) referralOrderId = storedOrderId.trim();
      } catch {
        // ignore
      }
      try {
        console.log('[PRE FIRESTORE]', {
          path: 'referrals',
          operation: 'addDoc',
        });
        await addDoc(collection(db, 'referrals'), {
          referrerId: referredBy,
          newUserId: uid,
          orderId: referralOrderId ?? null,
          createdAt: serverTimestamp(),
        });
        console.log('[POST FIRESTORE]', {
          path: 'referrals',
          operation: 'addDoc',
        });
      } catch (err) {
        console.error('[FAILED FIRESTORE]', {
          path: 'referrals',
          operation: 'addDoc',
          error: err,
        });
        logFirestoreOpError('referrals', 'addDoc', err);
        throw err;
      }
      await AsyncStorage.removeItem(REFERRAL_STORAGE_KEY);
      await AsyncStorage.removeItem(REFERRAL_ORDER_ID_KEY);
      const inviterRef = doc(db, 'users', referredBy);
      try {
        console.log('[PRE FIRESTORE]', {
          path: `users/${referredBy}`,
          operation: 'updateDoc(increment credits)',
        });
        await updateDoc(inviterRef, { credits: increment(REFERRAL_CREDIT) });
        console.log('[POST FIRESTORE]', {
          path: `users/${referredBy}`,
          operation: 'updateDoc(increment credits)',
        });
      } catch (err) {
        console.error('[FAILED FIRESTORE]', {
          path: `users/${referredBy}`,
          operation: 'updateDoc(increment credits)',
          error: err,
        });
        logFirestoreOpError(`users/${referredBy}`, 'updateDoc(increment credits)', err);
        throw err;
      }
      const today = new Date().toISOString().slice(0, 10);
      const metricsRef = doc(db, 'growthMetrics', today);
      let metricsSnap;
      try {
        console.log('[PRE FIRESTORE]', {
          path: `growthMetrics/${today}`,
          operation: 'getDoc',
        });
        metricsSnap = await getDoc(metricsRef);
        console.log('[POST FIRESTORE]', {
          path: `growthMetrics/${today}`,
          operation: 'getDoc',
        });
      } catch (err) {
        console.error('[FAILED FIRESTORE]', {
          path: `growthMetrics/${today}`,
          operation: 'getDoc',
          error: err,
        });
        logFirestoreOpError(`growthMetrics/${today}`, 'getDoc', err);
        throw err;
      }
      const current = metricsSnap.exists() ? metricsSnap.data() : {};
      try {
        console.log('[PRE FIRESTORE]', {
          path: `growthMetrics/${today}`,
          operation: 'setDoc(merge)',
        });
        await setDoc(
          metricsRef,
          {
            date: today,
            referralUsers: (Number(current?.referralUsers) || 0) + 1,
            orders: Number(current?.orders) || 0,
            matches: Number(current?.matches) || 0,
          },
          { merge: true },
        );
        console.log('[POST FIRESTORE]', {
          path: `growthMetrics/${today}`,
          operation: 'setDoc(merge)',
        });
      } catch (err) {
        console.error('[FAILED FIRESTORE]', {
          path: `growthMetrics/${today}`,
          operation: 'setDoc(merge)',
          error: err,
        });
        logFirestoreOpError(`growthMetrics/${today}`, 'setDoc(merge)', err);
        throw err;
      }
    } catch (e) {
      console.error('[auth] referral credit/metrics update failed', e);
    }
  }
}

async function bootstrapSignedInSession(firebaseUser: User): Promise<void> {
  if (firebaseUser.isAnonymous) return;

  const uid = firebaseUser.uid;
  if (!shouldRunAuthSessionBootstrap(uid)) return;

  markAuthSessionBootstrapStarted(uid);
  try {
    await ensureUserDocument(
      uid,
      firebaseUser.displayName ?? null,
      firebaseUser.email ?? null,
      firebaseUser.phoneNumber ?? null,
      firebaseUser.photoURL ?? null,
    );
    registerExpoPushTokenAndSyncToFirestore(uid).catch(() => {});
    void claimReferralInboxRewards(uid);
    void syncUserRoleToFirestore(firebaseUser);
    const migratedRole = await migrateUserRoleIfNeeded(uid);
    logAuthRoleDetected(migratedRole, uid);
    markAuthSessionBootstrapComplete(uid);
  } catch (error) {
    markAuthSessionBootstrapFailed(uid);
    if (__DEV__) console.warn('[auth] bootstrap non-fatal', error);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useDevProviderMount('AuthProvider');

  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const settledAuthUidRef = useRef<string | null>(null);
  const phoneConfirmationRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const { role: firestoreRole, loading: roleLoading } = useUserRole(user?.uid);
  const firestoreRoleRef = useRef(firestoreRole);
  firestoreRoleRef.current = firestoreRole;

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;
    if (firestoreRole !== 'restaurant' && firestoreRole !== 'host') return;

    const ensureRestaurantProfile = async () => {
      try {
        const restaurantRef = doc(db, 'restaurants', uid);
        let snap;
        try {
          console.log('[PRE FIRESTORE]', {
            path: `restaurants/${uid}`,
            operation: 'getDoc(ensureRestaurantProfile)',
          });
          snap = await getDoc(restaurantRef);
          console.log('[POST FIRESTORE]', {
            path: `restaurants/${uid}`,
            operation: 'getDoc(ensureRestaurantProfile)',
          });
        } catch (err) {
          console.error('[FAILED FIRESTORE]', {
            path: `restaurants/${uid}`,
            operation: 'getDoc(ensureRestaurantProfile)',
            error: err,
          });
          logFirestoreOpError(`restaurants/${uid}`, 'getDoc', err);
          throw err;
        }
        if (snap.exists()) return;
        await createRestaurant({
          userId: uid,
          name: user?.displayName?.trim() || 'My Restaurant',
          logo: null,
          location: '',
        });
      } catch (error) {
        console.error('[auth] ensure restaurant profile failed', error);
      }
    };

    void ensureRestaurantProfile();
  }, [user?.uid, user?.displayName, firestoreRole]);

  /** Refresh custom claims once per signed-in uid (not on every firestoreRole snapshot). */
  const claimsRefreshedForUidRef = useRef<string | null>(null);
  useEffect(() => {
    const uid = user?.uid;
    if (!uid || user?.isAnonymous) {
      claimsRefreshedForUidRef.current = null;
      return;
    }
    if (claimsRefreshedForUidRef.current === uid) return;
    claimsRefreshedForUidRef.current = uid;
    void refreshAuthRoleClaims();
  }, [user?.uid, user?.isAnonymous]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        settledAuthUidRef.current = null;
        resetForcedTokenRefreshUid();
        resetAuthSessionBootstrap();
        setUser(null);
        setLoading(false);
        setAuthReady(true);
        return;
      }

      if (settledAuthUidRef.current === firebaseUser.uid) {
        return;
      }

      if (firebaseUser.isAnonymous) {
        settledAuthUidRef.current = firebaseUser.uid;
        setUser(firebaseUser);
        setLoading(false);
        setAuthReady(true);
        return;
      }

      if (__DEV__) {
        console.log('[auth] user signed in', firebaseUser.uid);
      }

      try {
        try {
          await reload(firebaseUser);
        } catch (e) {
          logError(e);
          if (isFirebaseAuthUserInvalidated(e)) {
            try {
              await firebaseSignOut(auth);
            } catch (so) {
              logError(so);
            }
            settledAuthUidRef.current = null;
            setUser(null);
            setLoading(false);
            setAuthReady(true);
            return;
          }
          // Network / transient: keep local session; user can retry when online.
          setUser(firebaseUser);
          try {
            await bootstrapSignedInSession(firebaseUser);
          } catch {
            // non-fatal for document/bootstrap
          }
          settledAuthUidRef.current = firebaseUser.uid;
          setLoading(false);
          setAuthReady(true);
          return;
        }

        const fresh = auth.currentUser ?? firebaseUser;
        setUser(fresh);
        try {
          await bootstrapSignedInSession(fresh);
        } catch {
          // non-fatal for document/bootstrap
        }
        settledAuthUidRef.current = fresh.uid;
      } finally {
        setLoading(false);
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, []);

  /** Re-save Expo token when it rotates (must stay in sync with Firestore). */
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const u = user;
    if (!u?.uid || u.isAnonymous) return;
    const uid = u.uid;
    const sub = subscribeExpoPushTokenRefresh((token) => {
      persistUserPushTokens(uid, token).catch(() => {});
    });
    return () => sub.remove();
  }, [user]);

  const signUpWithEmail = useCallback(async (payload: EmailSignUpPayload) => {
    const trimmed = typeof payload.email === 'string' ? payload.email.trim() : '';
    const nameTrim = payload.fullName.trim();
    const waDigits = profilePhoneDigitsOnly(payload.whatsapp);
    const phoneFormatted =
      typeof payload.phoneDisplay === 'string' && payload.phoneDisplay.trim()
        ? payload.phoneDisplay.trim()
        : formatProfileWhatsAppDisplay(waDigits);
    const pwd = payload.password;
    const termsAccepted = payload.termsAccepted === true;
    const privacyAccepted = payload.privacyAccepted === true;

    if (!trimmed || !pwd || !nameTrim || !waDigits) {
      throw new Error('Please fill in all required fields.');
    }
    if (!termsAccepted || !privacyAccepted) {
      throw new Error('Please agree to the Terms of Service and Privacy Policy.');
    }
    if (pwd.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    // Race-condition / enumeration-protection safety: never call create when known existing.
    try {
      const status = await resolveAuthEmailAccountStatus(trimmed);
      if (status === 'exists') {
        throwAuthFlowError({
          code: 'auth/email-already-in-use',
          message: 'This email already has an account. Please sign in instead.',
        });
      }
    } catch (preCheckErr: unknown) {
      if (isEmailAlreadyInUseError(preCheckErr)) {
        throw preCheckErr;
      }
      // Lookup failures should not block signup; createUser will still catch conflicts.
    }

    let userCredential;
    try {
      userCredential = await createUserWithEmailAndPassword(
        auth,
        trimmed,
        pwd,
      );
    } catch (err: unknown) {
      logError(err);
      // Preserve email-already-in-use so Sign Up UI can show Go to Sign In.
      if (isEmailAlreadyInUseError(err)) {
        throwAuthFlowError({
          code: 'auth/email-already-in-use',
          message: 'This email already has an account. Please sign in instead.',
        });
      }
      throwAuthFlowError(err);
    }

    const firebaseUser = userCredential.user;
    const uid = firebaseUser.uid;
    let photoURL: string | null = null;

    if (payload.localPhotoUri?.trim()) {
      try {
        photoURL = await uploadImageAsync(
          payload.localPhotoUri.trim(),
          uid,
        );
      } catch (e) {
        logError(e);
        if (__DEV__) {
          console.error('[auth] profile image upload failed (continuing without photo)', e);
        }
      }
    }

    try {
      await updateProfile(firebaseUser, {
        displayName: nameTrim,
        ...(photoURL ? { photoURL } : {}),
      });
    } catch (e) {
      logFirestoreOpError(`users/${uid}`, 'setDoc(signup merge)', e);
      logError(e);
    }

    const signupRole = roleForSignupIntent(payload.signupIntent ?? 'user');

    try {
      console.log('[PRE FIRESTORE]', {
        path: `users/${uid}`,
        operation: 'setDoc(signup merge)',
      });
      await setDoc(
        doc(db, 'users', uid),
        {
          uid,
          name: nameTrim,
          displayName: nameTrim,
          email: trimmed,
          whatsapp: phoneFormatted,
          phone: phoneFormatted,
          photo: photoURL?.trim() ?? '',
          photoURL: photoURL ?? null,
          avatar: photoURL ?? null,
          role: signupRole,
          restaurantId: signupRole === 'restaurant' ? uid : null,
          rating: 5,
          reviewsCount: 0,
          averageRating: 5,
          totalRatings: 0,
          whatsappConsent: payload.whatsappConsent === true,
          termsAccepted: true,
          privacyAccepted: true,
          // Existing post-login ToS gate — keep in sync when accepted at signup.
          hasAcceptedTerms: true,
          acceptedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          trustScore: 0,
          totalOrdersCompleted: 0,
          cancellationRate: 0,
          reportCount: 0,
        },
        { merge: true },
      );
      console.log('[POST FIRESTORE]', {
        path: `users/${uid}`,
        operation: 'setDoc(signup merge)',
      });
    } catch (e) {
      console.error('[FAILED FIRESTORE]', {
        path: `users/${uid}`,
        operation: 'setDoc(signup merge)',
        error: e,
      });
      logError(e);
    }

    try {
      await ensureUserDocument(uid, nameTrim, trimmed, phoneFormatted, photoURL);
    } catch (e) {
      if (__DEV__) {
        console.error('[auth] ensureUserDocument failed (non-fatal)', e);
      }
    }

    try {
      await applySignupRole(uid, payload.signupIntent ?? 'user', {
        displayName: nameTrim,
      });
    } catch (e) {
      logError(e);
    }

    void syncUserRoleToFirestore(firebaseUser);
  }, []);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      const trimmed = email.trim();
      let cred;
      try {
        cred = await signInWithEmailAndPassword(auth, trimmed, password);
      } catch (err: unknown) {
        logError(err);
        throw new Error(getUserFriendlyError(err));
      }
      try {
        await ensureUserDocument(
          cred.user.uid,
          cred.user.displayName ?? null,
          cred.user.email ?? null,
          cred.user.phoneNumber ?? null,
          cred.user.photoURL ?? null,
        );
        try {
          console.log('[PRE FIRESTORE]', {
            path: `users/${cred.user.uid}`,
            operation: 'getDocFromServer',
          });
          await getDocFromServer(doc(db, 'users', cred.user.uid));
          console.log('[POST FIRESTORE]', {
            path: `users/${cred.user.uid}`,
            operation: 'getDocFromServer',
          });
        } catch (error) {
          console.error('[FAILED FIRESTORE]', {
            path: `users/${cred.user.uid}`,
            operation: 'getDocFromServer',
            error,
          });
        }
        void syncUserRoleToFirestore(cred.user);
        const migrated = await migrateUserRoleIfNeeded(cred.user.uid);
        logAuthRoleDetected(migrated, cred.user.uid);
      } catch (e) {
        logError(e);
        throw new Error(getUserFriendlyError(e));
      }
    },
    [],
  );

  const signInWithPhone = useCallback(async (phoneNumber: string) => {
    if (typeof window === 'undefined') {
      throw new Error(
        'Phone sign-in is only available on supported platforms.',
      );
    }
    if (!recaptchaRef.current) {
      recaptchaRef.current = new RecaptchaVerifier(
        auth,
        'recaptcha-container',
        {
          size: 'invisible',
        },
      );
    }
    try {
      const confirmationResult = await signInWithPhoneNumber(
        auth,
        phoneNumber,
        recaptchaRef.current,
      );
      phoneConfirmationRef.current = confirmationResult;
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: string }).code)
          : '';
      if (code === 'auth/account-exists-with-different-credential') {
        throw new Error(
          'An account with this phone number already exists. Please sign in with your original method.',
        );
      }
      throw err;
    }
  }, []);

  const confirmPhoneCode = useCallback(async (code: string) => {
    const confirmationResult = phoneConfirmationRef.current;
    if (!confirmationResult)
      throw new Error('No phone verification in progress');
    try {
      const cred = await confirmationResult.confirm(code);
      phoneConfirmationRef.current = null;
      await ensureUserDocument(
        cred.user.uid,
        cred.user.displayName ?? null,
        cred.user.email ?? null,
        cred.user.phoneNumber ?? null,
        cred.user.photoURL ?? null,
      );
      void syncUserRoleToFirestore(cred.user);
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: string }).code)
          : '';
      if (code === 'auth/account-exists-with-different-credential') {
        throw new Error(
          'An account with this phone number already exists. Please sign in with your original method.',
        );
      }
      throw err;
    }
  }, []);

  const reloadAuthUser = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) throw new Error('Not signed in');
    try {
      await reload(u);
      setUser(auth.currentUser);
    } catch (e) {
      if (isFirebaseAuthUserInvalidated(e)) {
        logError(e);
        try {
          await firebaseSignOut(auth);
        } catch (so) {
          logError(so);
        }
        setUser(null);
        return;
      }
      throw e;
    }
  }, []);

  const signOutUser = useCallback(async () => {
    const role = normalizeRoleForRouting(firestoreRoleRef.current);
    if (role === 'driver') {
      try {
        await markDriverOffline();
      } catch (error) {
        console.warn('[driver] mark offline on sign-out failed', error);
      }
    }
    try {
      await firebaseSignOut(auth);
    } finally {
      settledAuthUidRef.current = null;
      claimsRefreshedForUidRef.current = null;
      resetForcedTokenRefreshUid();
      resetAuthSessionBootstrap();
      setUser(null);
      setLoading(false);
      setAuthReady(true);
    }
  }, []);

  const switchRoleMode = useCallback(
    async (role: 'user' | 'driver' | 'restaurant') => {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Not signed in');
      if (role === 'driver' || role === 'restaurant') {
        await applySignupRole(uid, role, {
          displayName: auth.currentUser?.displayName,
        });
        await refreshAuthRoleClaims();
        return;
      }
      await assignUserRole(uid, 'user', { restaurantId: null });
      await refreshAuthRoleClaims();
    },
    [],
  );

  const roleResolved = !isRegisteredAuthUser(user) || !roleLoading;
  const bootstrapLoading =
    loading || (isRegisteredAuthUser(user) && roleLoading);

  const value = useMemo((): AuthContextValue => {
    const fur = isRegisteredAuthUser(user) ? (firestoreRole ?? null) : null;
    return {
      user,
      loading: bootstrapLoading,
      authReady,
      roleResolved,
      role: fur,
      firestoreUserRole: fur,
      signUpWithEmail,
      signInWithEmail,
      signInWithPhone,
      confirmPhoneCode,
      reloadAuthUser,
      signOutUser,
      switchRoleMode,
    };
  }, [
    user,
    bootstrapLoading,
    authReady,
    roleResolved,
    firestoreRole,
    signUpWithEmail,
    signInWithEmail,
    signInWithPhone,
    confirmPhoneCode,
    reloadAuthUser,
    signOutUser,
    switchRoleMode,
  ]);

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

/**
 * Auth + Firestore role. For root navigation, use `loading` and `firestoreUserRole` and do not
 * call `router.replace` until `loading` is `false`.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
