import { USER_ROUTES } from '@/lib/navigationPaths';
import {
  confirmBlockUser,
  confirmCancelMatch,
  confirmLeaveChat,
} from '@/hooks/useFoodShareUx';
import { hapticNewMessage } from '@/lib/foodShareHaptics';
import { FOOD_SHARE_ERRORS, FOOD_SHARE_SUCCESS, foodShareErrorMessage } from '@/lib/foodShareUx';
import { FoodShareReportModal } from '@/components/foodShare/FoodShareReportModal';
import { SwipeCinematicBackground } from '@/components/swipe/SwipeCinematicBackground';
import { useBlock } from '@/hooks/useBlock';
import {
  hasAcceptedCommunityGuidelines,
  hideFoodShareConversation,
  muteFoodShareChat,
} from '@/services/chatModeration';
import {
  reportFoodShareChat,
  type ChatReportScope,
} from '@/services/foodShareChatSafety';
import {
  blockFoodShareUser,
  cancelFoodShareMatch,
  canCancelFoodShareMatch,
  mapMatchDoc,
} from '@/services/foodShareMatchService';
import {
  sendMatchChatMessage,
  subscribeMatchMessages,
} from '@/services/matchChatService';
import { auth, db } from '@/services/firebase';
import type { MatchChatMessage } from '@/types/foodShare';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, onSnapshot, writeBatch } from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { systemActionSheet } from '@/components/SystemDialogHost';
import { showError, showSuccess } from '@/utils/toast';
import { safeToMillis } from '@/utils/safeToMillis';

const CHAT_READ_ONLY_AFTER_MS = 24 * 60 * 60 * 1000;

