import { SupportAttachmentSheet } from '@/components/support/SupportAttachmentSheet';
import { SupportImageGallery } from '@/components/support/SupportImageGallery';
import { goBackFromProfileScreen } from '@/lib/profileBack';
import { submitComplaint } from '@/services/complaints';
import { ImagePickerPermissionError } from '@/services/imagePicker';
import {
  pickSupportImagesFromLibrary,
  takeSupportPhoto,
  uploadSupportAttachments,
} from '@/services/supportAttachments';
import {
  buildEmoStepPrompt,
  buildEmoSupportGreeting,
  fetchRecentOrdersForSupport,
  firstNameFromDisplayName,
  type SupportOrderOption,
} from '@/services/supportIntake';
import { useAuth } from '@/services/AuthContext';
import {
  SUPPORT_ISSUE_CATEGORIES,
  type SupportIntakeStepId,
  type SupportIssueCategory,
} from '@/types/supportIntake';
import { moderateUserContent } from '@/utils/contentModeration';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { showError, showSuccess } from '@/utils/toast';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type ChatRole = 'emo' | 'user' | 'system';

type LocalChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  categoryCards?: boolean;
  orderPicker?: boolean;
  imageStep?: boolean;
};

const EMO_AVATAR_COLOR = '#A855F7';

function stepPromptFor(
  category: SupportIssueCategory,
  step: SupportIntakeStepId,
): string {
  return buildEmoStepPrompt(category.id, step);
}

