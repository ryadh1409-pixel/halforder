import { AdminHeader } from '@/components/admin/AdminHeader';
import {
  FoodSlotEditModal,
  type FoodSlotDraft,
} from '@/components/admin/FoodSlotEditModal';
import { systemConfirm } from '@/components/SystemDialogHost';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { theme } from '@/constants/theme';
import {
  isAdminFoodCardSlotId,
  type AdminFoodCardSlotId,
} from '@/constants/adminFoodCards';
import { USER_ROUTES } from '@/lib/navigationPaths';
import { PickerMediaType } from '@/lib/imagePickerMedia';
import { adminLog } from '@/lib/admin/adminDebug';
import { parsePromotionBadge } from '@/lib/promotionBadge';
import {
  deleteAdminFoodCardSlot,
  setAdminFoodCardActive,
  subscribeAdminFoodCardDetail,
  type AdminFoodCardDetail,
} from '@/services/adminFoodCardDetail';
import {
  saveAdminFoodCardSlot,
  type AdminFoodCardSlot,
} from '@/services/adminFoodCardSlots';
import { generateFoodCardAiDescription } from '@/services/foodCardAiDescription';
import { auth, storage } from '@/services/firebase';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getUserFriendlyError } from '@/utils/errorHandler';
import { showError, showNotice, showSuccess } from '@/utils/toast';

