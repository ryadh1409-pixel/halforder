import SwipeWrapper from '@/components/SwipeWrapper';
import {
  ProfileMenuItem,
  PROFILE_MENU_COLORS,
} from '@/components/profile/ProfileMenuItem';
import { ScreenHeader } from '../../components/ScreenHeader';
import { DeleteAccountModal } from '../../components/DeleteAccountModal';
import { adminRoutes } from '../../constants/adminRoutes';
import { isAdminUser } from '../../constants/adminUid';
import { LEGAL_URLS } from '../../constants/legalLinks';
import { theme } from '../../constants/theme';
import { isProfileOrderVisibleStatus } from '@/constants/profileOrders';
import { BlockedUsersList } from '../../components/BlockedUsersList';
import { ProfileOrdersSection } from '../../components/profile/ProfileOrdersSection';
import { ProfileLocationPicker } from '../../components/profile/ProfileLocationPicker';
import { useBlockedUsers } from '../../hooks/useBlockedUsers';
import { type ProfileOrderRow, useProfileOrders } from '../../hooks/useProfileOrders';
import { useTrustScore } from '../../hooks/useTrustScore';
import { logoutAndResetSession, POST_LOGOUT_ROUTE } from '@/lib/auth/logoutSession';
import { isRegisteredAuthUser } from '@/lib/authSession';
import { showRestaurantAcceptedCancelAlert } from '@/lib/customerOrderCancelAlert';
import { resolveCustomerCancelOrderError } from '@/lib/customerOrderCancelUx';
import { navigateForRole } from '@/lib/navigation';
import { customerOrderDetailHref } from '@/lib/customerOrderNavigation';
import { USER_ROUTES } from '@/lib/navigationPaths';
import { applySignupRole } from '@/services/authRoleAssignment';
import {
  captureAndSaveCurrentProfileLocation,
  formatProfileLocationLabel,
  subscribeUserProfileLocation,
  type ProfileLocationFields,
} from '@/services/signupProfileLocation';
import { useAuth } from '../../services/AuthContext';
import { auth, db } from '../../services/firebase';
import {
  logProfileFsFail,
  logProfileFsStart,
  logProfileFsSuccess,
  profileFirestoreOp,
} from '../../services/profileFirestoreLog';
import {
  reportContentIdUser,
  submitReport,
  type ReportReason,
} from '../../services/reports';
import { getUserFriendlyError } from '@/services/errors/userFriendlyErrors';
import { logError } from '../../utils/errorLogger';
import { showError, showNotice, showSuccess } from '../../utils/toast';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { type User } from '@firebase/auth';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from '@react-navigation/native';
import {
  doc,
  getDoc,
  getDocFromServer,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppTextInput } from '../../components/AppTextInput';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

const SUPPORT_EMAIL = 'support@halforder.app';

const tc = theme.colors;

const DEFAULT_AVATAR = require('../../assets/default-avatar.png') as number;

/** Reads `users/{uid}` fields with the same aliases as `getTrustScoreProfile`. */
function pickRatingAverage(data: DocumentData): number {
  if (typeof data.rating === 'number' && Number.isFinite(data.rating)) {
    return data.rating;
  }
  if (
    typeof data.ratingAverage === 'number' &&
    Number.isFinite(data.ratingAverage)
  ) {
    return data.ratingAverage;
  }
  if (
    typeof data.averageRating === 'number' &&
    Number.isFinite(data.averageRating)
  ) {
    return data.averageRating;
  }
  return 0;
}

function pickRatingCount(data: DocumentData): number {
  if (
    typeof data.reviewsCount === 'number' &&
    Number.isFinite(data.reviewsCount)
  ) {
    return Math.max(0, Math.round(data.reviewsCount));
  }
  if (typeof data.ratingCount === 'number' && Number.isFinite(data.ratingCount)) {
    return Math.max(0, Math.round(data.ratingCount));
  }
  if (
    typeof data.totalRatings === 'number' &&
    Number.isFinite(data.totalRatings)
  ) {
    return Math.max(0, Math.round(data.totalRatings));
  }
  return 0;
}

function resolvePhotoURL(
  data: DocumentData | undefined,
  authUser: User | null,
): string | null {
  const docPhotoKey = data?.photo;
  if (typeof docPhotoKey === 'string' && docPhotoKey.trim().length > 0) {
    return docPhotoKey.trim();
  }
  const docPhoto = data?.photoURL;
  if (typeof docPhoto === 'string' && docPhoto.trim().length > 0) {
    return docPhoto.trim();
  }
  const docAvatar = data?.avatar;
  if (typeof docAvatar === 'string' && docAvatar.trim().length > 0) {
    return docAvatar.trim();
  }
  const authUrl = authUser?.photoURL;
  if (typeof authUrl === 'string' && authUrl.trim().length > 0) {
    return authUrl.trim();
  }
  return null;
}

function mapUsersCollectionToProfile(
  data: DocumentData | undefined,
  authUser: User | null,
): {
  displayName: string;
  emailFromDoc: string | null;
  photoURL: string | null;
  phone: string;
  notificationsEnabled: boolean;
  averageRating: number;
  totalRatings: number;
} {
  const authDisplay = authUser?.displayName?.trim() ?? '';
  const photoURL = resolvePhotoURL(data, authUser);
  if (!data) {
    return {
      displayName: authDisplay,
      emailFromDoc: null,
      photoURL,
      phone: '',
      notificationsEnabled: true,
      averageRating: 0,
      totalRatings: 0,
    };
  }

  const nameFromDoc =
    typeof data.name === 'string' ? data.name.trim() : '';
  const fromDoc =
    typeof data.displayName === 'string' ? data.displayName.trim() : '';
  const emailRaw = data.email;
  const emailFromDoc =
    typeof emailRaw === 'string' && emailRaw.trim().length > 0
      ? emailRaw.trim()
      : null;
  const phone =
    typeof data.phone === 'string' && data.phone.trim().length > 0
      ? data.phone.trim()
      : '';

  return {
    displayName: nameFromDoc || fromDoc || authDisplay,
    emailFromDoc,
    photoURL,
    phone,
    notificationsEnabled: data.notificationsEnabled !== false,
    averageRating: pickRatingAverage(data),
    totalRatings: pickRatingCount(data),
  };
}