export default function ComplaintScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);
  const scaleAnims = useRef<Record<string, Animated.Value>>({}).current;
  const advancingImagesRef = useRef(false);

  const firstName = firstNameFromDisplayName(user?.displayName);

  const [messages, setMessages] = useState<LocalChatMessage[]>([]);
  const [category, setCategory] = useState<SupportIssueCategory | null>(null);
  const [stepIndex, setStepIndex] = useState(-1);
  const [orders, setOrders] = useState<SupportOrderOption[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [localImages, setLocalImages] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<number, number>>({});
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [description, setDescription] = useState('');
  const [draft, setDraft] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [imageSendBusy, setImageSendBusy] = useState(false);
  const [awaitingText, setAwaitingText] = useState<
    null | 'payment_amount' | 'payment_date' | 'order_number_optional' | 'description'
  >(null);

  const steps = category?.steps ?? [];
  const currentStep = stepIndex >= 0 ? steps[stepIndex] : null;

  useEffect(() => {
    if (!user) return;
    setMessages([
      {
        id: 'greet',
        role: 'emo',
        text: buildEmoSupportGreeting(firstName),
        categoryCards: true,
      },
    ]);
  }, [user, firstName]);

  useEffect(() => {
    if (messages.length === 0) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages.length, localImages.length, currentStep]);

  const ensureAnim = (id: string) => {
    if (!scaleAnims[id]) scaleAnims[id] = new Animated.Value(1);
    return scaleAnims[id];
  };

  const pushEmo = (text: string, extras?: Partial<LocalChatMessage>) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `emo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        role: 'emo',
        text,
        ...extras,
      },
    ]);
  };

  const pushUser = (text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        role: 'user',
        text,
      },
    ]);
  };

  const advanceToStep = async (
    cat: SupportIssueCategory,
    nextIndex: number,
  ) => {
    const step = cat.steps[nextIndex];
    if (!step) return;
    setStepIndex(nextIndex);
    setAwaitingText(null);

    if (step === 'select_order') {
      setOrdersLoading(true);
      pushEmo(stepPromptFor(cat, step), { orderPicker: true });
      try {
        const rows = user?.uid
          ? await fetchRecentOrdersForSupport(user.uid)
          : [];
        setOrders(rows);
      } catch {
        setOrders([]);
      } finally {
        setOrdersLoading(false);
      }
      return;
    }

    if (step === 'upload_images') {
      pushEmo(stepPromptFor(cat, step), { imageStep: true });
      return;
    }

    if (
      step === 'payment_amount' ||
      step === 'payment_date' ||
      step === 'order_number_optional' ||
      step === 'description'
    ) {
      pushEmo(stepPromptFor(cat, step));
      setAwaitingText(step);
      return;
    }

    if (step === 'review') {
      pushEmo(stepPromptFor(cat, step));
    }
  };

  const goNextAfter = async (fromStep: SupportIntakeStepId) => {
    if (!category) return;
    const idx = category.steps.indexOf(fromStep);
    const next = idx + 1;
    if (next >= category.steps.length) return;
    await advanceToStep(category, next);
  };

  const onSelectCategory = (cat: SupportIssueCategory) => {
    const anim = ensureAnim(cat.id);
    Animated.sequence([
      Animated.timing(anim, { toValue: 0.96, duration: 90, useNativeDriver: true }),
      Animated.spring(anim, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();

    setCategory(cat);
    pushUser(cat.label);
    void advanceToStep(cat, 0);
  };

  const onSelectOrder = (order: SupportOrderOption | null) => {
    if (order) {
      setSelectedOrderId(order.id);
      pushUser(order.label);
    } else {
      setSelectedOrderId(null);
      pushUser('No specific order');
    }
    void goNextAfter('select_order');
  };

  const addFromLibrary = async () => {
    try {
      const remaining = Math.max(0, 8 - localImages.length);
      if (remaining <= 0) {
        showError('You can attach up to 8 photos.');
        return;
      }
      const uris = await pickSupportImagesFromLibrary(remaining);
      if (uris.length) setLocalImages((prev) => [...prev, ...uris].slice(0, 8));
    } catch (e) {
      if (e instanceof ImagePickerPermissionError) showError(e.message);
      else showError(getUserFriendlyError(e));
    }
  };

  const addFromCamera = async () => {
    try {
      if (localImages.length >= 8) {
        showError('You can attach up to 8 photos.');
        return;
      }
      const uri = await takeSupportPhoto();
      if (uri) setLocalImages((prev) => [...prev, uri].slice(0, 8));
    } catch (e) {
      if (e instanceof ImagePickerPermissionError) showError(e.message);
      else showError(getUserFriendlyError(e));
    }
  };

  const continueFromImages = () => {
    if (advancingImagesRef.current || imageSendBusy) return;
    advancingImagesRef.current = true;
    setImageSendBusy(true);
    try {
      pushUser(
        localImages.length
          ? `${localImages.length} photo${localImages.length === 1 ? '' : 's'} attached`
          : 'No photos',
      );
      void goNextAfter('upload_images');
    } finally {
      // Keep button disabled briefly to prevent double-advance; step change clears UI.
      setTimeout(() => {
        advancingImagesRef.current = false;
        setImageSendBusy(false);
      }, 400);
    }
  };

  const submitTextStep = () => {
    if (!awaitingText) return;
    const raw = draft.trim();

    if (awaitingText === 'order_number_optional' && !raw) {
      pushUser('Skipped');
      setDraft('');
      void goNextAfter(awaitingText);
      return;
    }

    if (!raw) {
      showError('Please enter a response, or go back.');
      return;
    }

    if (awaitingText === 'description') {
      const mod = moderateUserContent(raw, { maxLength: 2000 });
      if (!mod.ok) {
        showError(mod.reason);
        return;
      }
      setDescription(mod.text);
      pushUser(mod.text);
    } else if (awaitingText === 'payment_amount') {
      setPaymentAmount(raw);
      pushUser(raw);
    } else if (awaitingText === 'payment_date') {
      setPaymentDate(raw);
      pushUser(raw);
    } else if (awaitingText === 'order_number_optional') {
      setOrderNumber(raw);
      pushUser(raw);
    }

    setDraft('');
    void goNextAfter(awaitingText);
  };

  const reviewSummary = useMemo(() => {
    if (!category) return '';
    const lines = [
      `Category: ${category.storeLabel}`,
      `Order: ${selectedOrderId || orderNumber || '—'}`,
      paymentAmount ? `Amount: ${paymentAmount}` : null,
      paymentDate ? `Payment date: ${paymentDate}` : null,
      `Photos: ${localImages.length}`,
      '',
      description || '(no description)',
    ].filter((x): x is string => x != null);
    return lines.join('\n');
  }, [
    category,
    selectedOrderId,
    orderNumber,
    paymentAmount,
    paymentDate,
    localImages.length,
    description,
  ]);

  const handleSubmit = async () => {
    if (!user || !category || submitting) return;
    const desc = description.trim();
    if (!desc) {
      showError('Please add a short description before submitting.');
      return;
    }
    const mod = moderateUserContent(desc, { maxLength: 2000 });
    if (!mod.ok) {
      showError(mod.reason);
      return;
    }

    setSubmitting(true);
    try {
      const conversationId = user.uid;
      let attachments: Awaited<ReturnType<typeof uploadSupportAttachments>> = [];
      if (localImages.length > 0) {
        attachments = await uploadSupportAttachments({
          userId: user.uid,
          conversationId,
          localUris: localImages,
          onItemProgress: (index, p) => {
            setUploadProgress((prev) => ({ ...prev, [index]: p.progress }));
          },
        });
      }

      const detailParts = [
        mod.text,
        paymentAmount ? `Payment amount: ${paymentAmount}` : null,
        paymentDate ? `Payment date: ${paymentDate}` : null,
        orderNumber && !selectedOrderId ? `Order number: ${orderNumber}` : null,
      ].filter(Boolean);

      const result = await submitComplaint(
        {
          uid: user.uid,
          email: user.email ?? null,
          displayName: user.displayName,
        },
        detailParts.join('\n\n'),
        {
          category: category.storeLabel,
          orderId: selectedOrderId || orderNumber || null,
          paymentId: null,
          paymentAmount: paymentAmount || null,
          paymentDate: paymentDate || null,
          attachments,
        },
      );

      setLocalImages([]);
      setUploadProgress({});
      showSuccess(`Request ${result.referenceNumber} submitted`);
      router.replace('/customer-support' as never);
    } catch (e) {
      showError(
        getUserFriendlyError(e) ||
          'Upload failed. Please check your connection and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => goBackFromProfileScreen(router)} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>HalfOrder Support</Text>
        </View>
        <View style={styles.center}>
          <Text style={styles.muted}>Sign in to contact HalfOrder Support.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const showComposer =
    awaitingText != null || currentStep === 'upload_images' || currentStep === 'review';

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => goBackFromProfileScreen(router)} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </Pressable>
        <View style={styles.emoDot}>
          <Text style={styles.emoDotText}>E</Text>
        </View>
        <View style={styles.headerMeta}>
          <Text style={styles.headerTitle}>Emo AI Support</Text>
          <Text style={styles.headerSub}>Guided · typically under 24 hours</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubble,
                item.role === 'user' ? styles.bubbleUser : styles.bubbleEmo,
              ]}
            >
              {item.role !== 'user' ? (
                <Text style={styles.emoLabel}>Emo AI</Text>
              ) : null}
              <Text style={styles.bubbleBody}>{item.text}</Text>

              {item.categoryCards && !category ? (
                <View style={styles.cards}>
                  {SUPPORT_ISSUE_CATEGORIES.map((cat) => {
                    const anim = ensureAnim(cat.id);
                    return (
                      <Animated.View
                        key={cat.id}
                        style={{ transform: [{ scale: anim }] }}
                      >
                        <Pressable
                          style={styles.card}
                          onPress={() => onSelectCategory(cat)}
                        >
                          <View style={styles.cardIcon}>
                            <Ionicons
                              name={cat.icon as keyof typeof Ionicons.glyphMap}
                              size={20}
                              color={EMO_AVATAR_COLOR}
                            />
                          </View>
                          <View style={styles.cardText}>
                            <Text style={styles.cardTitle}>{cat.label}</Text>
                            <Text style={styles.cardSub}>{cat.subtitle}</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color="#7D8493" />
                        </Pressable>
                      </Animated.View>
                    );
                  })}
                </View>
              ) : null}

              {item.orderPicker ? (
                <View style={styles.orderList}>
                  {ordersLoading ? (
                    <ActivityIndicator color={EMO_AVATAR_COLOR} />
                  ) : (
                    <>
                      {orders.map((o) => (
                        <Pressable
                          key={o.id}
                          style={styles.orderChip}
                          onPress={() => onSelectOrder(o)}
                        >
                          <Text style={styles.orderChipText} numberOfLines={2}>
                            {o.label}
                          </Text>
                        </Pressable>
                      ))}
                      <Pressable
                        style={[styles.orderChip, styles.orderSkip]}
                        onPress={() => onSelectOrder(null)}
                      >
                        <Text style={styles.orderChipText}>Skip — no order</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              ) : null}

              {item.imageStep ? (
                <Text style={styles.imageStepHint}>
                  Attach photos below, then tap Send.
                </Text>
              ) : null}
            </View>
          )}
        />

        {currentStep === 'review' ? (
          <View style={styles.reviewCard}>
            <Text style={styles.reviewTitle}>Review</Text>
            <Text style={styles.reviewBody}>{reviewSummary}</Text>
            {localImages.length > 0 ? (
              <SupportImageGallery urls={[]} localUris={localImages} compact />
            ) : null}
            <Pressable
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={() => void handleSubmit()}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.submitBtnText}>Submit request</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {currentStep === 'upload_images' ? (
          <View
            style={[
              styles.attachComposer,
              { paddingBottom: Math.max(insets.bottom, 10) },
            ]}
          >
            {localImages.length > 0 ? (
              <View style={styles.pendingDock}>
                <Text style={styles.pendingLabel}>
                  {localImages.length} photo{localImages.length === 1 ? '' : 's'} ready
                </Text>
                <SupportImageGallery
                  urls={[]}
                  localUris={localImages}
                  onRemoveLocal={(i) =>
                    setLocalImages((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  uploadProgressByIndex={uploadProgress}
                  compact
                />
              </View>
            ) : (
              <Text style={styles.pendingEmpty}>
                No photos yet — add screenshots, then Send
              </Text>
            )}
            <View style={styles.composerRow}>
              <Pressable
                style={styles.attachBtn}
                onPress={() => setSheetOpen(true)}
                disabled={imageSendBusy}
                accessibilityLabel="Add photos"
              >
                <Ionicons name="add" size={24} color="#FFF" />
              </Pressable>
              <Pressable
                style={[
                  styles.sendPill,
                  imageSendBusy && { opacity: 0.55 },
                ]}
                onPress={continueFromImages}
                disabled={imageSendBusy}
                accessibilityRole="button"
                accessibilityLabel={
                  localImages.length > 0 ? 'Send photos' : 'Continue without photos'
                }
              >
                {imageSendBusy ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Text style={styles.sendPillText}>
                      {localImages.length > 0 ? 'Send' : 'Skip photos'}
                    </Text>
                    <Ionicons name="send" size={16} color="#FFF" />
                  </>
                )}
              </Pressable>
            </View>
          </View>
        ) : null}

        {awaitingText ? (
          <View
            style={[
              styles.composer,
              { paddingBottom: Math.max(insets.bottom, 10) },
            ]}
          >
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={
                awaitingText === 'order_number_optional'
                  ? 'Order number (optional)'
                  : awaitingText === 'description'
                    ? 'Describe your issue…'
                    : 'Type your answer…'
              }
              placeholderTextColor="#7D8493"
              style={styles.input}
              multiline
              maxLength={2000}
            />
            <Pressable
              style={[
                styles.sendBtn,
                !draft.trim() &&
                  awaitingText !== 'order_number_optional' && { opacity: 0.45 },
              ]}
              onPress={submitTextStep}
              accessibilityLabel="Send"
            >
              <Ionicons name="send" size={18} color="#FFF" />
            </Pressable>
          </View>
        ) : null}

        {!showComposer ? <View style={{ height: Math.max(insets.bottom, 8) }} /> : null}
      </KeyboardAvoidingView>

      <SupportAttachmentSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCamera={() => void addFromCamera()}
        onLibrary={() => void addFromLibrary()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  emoDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: EMO_AVATAR_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoDotText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  headerMeta: { flex: 1 },
  headerTitle: { color: '#FFF', fontWeight: '800', fontSize: 17 },
  headerSub: { color: '#B7BDC9', fontSize: 12, marginTop: 2, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: '#B7BDC9', textAlign: 'center' },
  list: { padding: 16, paddingBottom: 24, gap: 4 },
  bubble: {
    maxWidth: '94%',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  bubbleEmo: {
    alignSelf: 'flex-start',
    backgroundColor: '#171923',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: EMO_AVATAR_COLOR,
  },
  emoLabel: {
    color: EMO_AVATAR_COLOR,
    fontWeight: '800',
    fontSize: 11,
    marginBottom: 6,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  bubbleBody: { color: '#FFF', fontSize: 15, lineHeight: 22, fontWeight: '500' },
  imageStepHint: {
    marginTop: 10,
    color: '#C4B5FD',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  cards: { marginTop: 12, gap: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cardSelected: {
    borderColor: EMO_AVATAR_COLOR,
    backgroundColor: 'rgba(168,85,247,0.14)',
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(168,85,247,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  cardSub: { color: '#9CA3AF', fontSize: 12, fontWeight: '600', marginTop: 2 },
  orderList: { marginTop: 12, gap: 8 },
  orderChip: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  orderSkip: { borderStyle: 'dashed' },
  orderChipText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  attachComposer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#0A0A0C',
    paddingTop: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  pendingDock: { gap: 6 },
  pendingLabel: {
    color: '#A1A1AA',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  pendingEmpty: {
    color: '#7D8493',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 4,
    paddingBottom: 2,
  },
  attachBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendPill: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: EMO_AVATAR_COLOR,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  sendPillText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reviewCard: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#171923',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.35)',
    gap: 10,
  },
  reviewTitle: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  reviewBody: { color: '#D1D5DB', fontSize: 13, lineHeight: 19, fontWeight: '600' },
  submitBtn: {
    backgroundColor: EMO_AVATAR_COLOR,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnText: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#171923',
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#FFF',
    fontSize: 15,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: EMO_AVATAR_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