function emptyDraft(): FoodSlotDraft {
  return {
    title: '',
    image: '',
    price: '',
    sharingPrice: '',
    deliveryShare: '',
    venueLocation: '',
    active: false,
    aiDescription: '',
    restaurantName: 'HalfOrder',
    promotionBadge: 'none',
  };
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({
  label,
  value,
  onPress,
  mono,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  mono?: boolean;
}) {
  const text = (
    <Text style={[styles.v, onPress && styles.link, mono && styles.mono]}>
      {value || '—'}
    </Text>
  );
  return (
    <View style={styles.row}>
      <Text style={styles.k}>{label}</Text>
      {onPress ? (
        <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
          {text}
        </TouchableOpacity>
      ) : (
        text
      )}
    </View>
  );
}

function money(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '—';
  return `$${amount.toFixed(2)}`;
}

export default function AdminFoodCardDetailScreen() {
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const cardId = typeof rawId === 'string' ? rawId.trim() : '';

  const [detail, setDetail] = useState<AdminFoodCardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<FoodSlotDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const slotMeta = useMemo((): AdminFoodCardSlot | null => {
    if (!detail || !isAdminFoodCardSlotId(detail.cardId)) return null;
    const idNum = Number.parseInt(detail.cardId, 10) || 1;
    const fee = Number.parseFloat(detail.deliveryFeeLabel.replace('$', ''));
    return {
      docId: detail.cardId as AdminFoodCardSlotId,
      id: idNum,
      title: detail.foodName,
      image: detail.image,
      price: detail.originalPrice,
      sharingPrice: detail.sharedPrice,
      deliveryShare: Number.isFinite(fee) ? fee : 0,
      venueLocation: detail.pickupAddress === '—' ? '' : detail.pickupAddress,
      active: detail.active,
      aiDescription: detail.description === '—' ? '' : detail.description,
      restaurantName: detail.restaurantName,
      promotionBadge: detail.promotionBadge,
    };
  }, [detail]);

  useEffect(() => {
    if (!isAdminFoodCardSlotId(cardId)) {
      setLoading(false);
      setDetail(null);
      return;
    }
    adminLog('food-card-detail', `subscribe card ${cardId}`);
    const unsub = subscribeAdminFoodCardDetail(
      cardId,
      (row) => {
        setDetail(row);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [cardId]);

  const openEdit = useCallback(() => {
    if (!detail) return;
    const isPlaceholder = detail.foodName.includes('(not configured)');
    setDraft({
      title: isPlaceholder ? '' : detail.foodName,
      image: detail.image,
      price: detail.originalPrice > 0 ? String(detail.originalPrice) : '',
      sharingPrice: detail.sharedPrice > 0 ? String(detail.sharedPrice) : '',
      deliveryShare:
        detail.deliveryFeeLabel !== '—'
          ? detail.deliveryFeeLabel.replace('$', '')
          : '0',
      venueLocation: detail.pickupAddress === '—' ? '' : detail.pickupAddress,
      active: detail.active,
      aiDescription: detail.description === '—' ? '' : detail.description,
      restaurantName: detail.restaurantName,
      promotionBadge: detail.promotionBadge,
    });
    setEditOpen(true);
  }, [detail]);

  const failValidation = (message: string) => {
    console.warn('[SAVE] validation failed:', message);
    Alert.alert('Validation Error', message);
    showError(message);
  };

  const onSaveEdit = async () => {
    console.log('[SAVE] pressed');
    console.log('[SAVE] formData', draft);
    console.log('[SAVE] cardId', cardId);

    if (!isAdminFoodCardSlotId(cardId)) {
      const msg = 'Invalid card ID — cannot save.';
      console.warn('[SAVE] blocked:', msg);
      Alert.alert('Save Failed', msg);
      showError(msg);
      return;
    }

    const priceNum = Number(draft.price);
    const sharingNum = Number(draft.sharingPrice);
    const deliveryNum = Number(draft.deliveryShare);

    if (!draft.title.trim()) {
      failValidation('Food title is required.');
      return;
    }
    if (!draft.image.trim()) {
      failValidation('Image is required. Tap "Upload image" first.');
      return;
    }
    if (
      draft.image.startsWith('file://') ||
      draft.image.startsWith('content://') ||
      draft.image.startsWith('ph://')
    ) {
      failValidation(
        'Image upload is still in progress or failed. Wait for upload to finish or try again.',
      );
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      failValidation('Enter a valid original price greater than 0.');
      return;
    }
    if (!Number.isFinite(sharingNum) || sharingNum <= 0) {
      failValidation('Enter a valid shared food price greater than 0.');
      return;
    }
    if (!Number.isFinite(deliveryNum) || deliveryNum < 0) {
      failValidation('Enter a valid delivery share (0 or more).');
      return;
    }

    const slotDocId = cardId as AdminFoodCardSlotId;
    const slotIdNum = Number.parseInt(cardId, 10) || 1;

    setSaving(true);
    try {
      console.log('[SAVE] calling saveAdminFoodCardSlot', {
        collection: 'adminFoodShares',
        documentId: slotDocId,
      });
      await saveAdminFoodCardSlot(slotDocId, {
        id: slotIdNum,
        title: draft.title,
        image: draft.image,
        price: priceNum,
        sharingPrice: sharingNum,
        deliveryShare: deliveryNum,
        venueLocation: draft.venueLocation,
        active: draft.active,
        aiDescription: draft.aiDescription,
        restaurantName: draft.restaurantName,
        promotionBadge: parsePromotionBadge(draft.promotionBadge),
      });
      console.log('[SAVE] completed successfully');
      setEditOpen(false);
      showSuccess(`Card ${slotDocId} saved.`);
    } catch (error) {
      console.error('[SAVE ERROR]', error);
      const msg = getUserFriendlyError(error);
      Alert.alert('Save Failed', msg);
      showError(msg);
    } finally {
      setSaving(false);
    }
  };

  const pickImage = async () => {
    console.log('[IMAGE PICK] start', { cardId });

    if (!isAdminFoodCardSlotId(cardId)) {
      const msg = 'Invalid card id — cannot upload image.';
      console.warn('[IMAGE PICK] blocked:', msg);
      Alert.alert('Upload Failed', msg);
      return;
    }

    const uid = auth.currentUser?.uid ?? '';
    if (!uid) {
      const msg = 'Sign in required to upload images.';
      Alert.alert('Upload Failed', msg);
      return;
    }

    const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!p.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to upload.');
      showError('Allow photo library access to upload.');
      return;
    }

    console.log('[IMAGE PICK] launching library');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: [PickerMediaType.Images],
      allowsEditing: true,
      quality: 0.82,
    });

    if (result.canceled || !result.assets[0]?.uri) {
      console.log('[IMAGE PICK] cancelled or no uri');
      return;
    }

    const uri = result.assets[0].uri;
    console.log('[IMAGE PICKED]', uri);

    setDraft((prev) => {
      const next = { ...prev, image: uri };
      console.log('[IMAGE SAVED TO DRAFT]', next.image);
      return next;
    });

    setUploading(true);
    try {
      const res = await fetch(uri);
      const blob = await res.blob();
      const storagePath = `foodTemplates/${uid}/foodCard_${cardId}_${Date.now()}.jpg`;
      console.log('[IMAGE UPLOAD] collection=storage path=', storagePath);
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
      const downloadUrl = await getDownloadURL(storageRef);
      console.log('[IMAGE UPLOAD] success', downloadUrl);
      setDraft((prev) => {
        const next = { ...prev, image: downloadUrl };
        console.log('[IMAGE SAVED TO DRAFT]', next.image);
        return next;
      });
      showSuccess('Image uploaded.');
    } catch (e) {
      console.error('[IMAGE UPLOAD ERROR]', e);
      const msg = getUserFriendlyError(e);
      Alert.alert('Upload Failed', msg);
      showError(msg);
    } finally {
      setUploading(false);
    }
  };

  const onGenerateAi = async () => {
    if (!slotMeta) return;
    setAiBusy(true);
    try {
      const gen = await generateFoodCardAiDescription({
        title: draft.title.trim() || slotMeta.title || 'Dish',
        restaurantName:
          draft.restaurantName.trim() || slotMeta.restaurantName || 'Restaurant',
      });
      if (gen) setDraft((prev) => ({ ...prev, aiDescription: gen }));
      else {
        showNotice(
          'OpenAI',
          'Configure EXPO_PUBLIC_OPENAI_API_KEY or type a description manually.',
        );
      }
    } finally {
      setAiBusy(false);
    }
  };

  const toggleActive = async () => {
    if (!detail || !isAdminFoodCardSlotId(detail.cardId)) return;
    const next = !detail.active;
    const ok = await systemConfirm({
      title: next ? 'Activate card' : 'Deactivate card',
      message: next
        ? 'This card will appear in the swipe deck.'
        : 'This card will be hidden from the swipe deck.',
      confirmLabel: next ? 'Activate' : 'Deactivate',
    });
    if (!ok) return;
    setActing(true);
    try {
      await setAdminFoodCardActive(detail.cardId as AdminFoodCardSlotId, next);
      showSuccess(next ? 'Card activated.' : 'Card deactivated.');
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setActing(false);
    }
  };

  const onDelete = async () => {
    if (!detail || !isAdminFoodCardSlotId(detail.cardId)) return;
    const ok = await systemConfirm({
      title: 'Delete card',
      message:
        'Remove this slot from Firestore? You can re-create it from Edit.',
      confirmLabel: 'Delete card',
      destructive: true,
    });
    if (!ok) return;
    setActing(true);
    try {
      await deleteAdminFoodCardSlot(detail.cardId as AdminFoodCardSlotId);
      showSuccess('Card deleted.');
      router.replace(adminRoutes.home as never);
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setActing(false);
    }
  };

  if (!isAdminFoodCardSlotId(cardId)) {
    return (
      <SafeAreaView style={styles.screen}>
        <AdminHeader title="Food card" fallbackRoute={adminRoutes.home} />
        <Text style={styles.muted}>Invalid card id</Text>
      </SafeAreaView>
    );
  }

  if (loading && !detail) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!detail) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <AdminHeader title="Food card" fallbackRoute={adminRoutes.home} />
        <Text style={styles.muted}>Card not found</Text>
      </SafeAreaView>
    );
  }

  const configured = detail.foodName !== 'Shared meal' || detail.image.length > 0;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title={configured ? detail.foodName : `Slot ${detail.cardId}`}
        subtitle={detail.restaurantName}
        fallbackRoute={adminRoutes.home}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.heroWrap}>
          {detail.image ? (
            <Image
              source={{ uri: detail.image }}
              style={styles.hero}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.hero, styles.heroPlaceholder]}>
              <Ionicons name="fast-food-outline" size={44} color={COLORS.textMuted} />
              <Text style={styles.heroPlaceholderText}>No image</Text>
            </View>
          )}
          <View
            style={[
              styles.statusPill,
              detail.active ? styles.statusActive : styles.statusInactive,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                detail.active ? styles.statusTextActive : styles.statusTextInactive,
              ]}
            >
              {detail.active ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>

        <Section title="Card details">
          <Row label="Card ID" value={detail.cardId} mono />
          <Row label="Food name" value={detail.foodName} />
          <Row label="Restaurant name" value={detail.restaurantName} />
          <Row label="Original price" value={money(detail.originalPrice)} />
          <Row label="Sharing price" value={money(detail.sharedPrice)} />
          <Row label="Promotion badge" value={detail.promotionBadgeLabel} />
          <Row label="Pickup or delivery" value={detail.pickupOrDeliveryLabel} />
          <Row label="Delivery fee" value={detail.deliveryFeeLabel} />
          <Row label="Date" value={detail.dateLabel} />
          <Row label="Time" value={detail.timeLabel} />
          <Row
            label="Active status"
            value={detail.active ? 'Active' : 'Inactive'}
          />
        </Section>

        <Section title="Invite analytics">
          <Row label="Invites sent" value={String(detail.inviteStats.sent)} />
          <Row label="Invites opened" value={String(detail.inviteStats.opened)} />
          <Row
            label="Invite conversions"
            value={String(detail.inviteStats.converted)}
          />
          <Row
            label="Conversion rate"
            value={
              detail.inviteStats.sent > 0
                ? `${detail.inviteStats.conversionRate}%`
                : '—'
            }
          />
        </Section>

        <Section title="Waiting users">
          {detail.waitingUsers.length === 0 ? (
            <Row label="Status" value="No users waiting" />
          ) : (
            detail.waitingUsers.map((user) => (
              <View key={user.userId} style={styles.waitingUserBlock}>
                <Row label="Name" value={user.userFirstName} />
                <Row
                  label="User ID"
                  value={user.userId}
                  mono
                  onPress={() =>
                    router.push(adminRoutes.user(user.userId) as never)
                  }
                />
                <Row label="Joined" value={user.joinedAtLabel} />
                <Row label="Status" value={user.status} />
              </View>
            ))
          )}
        </Section>

        <Section title="User">
          <Row label="Creator user name" value={detail.creatorName ?? '—'} />
          <Row
            label="User ID"
            value={detail.creatorUserId ?? '—'}
            mono
            onPress={
              detail.creatorUserId
                ? () =>
                    router.push(adminRoutes.user(detail.creatorUserId!) as never)
                : undefined
            }
          />
          <Row label="Email" value={detail.creatorEmail ?? '—'} />
          <Row label="Phone" value={detail.creatorPhone ?? '—'} />
        </Section>

        <Section title="Match">
          <Row label="Hub status" value={detail.hubStatusLabel} />
          <Row label="Chat status" value={detail.chatStatusLabel} />
          <Row label="Matched user name" value={detail.matchedUserName ?? '—'} />
          <Row
            label="Matched user ID"
            value={detail.matchedUserId ?? '—'}
            mono
            onPress={
              detail.matchedUserId
                ? () =>
                    router.push(
                      adminRoutes.user(detail.matchedUserId!) as never,
                    )
                : undefined
            }
          />
          <Row label="Match status" value={detail.matchStatus ?? '—'} />
          <Row label="Payment status" value={detail.paymentStatus ?? '—'} />
          <Row label="Match timestamp" value={detail.matchTimestampLabel} />
        </Section>

        <Section title="Driver">
          <Row label="Driver name" value={detail.driverName ?? '—'} />
          <Row
            label="Driver ID"
            value={detail.assignedDriverId ?? '—'}
            mono
            onPress={
              detail.assignedDriverId
                ? () =>
                    router.push(
                      adminRoutes.user(detail.assignedDriverId!) as never,
                    )
                : undefined
            }
          />
          <Row label="Delivery status" value={detail.deliveryStatusLabel} />
        </Section>

        <View style={styles.actionsCard}>
          <Text style={styles.sectionTitle}>Admin actions</Text>
          <View style={styles.actionGrid}>
            <ActionBtn icon="create-outline" label="Edit" onPress={openEdit} />
            {detail.active ? (
              <ActionBtn
                icon="pause-circle-outline"
                label="Deactivate"
                onPress={toggleActive}
                disabled={acting}
              />
            ) : (
              <ActionBtn
                icon="play-circle-outline"
                label="Activate"
                onPress={toggleActive}
                disabled={acting}
              />
            )}
            <ActionBtn
              icon="trash-outline"
              label="Delete card"
              onPress={onDelete}
              disabled={acting}
              destructive
            />
            <ActionBtn
              icon="people-outline"
              label="View match"
              onPress={() => {
                if (detail.matchId) {
                  router.push(USER_ROUTES.foodShareMatch(detail.matchId) as never);
                } else showError('No match for this card yet.');
              }}
              disabled={!detail.matchId}
            />
            <ActionBtn
              icon="person-outline"
              label="View user"
              onPress={() => {
                const uid = detail.creatorUserId ?? detail.matchedUserId;
                if (uid) router.push(adminRoutes.user(uid) as never);
                else showError('No user linked to this card yet.');
              }}
              disabled={!detail.creatorUserId && !detail.matchedUserId}
            />
          </View>
        </View>
      </ScrollView>

      <FoodSlotEditModal
        visible={editOpen}
        slotLabel={`Edit card ${detail.cardId}`}
        draft={draft}
        onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
        onClose={() => setEditOpen(false)}
        onSave={() => {
          void onSaveEdit();
        }}
        onReset={() => openEdit()}
        onPickImage={() => void pickImage()}
        onGenerateAi={() => void onGenerateAi()}
        saving={saving}
        uploading={uploading}
        aiBusy={aiBusy}
      />
    </SafeAreaView>
  );
}