function formatChatTime(ms: number | null): string {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

type MessageStatus = 'sent' | 'delivered' | 'read';

function foodShareMessageStatus(item: MatchChatMessage): MessageStatus {
  if (item.readAtMs != null) return 'read';
  if (item.deliveredAtMs != null) return 'delivered';
  return 'sent';
}

function messageStatusLabel(status: MessageStatus): string {
  if (status === 'sent') return '✓';
  return '✓✓';
}

export default function FoodShareChatScreen() {
  const router = useRouter();
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const id = typeof matchId === 'string' ? matchId : '';
  const myUid = auth.currentUser?.uid ?? '';
  const { isHiddenFromMe } = useBlock();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<MatchChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [foodTitle, setFoodTitle] = useState('Meal share');
  const [partnerFirstName, setPartnerFirstName] = useState('Partner');
  const [myFirstName, setMyFirstName] = useState('You');
  const [matchChatId, setMatchChatId] = useState(id);
  const [partnerUid, setPartnerUid] = useState('');
  const [matchLifecycle, setMatchLifecycle] = useState('');
  const [adminFoodShareId, setAdminFoodShareId] = useState('');
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [completedAtMs, setCompletedAtMs] = useState<number | null>(null);
  const [reportScope, setReportScope] = useState<ChatReportScope>('conversation');
  const [reportMessageId, setReportMessageId] = useState<string | null>(null);
  const [reportPreview, setReportPreview] = useState('');
  const [moderationBanner, setModerationBanner] = useState<string | null>(null);
  const listRef = useRef<FlatList<MatchChatMessage>>(null);
  const lastMessageCountRef = useRef(0);

  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      const ok = await hasAcceptedCommunityGuidelines();
      if (!ok) {
        router.replace(
          `/community-guidelines?redirect=${encodeURIComponent(`/food-share-chat/${id}`)}` as never,
        );
      }
    })();
  }, [id, router]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError('Missing match.');
      return undefined;
    }

    const matchPath = `matches/${id}`;
    console.log('[CHAT LISTENER] attach', {
      path: matchPath,
      uid: myUid || null,
      chatId: id,
    });
    const matchRef = doc(db, 'matches', id);
    const unsubMatch = onSnapshot(
      matchRef,
      (snap) => {
        console.log('[CHAT LISTENER] snapshot', {
          path: matchPath,
          uid: myUid || null,
          chatId: id,
          exists: snap.exists(),
        });
      if (!snap.exists()) {
        setError('Match not found.');
        setLoading(false);
        return;
      }
      const match = mapMatchDoc(snap.id, snap.data() as Record<string, unknown>);
      setFoodTitle(match.foodName);
      setMatchChatId(match.matchChatId || id);
      setMatchLifecycle(match.lifecycle);
      setAdminFoodShareId(match.adminFoodShareId);
      setOrderStatus(match.orderStatus);
      const raw = snap.data() as Record<string, unknown>;
      setCompletedAtMs(
        safeToMillis(raw.completedAt) ??
          safeToMillis(raw.deliveredAt) ??
          safeToMillis(raw.updatedAt),
      );
      if (match.status === 'CANCELLED' || match.lifecycle === 'CANCELLED') {
        setError('This match was cancelled.');
      }
      if (myUid === match.userA.uid) {
        setPartnerFirstName(match.userB.firstName);
        setMyFirstName(match.userA.firstName);
        setPartnerUid(match.userB.uid);
      } else {
        setPartnerFirstName(match.userA.firstName);
        setMyFirstName(match.userB.firstName);
        setPartnerUid(match.userA.uid);
      }
      setError(null);
      setLoading(false);
    },
    (error) => {
      console.error('[CHAT LISTENER] permission/error', {
        path: matchPath,
        uid: myUid || null,
        chatId: id,
        code: error.code,
        message: error.message,
        error,
      });
      setError(foodShareErrorMessage(error, FOOD_SHARE_ERRORS.connectionLost));
      setLoading(false);
    });

    return unsubMatch;
  }, [id, myUid]);

  const blocked = isHiddenFromMe(partnerUid);
  const chatClosed =
    blocked ||
    matchLifecycle === 'CANCELLED' ||
    error === 'This match was cancelled.';
  const chatReadOnly =
    (matchLifecycle === 'COMPLETED' || matchLifecycle === 'DELIVERED') &&
    completedAtMs != null &&
    Date.now() - completedAtMs >= CHAT_READ_ONLY_AFTER_MS;

  useEffect(() => {
    if (!matchChatId || chatClosed) return undefined;
    return subscribeMatchMessages(matchChatId, (next) => {
      const prevCount = lastMessageCountRef.current;
      if (prevCount > 0 && next.length > prevCount) {
        const latest = next[next.length - 1];
        if (latest && latest.senderId !== myUid && latest.senderId !== 'system') {
          hapticNewMessage();
        }
      }
      lastMessageCountRef.current = next.length;
      setMessages(next);
    });
  }, [matchChatId, myUid, chatClosed]);

  useEffect(() => {
    if (!matchChatId || chatClosed || !myUid) return;
    const incoming = messages.filter(
      (item) =>
        item.senderId &&
        item.senderId !== myUid &&
        item.senderId !== 'system' &&
        item.readAtMs == null,
    );
    if (incoming.length === 0) return;

    const batch = writeBatch(db);
    const now = Date.now();
    incoming.forEach((item) => {
      const patch =
        item.deliveredAtMs == null
          ? { deliveredAt: now, readAt: now }
          : { readAt: now };
      batch.update(doc(db, 'matchChats', matchChatId, 'matchMessages', item.id), patch);
    });
    batch.commit().catch(() => {
      /* offline / rules */
    });
  }, [matchChatId, chatClosed, messages, myUid]);

  const sortedMessages = useMemo(() => messages, [messages]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !matchChatId || sending || chatClosed || chatReadOnly) return;
    setSending(true);
    setDraft('');
    try {
      const result = await sendMatchChatMessage(
        matchChatId,
        text,
        myFirstName,
        partnerUid,
      );
      if (!result.ok) {
        setDraft(text);
        setModerationBanner(result.message);
        if (result.code === 'GUIDELINES_REQUIRED') {
          router.replace(
            `/community-guidelines?redirect=${encodeURIComponent(`/food-share-chat/${id}`)}` as never,
          );
          return;
        }
        showError(result.message);
        return;
      }
      setModerationBanner(null);
      listRef.current?.scrollToEnd({ animated: true });
    } catch (e) {
      setDraft(text);
      showError(foodShareErrorMessage(e, FOOD_SHARE_ERRORS.sendMessageFailed));
    } finally {
      setSending(false);
    }
  };

  const openSafetyMenu = () => {
    void systemActionSheet({
      title: 'Safety',
      message: `Actions for ${partnerFirstName}`,
      actions: [
        {
          label: 'Mute notifications',
          onPress: () => {
            void (async () => {
              try {
                await muteFoodShareChat(matchChatId);
                showSuccess('Chat muted.');
              } catch (e) {
                showError(foodShareErrorMessage(e, FOOD_SHARE_ERRORS.connectionLost));
              }
            })();
          },
        },
        {
          label: 'Report conversation',
          onPress: () => {
            setReportScope('conversation');
            setReportMessageId(null);
            setReportPreview('');
            setReportOpen(true);
          },
        },
        {
          label: 'Delete conversation',
          destructive: true,
          onPress: () => {
            void (async () => {
              try {
                await hideFoodShareConversation(matchChatId);
                showSuccess('Conversation hidden.');
                router.back();
              } catch (e) {
                showError(foodShareErrorMessage(e, FOOD_SHARE_ERRORS.connectionLost));
              }
            })();
          },
        },
        {
          label: 'Report user',
          onPress: () => {
            setReportScope('conversation');
            setReportOpen(true);
          },
        },
        {
          label: 'Block user',
          destructive: true,
          onPress: () => {
            void (async () => {
              const ok = await confirmBlockUser(partnerFirstName);
              if (!ok) return;
              try {
                await blockFoodShareUser({
                  blockedUid: partnerUid,
                  matchId: id,
                  blockerFirstName: myFirstName,
                  foodName: foodTitle,
                  adminFoodShareId,
                });
                showSuccess(FOOD_SHARE_SUCCESS.userBlocked);
                router.back();
              } catch (e) {
                showError(foodShareErrorMessage(e, FOOD_SHARE_ERRORS.blockFailed));
              }
            })();
          },
        },
        ...(canCancelFoodShareMatch(matchLifecycle, orderStatus)
          ? [
              {
                label: 'Cancel match',
                destructive: true,
                onPress: () => {
                  void (async () => {
                    const ok = await confirmCancelMatch(foodTitle);
                    if (!ok) return;
                    try {
                      await cancelFoodShareMatch({
                        matchId: id,
                        partnerUid,
                        cancelledByFirstName: myFirstName,
                        foodName: foodTitle,
                        adminFoodShareId,
                      });
                      showSuccess('Match cancelled');
                      router.back();
                    } catch (e) {
                      showError(foodShareErrorMessage(e, FOOD_SHARE_ERRORS.cancelFailed));
                    }
                  })();
                },
              },
            ]
          : []),
      ],
    });
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <SwipeCinematicBackground />
        <ActivityIndicator color="#7DFFB8" size="large" />
        <Text style={styles.loadingText}>Opening chat…</Text>
      </View>
    );
  }

  if (error && error !== 'This match was cancelled.') {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <SwipeCinematicBackground />
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Chat unavailable</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnTxt}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <SwipeCinematicBackground />
      <View style={styles.header}>
        <Pressable
          style={styles.iconBtn}
          onPress={() => {
            void (async () => {
              const leave = await confirmLeaveChat();
              if (leave) router.back();
            })();
          }}
        >
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>{partnerFirstName}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {foodTitle}
          </Text>
        </View>
        <Pressable style={styles.iconBtn} onPress={openSafetyMenu}>
          <Ionicons name="shield-outline" size={20} color="#FFF" />
        </Pressable>
        <Pressable
          style={styles.iconBtn}
          onPress={() => router.push(USER_ROUTES.foodShareMatch(id) as never)}
        >
          <Ionicons name="information-circle-outline" size={22} color="#FFF" />
        </Pressable>
      </View>

      {moderationBanner ? (
        <View style={styles.closedBanner}>
          <Text style={styles.closedTitle}>Message not sent</Text>
          <Text style={styles.closedBody}>{moderationBanner}</Text>
        </View>
      ) : null}

      {chatClosed ? (
        <View style={styles.closedBanner}>
          <Text style={styles.closedTitle}>
            {blocked ? 'Chat closed' : 'Match ended'}
          </Text>
          <Text style={styles.closedBody}>
            {blocked
              ? `You can no longer message ${partnerFirstName}.`
              : 'This match is no longer active.'}
          </Text>
        </View>
      ) : null}
      {chatReadOnly ? (
        <View style={styles.closedBanner}>
          <Text style={styles.closedTitle}>Chat is read-only</Text>
          <Text style={styles.closedBody}>Chats close 24 hours after order completion.</Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <FlatList
          ref={listRef}
          data={sortedMessages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: false })
          }
          renderItem={({ item }) => {
            const mine = item.senderId === myUid;
            const system = item.senderId === 'system';
            const timeLabel = system ? '' : formatChatTime(item.createdAtMs);
            const messageStatus = mine ? foodShareMessageStatus(item) : null;
            return (
              <Pressable
                onLongPress={() => {
                  if (system || mine) return;
                  setReportScope('message');
                  setReportMessageId(item.id);
                  setReportPreview(item.text);
                  setReportOpen(true);
                }}
              >
              <View
                style={[
                  styles.bubbleWrap,
                  mine ? styles.bubbleWrapMine : styles.bubbleWrapTheirs,
                  system && styles.bubbleWrapSystem,
                ]}
              >
                {!mine && !system ? (
                  <Text style={styles.senderName}>{item.senderFirstName}</Text>
                ) : null}
                <View
                  style={[
                    styles.bubble,
                    mine ? styles.bubbleMine : styles.bubbleTheirs,
                    system && styles.bubbleSystem,
                  ]}
                >
                  <Text
                    style={[
                      styles.bubbleText,
                      mine ? styles.bubbleTextMine : styles.bubbleTextTheirs,
                    ]}
                  >
                    {item.text}
                  </Text>
                  {!system ? (
                    <View
                      style={[
                        styles.bubbleMetaRow,
                        mine ? styles.bubbleMetaRowMine : styles.bubbleMetaRowTheirs,
                      ]}
                    >
                      {timeLabel ? (
                        <Text style={styles.timestamp}>{timeLabel}</Text>
                      ) : null}
                      {messageStatus ? (
                        <Text
                          style={[
                            styles.statusLabel,
                            messageStatus === 'read' && styles.statusLabelRead,
                          ]}
                          accessibilityLabel={`Message ${messageStatus}`}
                        >
                          {messageStatusLabel(messageStatus)}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.emptyChat}>
              Say hi to {partnerFirstName} and coordinate your shared meal.
            </Text>
          }
        />

        <View style={styles.composer}>
          <TextInput
            style={[styles.input, chatClosed && styles.inputDisabled]}
            placeholder={
              chatReadOnly
                ? 'Chat is read-only'
                : chatClosed
                ? 'Messaging disabled'
                : `Message ${partnerFirstName}…`
            }
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={500}
            editable={!chatClosed && !chatReadOnly && !sending}
            textAlign="left"
          />
          <Pressable
            style={[
              styles.sendBtn,
              ((!draft.trim() || sending) || chatClosed || chatReadOnly) && styles.sendBtnDisabled,
            ]}
            disabled={!draft.trim() || sending || chatClosed || chatReadOnly}
            onPress={() => void handleSend()}
          >
            <Ionicons name="send" size={18} color="#0A0A0A" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <FoodShareReportModal
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        reportedFirstName={partnerFirstName}
        onSubmit={async ({ reason, description }) => {
          await reportFoodShareChat({
            reportedUid: partnerUid,
            matchId: id,
            scope: reportScope,
            messageId: reportMessageId ?? undefined,
            messagePreview: reportPreview || undefined,
            reason,
            description,
          });
          showSuccess(FOOD_SHARE_SUCCESS.reportSubmitted);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#06080C', direction: 'ltr' },
  flex: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: 'rgba(255,255,255,0.65)', fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { color: '#FFF', fontWeight: '900', fontSize: 17 },
  headerSub: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '600' },
  closedBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(251,113,133,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251,113,133,0.25)',
  },
  closedTitle: { color: '#FB7185', fontWeight: '800', fontSize: 15 },
  closedBody: { color: 'rgba(255,255,255,0.7)', marginTop: 4, fontSize: 13 },
  listContent: { padding: 16, paddingBottom: 8, flexGrow: 1, direction: 'ltr' },
  bubbleWrap: { marginBottom: 10, maxWidth: '82%', direction: 'ltr' },
  bubbleWrapMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleWrapTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubbleWrapSystem: { alignSelf: 'center', maxWidth: '92%' },
  senderName: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
    marginLeft: 4,
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    direction: 'ltr',
  },
  bubbleMine: { backgroundColor: '#7DFFB8' },
  bubbleTheirs: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  bubbleSystem: {
    backgroundColor: 'rgba(255,107,53,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.25)',
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  bubbleTextMine: { color: '#0A0A0A' },
  bubbleTextTheirs: { color: '#FFF' },
  timestamp: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  bubbleMetaRow: {
    flexDirection: 'row',
    direction: 'ltr',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  bubbleMetaRowMine: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  bubbleMetaRowTheirs: { alignSelf: 'flex-start', justifyContent: 'flex-start' },
  statusLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  statusLabelRead: { color: '#38BDF8' },
  emptyChat: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '600',
    marginTop: 40,
    lineHeight: 20,
  },
  composer: {
    flexDirection: 'row',
    direction: 'ltr',
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
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  inputDisabled: { opacity: 0.5 },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#7DFFB8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.45 },
  errorBox: { flex: 1, justifyContent: 'center', padding: 24 },
  errorTitle: { color: '#FFF', fontWeight: '900', fontSize: 22 },
  errorBody: { color: '#FB7185', marginTop: 8, fontWeight: '600' },
  backBtn: {
    marginTop: 20,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  backBtnTxt: { color: '#FFF', fontWeight: '800' },
});
