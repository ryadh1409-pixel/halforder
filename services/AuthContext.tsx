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
  sendEmailVerification,
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
import { beginFirestoreQuery, logFirestoreQueryFailed } from './firestoreQueryDiagnostics';
import { subscribeExpoPushTokenRefresh } from './notifications';
import {
  persistUserPushTokens,
  registerExpoPushTokenAndSyncToFirestore,
} from './pushNotifications';
import { claimReferralInboxRewards } from './referralRewards';
import { createRestaurant } from './restaurantService';
import { uploadImageAsync } from './uploadImage';
import type { UserRole } from './userService';

const REFERRAL_CREDIT = 2;

export type EmailSignUpPayload = {
  email: string;
  password: string;
  fullName: string;
  whatsapp: string;
  /** User accepted WhatsApp coordination consent on the sign-up form */
  whatsappConsent: boolean;
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
    snap = await getDoc(userRef);
  } catch (err) {
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
      await setDoc(userRef, updates, { merge: true });
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
      await addDoc(collection(db, 'referrals'), {
        referrerId: referredBy,
        newUserId: uid,
        orderId: referralOrderId ?? null,
        createdAt: serverTimestamp(),
      });
      await AsyncStorage.removeItem(REFERRAL_STORAGE_KEY);
      await AsyncStorage.removeItem(REFERRAL_ORDER_ID_KEY);
      const inviterRef = doc(db, 'users', referredBy);
      await updateDoc(inviterRef, { credits: increment(REFERRAL_CREDIT) });
      const today = new Date().toISOString().slice(0, 10);
      const metricsRef = doc(db, 'growthMetrics', today);
      const metricsSnap = await getDoc(metricsRef);
      const current = metricsSnap.exists() ? metricsSnap.data() : {};
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
        const snap = await getDoc(restaurantRef);
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
    const phoneFormatted = formatProfileWhatsAppDisplay(waDigits);
    const pwd = payload.password;

    if (!trimmed || !pwd || !nameTrim || !waDigits) {
      throw new Error('Please fill in all required fields.');
    }
    if (!payload.whatsappConsent) {
      throw new Error('Please accept WhatsApp usage to continue.');
    }
    if (pwd.length < 6) {
      throw new Error('Password must be at least 6 characters.');
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
      throw new Error(getUserFriendlyError(err));
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
      logError(e);
    }

    const signupRole = roleForSignupIntent(payload.signupIntent ?? 'user');

    try {
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
          whatsappConsent: true,
          createdAt: serverTimestamp(),
          trustScore: 0,
          totalOrdersCompleted: 0,
          cancellationRate: 0,
          reportCount: 0,
        },
        { merge: true },
      );
    } catch (e) {
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

    try {
      await sendEmailVerification(firebaseUser);
    } catch (e) {
      logError(e);
      if (__DEV__) {
        console.error('[auth] sendEmailVerification failed (user can resend from settings later)', e);
      }
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
          await getDocFromServer(doc(db, 'users', cred.user.uid));
        } catch {
          /* offline or missing doc */
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