function ActionBtn({
  icon,
  label,
  onPress,
  disabled,
  destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.actionBtn,
        disabled && styles.actionBtnDisabled,
        destructive && styles.actionBtnDanger,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
    >
      <Ionicons
        name={icon}
        size={18}
        color={destructive ? COLORS.error : COLORS.primary}
      />
      <Text
        style={[
          styles.actionBtnText,
          destructive && { color: COLORS.error },
          disabled && { color: COLORS.textMuted },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, paddingBottom: 40 },
  muted: { color: COLORS.textMuted, padding: 16 },
  heroWrap: { marginBottom: 14, position: 'relative' },
  hero: {
    width: '100%',
    height: 200,
    borderRadius: theme.radius.lg,
    backgroundColor: '#B7BDC9',
  },
  heroPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  heroPlaceholderText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  statusPill: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusActive: { backgroundColor: COLORS.successBg },
  statusInactive: { backgroundColor: 'rgba(15,23,42,0.08)' },
  statusText: { fontSize: 13, fontWeight: '800' },
  statusTextActive: { color: COLORS.successText },
  statusTextInactive: { color: COLORS.textMuted },
  card: { ...adminCardShell, marginBottom: 14, padding: theme.spacing.md },
  waitingUserBlock: {
    paddingVertical: 8,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 10,
  },
  row: { marginBottom: 8 },
  k: { fontSize: 12, color: COLORS.textMuted, marginBottom: 2 },
  v: { fontSize: 15, color: COLORS.text },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
  link: { color: COLORS.primary, fontWeight: '700' },
  actionsCard: { ...adminCardShell, padding: theme.spacing.md, marginBottom: 8 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    minWidth: '47%',
    flexGrow: 1,
  },
  actionBtnDisabled: { opacity: 0.45 },
  actionBtnDanger: {
    borderColor: 'rgba(220, 38, 38, 0.25)',
    backgroundColor: COLORS.dangerBg,
  },
  actionBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.text },
});