type Palette = {
  bg: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  inputBg: string;
  chipBg: string;
  primary: string;
  onPrimary: string;
  danger: string;
  success: string;
  star: string;
};

/** Single dark palette — matches tab shell; avoids `useColorScheme` (was missing import → runtime crash). */
function useProfilePalette(): Palette {
  return useMemo(
    () => ({
      bg: '#000000',
      surface: '#171923',
      surfaceMuted: '#1C1F2E',
      text: '#FFFFFF',
      textSecondary: '#B7BDC9',
      textTertiary: '#8B93A7',
      border: 'rgba(168, 85, 247, 0.22)',
      inputBg: '#1C2030',
      chipBg: 'rgba(168,85,247,0.10)',
      primary: '#A855F7',
      onPrimary: '#FFFFFF',
      danger: '#EF4444',
      success: '#22C55E',
      star: '#F59E0B',
    }),
    [],
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const pal = useProfilePalette();
  const isDark = true;
  const { user, signOutUser, firestoreUserRole } = useAuth();
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [averageRating, setAverageRating] = useState(0);
  const [totalRatings, setTotalRatings] = useState(0);
  /** `users/{uid}.email` when set; UI falls back to Auth email. */
  const [emailFromFirestore, setEmailFromFirestore] = useState<string | null>(
    null,
  );
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [deleteAccountModalVisible, setDeleteAccountModalVisible] =
    useState(false);
  const [reportUserId, setReportUserId] = useState('');
  const [reportReason, setReportReason] = useState<ReportReason>('spam');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [profileOrdersCancellingIds, setProfileOrdersCancellingIds] = useState<
    Record<string, boolean>
  >({});
  const [profileLocation, setProfileLocation] =
    useState<ProfileLocationFields | null>(null);
  const [changingLocation, setChangingLocation] = useState(false);
  const registered = isRegisteredAuthUser(user);
  const uid = registered ? (user?.uid ?? null) : null;
  const trustScore = useTrustScore(uid);

  useEffect(() => {
    if (!uid) {
      setProfileLocation(null);
      return undefined;
    }
    return subscribeUserProfileLocation(uid, setProfileLocation);
  }, [uid]);

  const {
    activeRows: profileActiveOrders,
    historyRows: profileHistoryOrders,
    cancelledRows: profileCancelledOrders,
    loading: profileOrdersLoading,
    refreshing: profileOrdersRefreshing,
    errorMessage: profileOrdersError,
    refresh: refreshProfileOrders,
    indexBuilding: profileOrdersIndexBuilding,
  } = useProfileOrders(uid);
  const visibleActiveProfileOrders = useMemo(() => {
    const staleUnpaidMs = 30 * 60 * 1000;
    return profileActiveOrders.filter((order) => {
      const visibleStatus = isProfileOrderVisibleStatus(order.status);
      if (!visibleStatus && order.paymentStatus === 'paid') {
        // Paid marketplace orders must appear even if kitchen status string is unexpected.
        return true;
      }
      if (!visibleStatus) return false;
      if (order.paymentStatus !== 'unpaid') return true;
      const createdAtMs =
        order.createdAtMs > 0
          ? order.createdAtMs
          : typeof order.createdAt === 'object' &&
              order.createdAt !== null &&
              typeof (order.createdAt as { toMillis?: () => number }).toMillis === 'function'
            ? (order.createdAt as { toMillis: () => number }).toMillis()
            : 0;
      if (!createdAtMs) return true;
      return Date.now() - createdAtMs < staleUnpaidMs;
    });
  }, [profileActiveOrders]);
  const {
    blockedUsers,
    blockedUserIds,
    loadingProfiles,
    unblockUser: unblockBlockedAccount,
  } = useBlockedUsers();

  const openTerms = useCallback(() => {
    void (async () => {
      const url = LEGAL_URLS.terms;
      try {
        if (await Linking.canOpenURL(url)) {
          await Linking.openURL(url);
        } else {
          showNotice('Terms of Service', url);
        }
      } catch {
        showNotice('Terms of Service', url);
      }
    })();
  }, []);

  const openPrivacy = useCallback(() => {
    void (async () => {
      const url = LEGAL_URLS.privacy;
      try {
        if (await Linking.canOpenURL(url)) {
          await Linking.openURL(url);
        } else {
          showNotice('Privacy Policy', url);
        }
      } catch {
        showNotice('Privacy Policy', url);
      }
    })();
  }, []);

  useEffect(() => {
    if (!uid || user?.isAnonymous) {
      setEmailFromFirestore(null);
      setPhotoURL(null);
      setProfileLoading(false);
      return;
    }
    if (!isFocused) {
      return undefined;
    }
    const userRef = doc(db, 'users', uid);
    const userPath = `users/${uid}`;
    let cancelled = false;

    const applyUserDoc = (data: DocumentData | undefined) => {
      const authUser = auth.currentUser;
      const mapped = mapUsersCollectionToProfile(data, authUser);
      setDisplayNameInput(mapped.displayName);
      setNotificationsEnabled(mapped.notificationsEnabled);
      setAverageRating(mapped.averageRating);
      setTotalRatings(mapped.totalRatings);
      setEmailFromFirestore(mapped.emailFromDoc);
      setPhotoURL(mapped.photoURL);
      setProfileLoading(false);
    };

    setProfileLoading(true);
    void (async () => {
      try {
        const serverSnap = await profileFirestoreOp(
          {
            file: 'app/(tabs)/profile.tsx',
            operation: 'getDocFromServer',
            path: userPath,
          },
          () => getDocFromServer(userRef),
        );
        if (cancelled) return;
        applyUserDoc(
          serverSnap.exists() ? (serverSnap.data() as DocumentData) : undefined,
        );
      } catch {
        if (cancelled) return;
        try {
          const cacheSnap = await profileFirestoreOp(
            {
              file: 'app/(tabs)/profile.tsx',
              operation: 'getDoc',
              path: userPath,
            },
            () => getDoc(userRef),
          );
          if (cancelled) return;
          applyUserDoc(
            cacheSnap.exists() ? (cacheSnap.data() as DocumentData) : undefined,
          );
        } catch {
          applyUserDoc(undefined);
        }
      }
    })();

    const snapshotCtx = {
      file: 'app/(tabs)/profile.tsx',
      operation: 'onSnapshot',
      path: userPath,
    };
    logProfileFsStart(snapshotCtx);
    const unsubscribe = onSnapshot(
      userRef,
      (snap) => {
        logProfileFsSuccess(snapshotCtx);
        if (cancelled) return;
        applyUserDoc(
          snap.exists() ? (snap.data() as DocumentData) : undefined,
        );
      },
      (error) => {
        logProfileFsFail(snapshotCtx, error);
        if (cancelled) return;
        applyUserDoc(undefined);
      },
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [uid, isFocused, user?.isAnonymous]);

  const handleNotificationsToggle = async (value: boolean) => {
    if (!uid) return;
    setNotificationsEnabled(value);
    try {
      const userRef = doc(db, 'users', uid);
      await profileFirestoreOp(
        {
          file: 'app/(tabs)/profile.tsx',
          operation: 'setDoc(merge)',
          path: `users/${uid}`,
        },
        () => setDoc(userRef, { notificationsEnabled: value }, { merge: true }),
      );
    } catch (e) {
      logError(e);
      setNotificationsEnabled(!value);
    }
  };

  const handleSignOut = async () => {
    try {
      await logoutAndResetSession(signOutUser);
      router.replace(POST_LOGOUT_ROUTE as Parameters<typeof router.replace>[0]);
    } catch (err) {
      logError(err);
      showError(getUserFriendlyError(err));
    }
  };

  const handleDeleteAccount = () => {
    if (!user) return;
    setDeleteAccountModalVisible(true);
  };

  const handleDeleteAccountDismiss = useCallback(() => {
    setDeleteAccountModalVisible(false);
  }, []);

  const handleOpenOrderDetails = useCallback(
    (orderId: string) => {
      const fromActive = profileActiveOrders.find((o) => o.id === orderId) ?? null;
      const fromHistory = profileHistoryOrders.find((o) => o.id === orderId) ?? null;
      const fromCancelled = profileCancelledOrders.find((o) => o.id === orderId) ?? null;
      const picked =
        fromHistory ?? fromActive ?? fromCancelled ?? profileActiveOrders.concat(profileHistoryOrders).find((o) => o.id === orderId) ?? null;
      console.log('[PROFILE ORDER]', {
        source: 'profile:open',
        orderId,
        openedFrom: fromHistory
          ? 'history'
          : fromActive
            ? 'active'
            : fromCancelled
              ? 'cancelled'
              : 'unknown',
        status: picked?.status ?? null,
        deliveryStatus: picked?.deliveryStatus ?? null,
        completedAtMs: picked?.completedAtMs ?? null,
        updatedAtMs: picked?.updatedAtMs ?? null,
        createdAtMs: picked?.createdAtMs ?? null,
        completed:
          picked != null &&
          (picked.status === 'completed' || picked.deliveryStatus === 'delivered'),
        allProfileOrderIds: profileActiveOrders
          .concat(profileHistoryOrders, profileCancelledOrders)
          .map((o) => ({
            orderId: o.id,
            status: o.status,
            deliveryStatus: o.deliveryStatus,
          })),
      });
      const href = customerOrderDetailHref(orderId);
      router.push(href);
    },
    [profileActiveOrders, profileCancelledOrders, profileHistoryOrders, router],
  );

  const handleCancelProfileOrder = useCallback(
    async (order: ProfileOrderRow): Promise<boolean> => {
      const currentUid = auth.currentUser?.uid;
      if (!currentUid) {
        showError('Please sign in again.');
        return false;
      }
      const payload = {
        status: 'cancelled',
        deliveryStatus: 'cancelled',
        cancelledAt: serverTimestamp(),
        cancelledBy: currentUid,
        updatedAt: serverTimestamp(),
      };
      setProfileOrdersCancellingIds((prev) => ({ ...prev, [order.id]: true }));
      try {
        const documentPath = `orders/${order.id}`;
        const { diagnoseCustomerCancelOrderWrite, logCustomerCancelWriteDiagnostic } =
          await import('@/lib/customerOrderCancelEligibility');
        const cancelDiagnostic = diagnoseCustomerCancelOrderWrite(
          {
            status: order.status,
            deliveryStatus: order.deliveryStatus,
            paymentStatus: order.paymentStatus,
            customerId: currentUid,
            userId: currentUid,
          },
          currentUid,
          payload,
        );
        logCustomerCancelWriteDiagnostic(order.id, cancelDiagnostic);
        console.log('[PROFILE ORDER CANCEL WRITE]', {
          documentPath,
          uid: currentUid,
          orderId: order.id,
          payload,
          orderStatus: order.status,
          paymentStatus: order.paymentStatus,
          deliveryStatus: order.deliveryStatus,
          cancelDiagnostic,
        });
        const { protectedUpdateOrder } = await import('@/services/orderFirestoreWrite');
        await protectedUpdateOrder(order.id, payload, {
          fileName: 'app/(tabs)/profile.tsx',
          functionName: 'handleCancelProfileOrder',
        });
        showSuccess('Order cancelled successfully');
        return true;
      } catch (e) {
        logError(e);
        const cancelErr = resolveCustomerCancelOrderError(e, {
          status: order.status,
          deliveryStatus: order.deliveryStatus,
          paymentStatus: order.paymentStatus,
        });
        if (cancelErr === 'restaurant_accepted') {
          showRestaurantAcceptedCancelAlert();
        } else {
          showError(getUserFriendlyError(e));
        }
        return false;
      } finally {
        setProfileOrdersCancellingIds((prev) => {
          const next = { ...prev };
          delete next[order.id];
          return next;
        });
      }
    },
    [],
  );

  const handleAfterAccountDeleted = useCallback(async () => {
    setDeleteAccountModalVisible(false);
    try {
      await logoutAndResetSession(signOutUser);
    } catch {
      // `deleteUser` already ends the session; sign-out may no-op.
    }
    router.replace(POST_LOGOUT_ROUTE as Parameters<typeof router.replace>[0]);
  }, [router, signOutUser]);

  const handleSubmitProfileReport = async () => {
    if (!uid) return;
    const target = reportUserId.trim();
    if (!target) {
      showError('Enter the user ID you want to report.');
      return;
    }
    if (target === uid) {
      showError('You cannot report yourself.');
      return;
    }
    setSubmittingReport(true);
    try {
      await submitReport({
        reporterId: uid,
        reportedUserId: target,
        contentId: reportContentIdUser(target),
        reason: reportReason,
      });
      showSuccess('Thanks. We will review this report.');
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setSubmittingReport(false);
    }
  };

  const handleUnblockUser = async (blockedUserId: string) => {
    if (!uid) return;
    setUnblockingId(blockedUserId);
    try {
      await unblockBlockedAccount(blockedUserId);
      showSuccess('User unblocked');
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setUnblockingId(null);
    }
  };

  const handleBusinessAccount = useCallback(() => {
    Alert.alert('Coming soon');
  }, []);

  const handleAddRestaurant = useCallback(() => {
    if (!user?.uid) {
      router.push('/(auth)/register?intent=restaurant' as never);
      return;
    }
    void (async () => {
      try {
        const role = await applySignupRole(user.uid, 'restaurant', {
          displayName: user.displayName,
        });
        navigateForRole(role);
      } catch (e) {
        logError(e);
        showError('Could not set up restaurant account. Try again.');
      }
    })();
  }, [router, user?.displayName, user?.uid]);

  const handleDriverSignup = useCallback(() => {
    if (!user?.uid) {
      router.push('/(auth)/register?intent=driver' as never);
      return;
    }
    void (async () => {
      try {
        const role = await applySignupRole(user.uid, 'driver', {
          displayName: user.displayName,
        });
        navigateForRole(role);
      } catch (e) {
        logError(e);
        showError('Could not set up driver account. Try again.');
      }
    })();
  }, [router, user?.displayName, user?.uid]);

  const openSupportEmail = async () => {
    const url = `mailto:${SUPPORT_EMAIL}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        showNotice('Contact Support', `Please email us at ${SUPPORT_EMAIL}`);
      }
    } catch {
      showNotice('Contact Support', `Please email us at ${SUPPORT_EMAIL}`);
    }
  };

  const emailLabel =
    emailFromFirestore ?? user?.email ?? 'Not set';
  const displayName = displayNameInput.trim() || 'User';

  const reviewCount =
    totalRatings > 0 ? totalRatings : trustScore?.count ?? 0;
  const ratingValue =
    totalRatings > 0
      ? averageRating
      : trustScore && trustScore.count > 0
        ? trustScore.average
        : null;
  const showNewUserBadge = reviewCount === 0;

  const dynamicStyles = useMemo(
    () => createDynamicStyles(pal, isDark),
    [pal, isDark],
  );

  const scrollBottomPadding = Math.max(insets.bottom + 88, 96);

  if (profileLoading && uid) {
    return (
      <SwipeWrapper currentIndex={5}>
      <SafeAreaView style={[dynamicStyles.container, dynamicStyles.centered]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ActivityIndicator size="large" color={pal.primary} />
      </SafeAreaView>
      </SwipeWrapper>
    );
  }

  if (!uid) {
    return (
      <SwipeWrapper currentIndex={5}>
      <SafeAreaView style={dynamicStyles.container}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader title="My Account" logo="inline" />
          <View style={styles.profileBody}>
            <View style={[dynamicStyles.card, { marginTop: 8 }]}>
              <Text style={[dynamicStyles.bodyMuted]}>
                Sign in to manage your account and settings.
              </Text>
              <TouchableOpacity
                style={dynamicStyles.primaryButton}
                onPress={() => router.push('/(auth)/login')}
              >
                <Text style={dynamicStyles.primaryButtonText}>Sign In</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.footer}>
              <Text style={dynamicStyles.footerMuted}>❤️ Made with love in Toronto</Text>
              <Text style={dynamicStyles.footerMuted}>v1.0</Text>
              <Text style={[dynamicStyles.bodyMuted, { marginTop: 12 }]}>
              Users can report inappropriate behavior.{' '}
              <Text
                onPress={() => void Linking.openURL(LEGAL_URLS.safetyCommunityGuidelines)}
                style={dynamicStyles.link}
              >
                Safety guidelines
              </Text>
            </Text>
            <View style={styles.legalLinksRow}>
              <TouchableOpacity onPress={openTerms} accessibilityRole="link">
                <Text style={styles.legalLinkWeb}>Terms</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={openPrivacy} accessibilityRole="link">
                <Text style={styles.legalLinkWeb}>Privacy</Text>
              </TouchableOpacity>
            </View>
              <Text style={dynamicStyles.legalUrlHint}>{LEGAL_URLS.terms}</Text>
              <Text style={dynamicStyles.legalUrlHint}>{LEGAL_URLS.privacy}</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
      </SwipeWrapper>
    );
  }

  return (
    <SwipeWrapper currentIndex={5}>
    <SafeAreaView style={dynamicStyles.container} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: scrollBottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={profileOrdersRefreshing}
            onRefresh={() => void refreshProfileOrders()}
            tintColor={pal.primary}
          />
        }
      >
        <View style={styles.profileBody}>
          <TouchableOpacity
            style={dynamicStyles.profileHeader}
            onPress={() => router.push('/personal-information' as never)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Open personal information"
          >
            <View style={dynamicStyles.profileHeaderTextCol}>
              <Text style={dynamicStyles.profileNameTitle} numberOfLines={2}>
                {displayName}
              </Text>
              <Text
                style={dynamicStyles.profileEmailLine}
                numberOfLines={1}
              >
                {emailLabel}
              </Text>
              <View style={dynamicStyles.profileRatingRow}>
                <MaterialIcons name="star" size={20} color={pal.star} />
                {showNewUserBadge ? (
                  <Text style={dynamicStyles.profileNewUserLabel}>New user</Text>
                ) : (
                  <>
                    <Text style={dynamicStyles.profileRatingValue}>
                      {ratingValue != null ? ratingValue.toFixed(1) : '—'}
                    </Text>
                    <Text style={dynamicStyles.profileReviewMeta}>
                      {reviewCount > 0
                        ? ` · ${reviewCount} review${reviewCount === 1 ? '' : 's'}`
                        : ''}
                    </Text>
                  </>
                )}
              </View>
              {trustScore || isAdminUser(user, firestoreUserRole) ? (
                <View style={dynamicStyles.trustChip}>
                  <Text style={dynamicStyles.trustChipText}>
                    {isAdminUser(user, firestoreUserRole) ? 'Admin' : (trustScore?.label ?? '')}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={dynamicStyles.profileAvatarWrap}>
              <Image
                key={photoURL ?? 'default'}
                source={photoURL ? { uri: photoURL } : DEFAULT_AVATAR}
                style={dynamicStyles.profileAvatarImage}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
              />
            </View>
            <MaterialIcons
              name="chevron-right"
              size={26}
              color={pal.textTertiary}
              style={dynamicStyles.profileHeaderChevron}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={dynamicStyles.quickAction}
            onPress={() => router.push('/wallet' as never)}
            activeOpacity={0.85}
          >
            <MaterialIcons name="account-balance-wallet" size={22} color={pal.primary} />
            <View style={dynamicStyles.quickActionTextCol}>
              <Text style={dynamicStyles.quickActionText}>Wallet</Text>
              <Text style={dynamicStyles.quickActionSub}>
                Balance, cards, and vouchers
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={pal.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={dynamicStyles.quickAction}
            onPress={() => router.push('/help')}
            activeOpacity={0.85}
          >
            <MaterialIcons name="help-outline" size={22} color={pal.primary} />
            <View style={dynamicStyles.quickActionTextCol}>
              <Text style={dynamicStyles.quickActionText}>Help &amp; Support</Text>
              <Text style={dynamicStyles.quickActionSub}>Guides and FAQs</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={pal.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={dynamicStyles.quickAction}
            onPress={() => router.push('/privacy')}
            activeOpacity={0.85}
          >
            <MaterialIcons name="privacy-tip" size={22} color={pal.primary} />
            <View style={dynamicStyles.quickActionTextCol}>
              <Text style={dynamicStyles.quickActionText}>Privacy Policy</Text>
              <Text style={dynamicStyles.quickActionSub}>How we use your data</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={pal.textTertiary} />
          </TouchableOpacity>

          {__DEV__ && firestoreUserRole ? (
            <>
              <Text style={dynamicStyles.sectionHeading}>Account type</Text>
              <View style={dynamicStyles.card}>
                <Text style={dynamicStyles.bodyMuted}>
                  Role: {firestoreUserRole}
                </Text>
              </View>
            </>
          ) : null}

          <Text style={dynamicStyles.sectionHeading}>Location</Text>
          <View style={dynamicStyles.card}>
            <Text style={dynamicStyles.cardTitle}>
              📍 {formatProfileLocationLabel(profileLocation)}
            </Text>
            <TouchableOpacity
              style={[dynamicStyles.primaryButton, { marginTop: 12 }]}
              onPress={() => {
                if (!uid || changingLocation) return;
                setChangingLocation(true);
                void captureAndSaveCurrentProfileLocation(uid)
                  .then(() => showSuccess('Location updated.'))
                  .catch((e) =>
                    showError(
                      e instanceof Error
                        ? e.message
                        : 'Could not update location.',
                    ),
                  )
                  .finally(() => setChangingLocation(false));
              }}
              disabled={changingLocation || !uid}
              activeOpacity={0.85}
            >
              {changingLocation ? (
                <ActivityIndicator color={pal.onPrimary} />
              ) : (
                <Text style={dynamicStyles.primaryButtonText}>
                  Change Location
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={dynamicStyles.sectionHeading}>Delivery location</Text>
          <ProfileLocationPicker userId={uid} palette={pal} />

          <Text style={dynamicStyles.sectionHeading}>Notifications</Text>
          <View style={dynamicStyles.card}>
            <View style={dynamicStyles.rowBetween}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={dynamicStyles.cardTitle}>Push & updates</Text>
                <Text style={dynamicStyles.bodyMuted}>
                  Order updates and reminders from HalfOrder
                </Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={handleNotificationsToggle}
                trackColor={{
                  false: isDark ? '#3F3F46' : tc.border,
                  true: isDark ? 'rgba(255,122,0,0.45)' : tc.primaryLight,
                }}
                thumbColor={notificationsEnabled ? pal.primary : pal.inputBg}
              />
            </View>
          </View>

          <ProfileOrdersSection
            pal={{
              card: pal.surface,
              border: pal.border,
              text: pal.text,
              textSecondary: pal.textSecondary,
              textTertiary: pal.textTertiary,
              primary: pal.primary,
              onPrimary: pal.onPrimary,
              danger: pal.danger,
              success: pal.success,
            }}
            orders={visibleActiveProfileOrders}
            completedOrders={profileHistoryOrders}
            cancelledOrders={profileCancelledOrders}
            loading={profileOrdersLoading}
            refreshing={profileOrdersRefreshing}
            errorMessage={profileOrdersError}
            indexBuilding={profileOrdersIndexBuilding}
            cancellingIds={profileOrdersCancellingIds}
            onOpenOrder={handleOpenOrderDetails}
            onCancelOrder={handleCancelProfileOrder}
            onRetry={() => void refreshProfileOrders()}
          />

          <Text style={dynamicStyles.sectionHeading}>Support & legal</Text>
          <View style={dynamicStyles.card}>
            <TouchableOpacity onPress={openSupportEmail} activeOpacity={0.75}>
              <Text style={dynamicStyles.label}>Customer support</Text>
              <Text style={dynamicStyles.link}>{SUPPORT_EMAIL}</Text>
            </TouchableOpacity>
            <View style={dynamicStyles.divider} />
            <View style={dynamicStyles.legalGrid}>
              <TouchableOpacity
                style={dynamicStyles.outlineBtn}
                onPress={() => router.push('/terms')}
              >
                <Text style={dynamicStyles.outlineBtnText}>Terms of Use (in app)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={dynamicStyles.outlineBtn}
                onPress={() => router.push('/privacy')}
              >
                <Text style={dynamicStyles.outlineBtnText}>Privacy (in app)</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[dynamicStyles.outlineBtn, { marginTop: 10 }]}
              onPress={() => void Linking.openURL(LEGAL_URLS.terms)}
            >
              <Text style={dynamicStyles.outlineBtnText}>Terms of Service (website)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={dynamicStyles.outlineBtn}
              onPress={() => void Linking.openURL(LEGAL_URLS.privacy)}
            >
              <Text style={dynamicStyles.outlineBtnText}>Privacy Policy (website)</Text>
            </TouchableOpacity>
            <Text style={dynamicStyles.legalUrlHint}>{LEGAL_URLS.terms}</Text>
            <Text style={dynamicStyles.legalUrlHint}>{LEGAL_URLS.privacy}</Text>
            <TouchableOpacity
              style={[dynamicStyles.primaryButton, { marginTop: 14 }]}
              onPress={() => router.push('/complaint')}
            >
              <Text style={dynamicStyles.primaryButtonText}>
                Submit complaint or inquiry
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={dynamicStyles.sectionHeading}>Trust &amp; safety</Text>
          <View style={dynamicStyles.card}>
            <Text style={dynamicStyles.bodyMuted}>
              Users can report inappropriate behavior.
            </Text>
            <Text style={[dynamicStyles.bodyMuted, { marginTop: 10 }]}>
              To block someone, use the menu in an order chat or on the Join tab. Blocked people cannot match or join orders with you. Unblock anytime below.
            </Text>
            <TouchableOpacity
              style={[dynamicStyles.outlineBtn, { marginTop: 12 }]}
              onPress={() => router.push('/safety')}
            >
              <Text style={dynamicStyles.outlineBtnText}>Community guidelines</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={dynamicStyles.outlineBtn}
              onPress={() => router.push('/help')}
            >
              <Text style={dynamicStyles.outlineBtnText}>Help — report from an order</Text>
            </TouchableOpacity>
          </View>

          <Text style={dynamicStyles.sectionHeading}>Report a user</Text>
          <View style={dynamicStyles.card}>
            <Text style={[dynamicStyles.bodyMuted, { marginBottom: 12 }]}>
              Submit a report by user ID, or use Report in any order or direct message chat.
            </Text>
            <TouchableOpacity
              style={[
                dynamicStyles.primaryButton,
                { flexDirection: 'row', justifyContent: 'center', gap: 8 },
              ]}
              onPress={() => router.push('/help')}
              accessibilityRole="button"
              accessibilityLabel="Open help to report from an order"
            >
              <MaterialIcons name="flag" size={20} color={pal.onPrimary} />
              <Text style={dynamicStyles.primaryButtonText}>
                Report from Help &amp; past orders
              </Text>
            </TouchableOpacity>
            <AppTextInput
              value={reportUserId}
              onChangeText={setReportUserId}
              placeholder="Reported user ID"
              placeholderTextColor={pal.textTertiary}
              style={dynamicStyles.input}
            />
            <View style={styles.reasonRow}>
              {(['spam', 'abuse', 'inappropriate'] as ReportReason[]).map(
                (reason) => {
                  const active = reason === reportReason;
                  return (
                    <TouchableOpacity
                      key={reason}
                      style={[
                        dynamicStyles.chip,
                        active && dynamicStyles.chipActive,
                      ]}
                      onPress={() => setReportReason(reason)}
                    >
                      <Text
                        style={[
                          dynamicStyles.chipText,
                          active && dynamicStyles.chipTextActive,
                        ]}
                      >
                        {reason}
                      </Text>
                    </TouchableOpacity>
                  );
                },
              )}
            </View>
            <TouchableOpacity
              style={[
                dynamicStyles.primaryButton,
                submittingReport && dynamicStyles.buttonDisabled,
              ]}
              onPress={handleSubmitProfileReport}
              disabled={submittingReport}
            >
              {submittingReport ? (
                <ActivityIndicator size="small" color={pal.onPrimary} />
              ) : (
                <Text style={dynamicStyles.primaryButtonText}>Submit report</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={dynamicStyles.sectionHeading}>Blocked Users</Text>
          <View style={[dynamicStyles.card, styles.blockedUsersCard]}>
            <Text style={[dynamicStyles.bodyMuted, { marginBottom: 12 }]}>
              Accounts you block cannot see your activity or contact you. You can
              unblock them anytime.
            </Text>
            <BlockedUsersList
              blockedUsers={blockedUsers}
              onUnblock={(id) => void handleUnblockUser(id)}
              unblockingId={unblockingId}
              loading={loadingProfiles && blockedUserIds.length > 0}
              emptyMessage="No blocked users"
            />
            {blockedUserIds.length > 8 ? (
              <TouchableOpacity
                style={dynamicStyles.blockedSeeAllBtn}
                onPress={() => router.push('/blocked-users' as never)}
                activeOpacity={0.85}
              >
                <Text style={dynamicStyles.blockedSeeAllText}>
                  View all blocked users
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={[dynamicStyles.sectionHeading, styles.growSectionHeading]}>
            Grow with Us
          </Text>
          <View style={dynamicStyles.menuGroupCard}>
            <ProfileMenuItem
              title="Create a business account"
              subtitle="Manage team and business orders"
              iconKind="business"
              onPress={handleBusinessAccount}
            />
            <ProfileMenuItem
              title="Add your restaurant"
              subtitle="Partner your restaurant with us"
              iconKind="restaurant"
              onPress={handleAddRestaurant}
            />
            <ProfileMenuItem
              title="Sign up as driver"
              subtitle="Earn by delivering orders"
              iconKind="driver"
              onPress={handleDriverSignup}
              isLast
            />
          </View>

          <View style={dynamicStyles.card}>
            <Text style={dynamicStyles.bodyMuted}>
              Users can report inappropriate behavior. To report or block someone you
              interacted with, open the order chat, Join tab, or Help. See Terms for
              how we handle reports.
            </Text>
            <TouchableOpacity
              style={dynamicStyles.dangerButton}
              onPress={handleDeleteAccount}
            >
              <Text style={dynamicStyles.dangerButtonText}>Delete account</Text>
            </TouchableOpacity>
            <TouchableOpacity style={dynamicStyles.signOutRow} onPress={handleSignOut}>
              <Text style={dynamicStyles.signOutText}>Sign out</Text>
            </TouchableOpacity>
          </View>

          {isAdminUser(user, firestoreUserRole) ? (
            <View style={dynamicStyles.card}>
              <Text style={dynamicStyles.label}>Admin</Text>
              <TouchableOpacity
                style={dynamicStyles.primaryButton}
                onPress={() => router.push(adminRoutes.home as never)}
              >
                <Text style={dynamicStyles.primaryButtonText}>Open admin panel</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {firestoreUserRole === 'restaurant' || firestoreUserRole === 'host' ? (
            <View style={dynamicStyles.card}>
              <Text style={dynamicStyles.label}>Host</Text>
              <TouchableOpacity
                style={dynamicStyles.primaryButton}
                onPress={() => router.push('/(host)/dashboard' as never)}
              >
                <Text style={dynamicStyles.primaryButtonText}>Open Host Dashboard</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.footer}>
            <Text style={dynamicStyles.footerMuted}>❤️ Made with love in Toronto</Text>
            <Text style={dynamicStyles.footerMuted}>v1.0</Text>
            <Text style={[dynamicStyles.bodyMuted, { textAlign: 'center', marginTop: 4 }]}>
              Users can report inappropriate behavior.
            </Text>
            <View style={styles.legalLinksRow}>
              <TouchableOpacity onPress={openTerms} accessibilityRole="link">
                <Text style={styles.legalLinkWeb}>Terms</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={openPrivacy} accessibilityRole="link">
                <Text style={styles.legalLinkWeb}>Privacy</Text>
              </TouchableOpacity>
            </View>
            <Text style={dynamicStyles.legalUrlHint}>{LEGAL_URLS.terms}</Text>
            <Text style={dynamicStyles.legalUrlHint}>{LEGAL_URLS.privacy}</Text>
          </View>
        </View>
      </ScrollView>
      <DeleteAccountModal
        visible={deleteAccountModalVisible}
        user={user}
        onDismiss={handleDeleteAccountDismiss}
        onNavigateLogin={() => void handleAfterAccountDeleted()}
      />
    </SafeAreaView>
    </SwipeWrapper>
  );
}

function createDynamicStyles(pal: Palette, isDarkMode: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: pal.bg,
    },
    centered: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    profileHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingVertical: 20,
      paddingHorizontal: 4,
      marginBottom: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    profileHeaderTextCol: {
      flex: 1,
      paddingRight: 16,
      minWidth: 0,
    },
    profileNameTitle: {
      fontSize: 32,
      fontWeight: '800',
      color: pal.text,
      letterSpacing: -1,
      lineHeight: 38,
    },
    profileEmailLine: {
      marginTop: 8,
      fontSize: 14,
      fontWeight: '500',
      color: pal.textSecondary,
    },
    profileRatingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      marginTop: 14,
    },
    profileRatingValue: {
      marginLeft: 6,
      fontSize: 20,
      fontWeight: '800',
      color: pal.text,
      letterSpacing: -0.3,
    },
    profileNewUserLabel: {
      marginLeft: 6,
      fontSize: 17,
      fontWeight: '700',
      color: pal.textSecondary,
      letterSpacing: -0.2,
    },
    profileReviewMeta: {
      fontSize: 15,
      fontWeight: '600',
      color: pal.textTertiary,
    },
    profilePhotoCol: {
      alignItems: 'flex-end',
    },
    profileHeaderChevron: {
      alignSelf: 'center',
      marginLeft: 6,
    },
    profileAvatarWrap: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: pal.surfaceMuted,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.18)',
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    profileAvatarImage: {
      width: 88,
      height: 88,
      borderRadius: 44,
    },
    trustChip: {
      alignSelf: 'flex-start',
      marginTop: 12,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: pal.chipBg,
      borderWidth: 1,
      borderColor: pal.border,
    },
    trustChipText: {
      fontSize: 12,
      fontWeight: '700',
      color: pal.text,
      letterSpacing: 0.2,
    },
    quickAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 18,
      paddingHorizontal: 18,
      borderRadius: 16,
      backgroundColor: pal.surface,
      borderWidth: 1,
      borderColor: pal.border,
      marginBottom: 12,
    },
    quickActionTextCol: {
      flex: 1,
      minWidth: 0,
    },
    quickActionText: {
      fontSize: 16,
      fontWeight: '700',
      color: pal.text,
      letterSpacing: -0.2,
    },
    quickActionSub: {
      marginTop: 3,
      fontSize: 13,
      fontWeight: '500',
      color: pal.textTertiary,
    },
    sectionHeading: {
      fontSize: 12,
      fontWeight: '800',
      color: pal.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 10,
      marginTop: 16,
    },
    card: {
      backgroundColor: pal.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: pal.border,
      padding: 20,
      marginBottom: 12,
    },
    menuGroupCard: {
      backgroundColor: PROFILE_MENU_COLORS.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: pal.border,
      marginBottom: 12,
      overflow: 'hidden',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.22,
          shadowRadius: 14,
        },
        android: { elevation: 4 },
        default: {},
      }),
    },
    label: {
      fontSize: 14,
      fontWeight: '700',
      color: pal.textSecondary,
      marginBottom: 8,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: pal.text,
      marginBottom: 4,
    },
    bodyMuted: {
      fontSize: 14,
      color: pal.textSecondary,
      lineHeight: 20,
    },
    input: {
      borderWidth: 1,
      borderColor: pal.border,
      borderRadius: theme.radius.input,
      padding: 14,
      fontSize: 16,
      color: pal.text,
      backgroundColor: pal.inputBg,
      marginBottom: 12,
    },
    phoneFieldShell: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: pal.border,
      borderRadius: theme.radius.input,
      backgroundColor: pal.inputBg,
      marginBottom: 8,
      paddingHorizontal: 14,
      minHeight: 52,
    },
    phoneFieldIcon: {
      marginRight: 4,
    },
    phoneFieldInput: {
      flex: 1,
      paddingVertical: 14,
      paddingLeft: 6,
      fontSize: 16,
      color: pal.text,
      marginBottom: 0,
    },
    phoneFieldHint: {
      fontSize: 12,
      fontWeight: '500',
      color: pal.textTertiary,
      marginBottom: 14,
      lineHeight: 17,
    },
    primaryButton: {
      backgroundColor: pal.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginBottom: 8,
      minHeight: 52,
    },
    primaryButtonText: {
      color: pal.onPrimary,
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    saveNameButton: {
      backgroundColor: pal.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
      minHeight: 54,
      width: '100%',
      alignSelf: 'stretch',
    },
    saveNameButtonText: {
      color: pal.onPrimary,
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    buttonDisabled: {
      opacity: 0.55,
    },
    feedbackOk: {
      fontSize: 13,
      color: pal.success,
      marginBottom: 8,
      fontWeight: '600',
    },
    feedbackErr: {
      fontSize: 13,
      color: pal.danger,
      marginBottom: 8,
      fontWeight: '600',
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: pal.border,
      marginVertical: 16,
    },
    readonlyRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    readonlyIcon: {
      marginTop: 22,
    },
    readOnlyValue: {
      fontSize: 16,
      fontWeight: '600',
      color: pal.text,
    },
    readonlyHintRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 6,
    },
    hint: {
      fontSize: 12,
      color: pal.textTertiary,
      fontWeight: '500',
    },
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    link: {
      fontSize: 16,
      color: tc.accentBlue,
      fontWeight: '600',
      textDecorationLine: 'underline',
    },
    legalGrid: {
      gap: 10,
    },
    outlineBtn: {
      borderWidth: 1,
      borderColor: pal.border,
      borderRadius: theme.radius.button,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: pal.inputBg,
    },
    outlineBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: pal.text,
    },
    chip: {
      borderWidth: 1,
      borderColor: pal.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: pal.inputBg,
    },
    chipActive: {
      borderColor: pal.primary,
      backgroundColor: isDarkMode ? 'rgba(168, 85, 247,0.18)' : tc.primaryLight,
    },
    chipText: {
      color: pal.textSecondary,
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'capitalize',
    },
    chipTextActive: {
      color: pal.text,
    },
    blockedSeeAllBtn: {
      marginTop: 14,
      alignSelf: 'center',
      paddingVertical: 8,
    },
    blockedSeeAllText: {
      fontSize: 15,
      fontWeight: '700',
      color: pal.primary,
    },
    dangerButton: {
      backgroundColor: pal.danger,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 10,
    },
    dangerButtonText: {
      color: pal.onPrimary,
      fontSize: 16,
      fontWeight: '700',
    },
    signOutRow: {
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 4,
      borderTopWidth: 1,
      borderTopColor: pal.border,
    },
    signOutText: {
      color: pal.text,
      fontWeight: '700',
      fontSize: 16,
    },
    footerMuted: {
      fontSize: 13,
      color: pal.textTertiary,
    },
    legalLink: {
      fontSize: 12,
      color: pal.textSecondary,
      textDecorationLine: 'underline',
    },
    legalUrlHint: {
      fontSize: 11,
      color: pal.textTertiary,
      marginTop: 4,
    },
  });
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 40,
    flexGrow: 1,
  },
  profileBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  footer: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 28,
    gap: 4,
  },
  legalLinksRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    flexWrap: 'wrap',
  },
  legalLinkWeb: {
    color: '#7D8493',
    textDecorationLine: 'underline',
    fontSize: 12,
    fontWeight: '600',
  },
  reasonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  roleButton: {
    flex: 1,
  },
  blockedUsersCard: {
    overflow: 'hidden',
  },
  growSectionHeading: {
    marginTop: 8,
  },
  inputMultiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
});
