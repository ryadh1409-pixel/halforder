import { USER_ROUTES } from '@/lib/navigationPaths';
import { confirmLeaveChat } from '@/hooks/useFoodShareUx';
import { hapticNewMessage } from '@/lib/foodShareHaptics';
import { FOOD_SHARE_ERRORS, foodShareErrorMessage } from '@/lib/foodShareUx';
import { SwipeCinematicBackground } from '@/components/swipe/SwipeCinematicBackground';
import { mapMatchDoc } from '@/services/foodShareMatchService';
import { notifyChatMessage } from '@/services/foodShareNotify';
import {
  sendMatchChatMessage,
  subscribeMatchMessages,
} from '@/services/matchChatService';
import { auth, db } from '@/services/firebase';
import type { MatchChatMessage } from '@/types/foodShare';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
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

import { showError } from '@/utils/toast';

export default function FoodShareChatScreen() {
  const router = useRouter();
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const id = typeof matchId === 'string' ? matchId : '';
  const myUid = auth.currentUser?.uid ?? '';

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
  const listRef = useRef<FlatList<MatchChatMessage>>(null);
  const lastMessageCountRef = useRef(0);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError('Missing match.');
      return undefined;
    }

    const matchRef = doc(db, 'matches', id);
    const unsubMatch = onSnapshot(matchRef, (snap) => {
      if (!snap.exists()) {
        setError('Match not found.');
        setLoading(false);
        return;
      }
      const match = mapMatchDoc(snap.id, snap.data() as Record<string, unknown>);
      setFoodTitle(match.foodName);
      setMatchChatId(match.matchChatId || id);
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
    });

    return unsubMatch;
  }, [id, myUid]);

  useEffect(() => {
    if (!matchChatId) return undefined;
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
  }, [matchChatId, myUid]);

  const sortedMessages = useMemo(() => messages, [messages]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !matchChatId || sending) return;
    setSending(true);
    setDraft('');
    try {
      await sendMatchChatMessage(matchChatId, text, myFirstName);
      if (partnerUid) {
        void notifyChatMessage({
          recipientUid: partnerUid,
          senderFirstName: myFirstName,
          preview: text,
          matchId: id,
        });
      }
      listRef.current?.scrollToEnd({ animated: true });
    } catch (e) {
      setDraft(text);
      showError(foodShareErrorMessage(e, FOOD_SHARE_ERRORS.sendMessageFailed));
    } finally {
      setSending(false);
    }
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

  if (error) {
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
        <Pressable
          style={styles.iconBtn}
          onPress={() => router.push(USER_ROUTES.foodShareMatch(id) as never)}
        >
          <Ionicons name="information-circle-outline" size={22} color="#FFF" />
        </Pressable>
      </View>

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
            return (
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
                </View>
              </View>
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
            style={styles.input}
            placeholder={`Message ${partnerFirstName}…`}
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={500}
          />
          <Pressable
            style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
            disabled={!draft.trim() || sending}
            onPress={() => void handleSend()}
          >
            <Ionicons name="send" size={18} color="#0A0A0A" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#06080C' },
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
  listContent: { padding: 16, paddingBottom: 8, flexGrow: 1 },
  bubbleWrap: { marginBottom: 10, maxWidth: '82%' },
  bubbleWrapMine: { alignSelf: 'flex-end' },
  bubbleWrapTheirs: { alignSelf: 'flex-start' },
  bubbleWrapSystem: { alignSelf: 'center', maxWidth: '92%' },
  senderName: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
    marginLeft: 4,
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
  bubbleText: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  bubbleTextMine: { color: '#0A0A0A' },
  bubbleTextTheirs: { color: '#FFF' },
  emptyChat: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '600',
    marginTop: 40,
    lineHeight: 20,
  },
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
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
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
