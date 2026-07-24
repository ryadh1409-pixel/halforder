import { EmoAiComposer } from '@/components/emoAi/EmoAiComposer';
import { EmoAiEmptyState } from '@/components/emoAi/EmoAiEmptyState';
import { EmoAiHeader } from '@/components/emoAi/EmoAiHeader';
import { EmoAiHero } from '@/components/emoAi/EmoAiHero';
import { EmoAiMessageList } from '@/components/emoAi/EmoAiMessageList';
import { EmoAiQuickReplies } from '@/components/emoAi/EmoAiQuickReplies';
import { UE } from '@/constants/uberEatsTheme';
import { useEmoAiChat } from '@/hooks/useEmoAiChat';
import { isRegisteredAuthUser } from '@/lib/authSession';
import { listenForHiEmoShout } from '@/services/emoAi/emoAiVoiceListen';
import { useAuth } from '@/services/AuthContext';
import { EMO_AI_BG } from '@/types/emoAi';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

export default function EmoAiScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const uid = isRegisteredAuthUser(user) ? user!.uid : null;
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [micListening, setMicListening] = useState(false);

  const {
    ready,
    started,
    messages,
    streamingText,
    typing,
    error,
    wakeNonce,
    startChatting,
    sendMessage,
    applyEasterEggResult,
  } = useEmoAiChat(uid);

  const busy = typing || Boolean(streamingText) || micListening;

  /**
   * Floating CustomTabBar footprint (pinned to screen bottom).
   * Composer sits immediately above this spacer — never under the tabs.
   */
  const tabBarBottomOffset = Math.max(14, insets.bottom + 4);
  const tabBarReserve = keyboardOpen
    ? 0
    : UE.tabBarHeight + tabBarBottomOffset + 10;

  useEffect(() => {
    const showEvt =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardOpen(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const lastUserMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m?.role === 'user') return m.content;
    }
    return null;
  }, [messages]);

  const onMicPress = useCallback(async () => {
    if (!uid) {
      Alert.alert('Sign in required', 'Sign in to unlock the Hi Emo gift.');
      return;
    }
    if (micListening || busy) return;
    setMicListening(true);
    try {
      if (!started) await startChatting();
      const result = await listenForHiEmoShout({ maxMs: 4000 });
      if (result.kind === 'denied' || result.kind === 'error') {
        await applyEasterEggResult({
          userHeard: '🎤 (mic)',
          assistantReply: result.message,
          wake: false,
        });
        return;
      }
      const claim = result.claim;
      const heard =
        claim.transcript && claim.transcript.trim()
          ? claim.transcript.trim()
          : 'Hi Emo';
      if (claim.ok) {
        await applyEasterEggResult({
          userHeard: heard,
          assistantReply: claim.message || "🎉 You woke me up! Here's your gift!",
          wake: true,
        });
        return;
      }
      if (claim.alreadyClaimed || claim.reason === 'already_claimed') {
        await applyEasterEggResult({
          userHeard: heard,
          assistantReply:
            claim.message ||
            'You already claimed your Hi emooo gift — one shout, one gift forever!',
          wake: true,
        });
        return;
      }
      await applyEasterEggResult({
        userHeard: heard,
        assistantReply:
          claim.message ||
          'That was close! Shout “Hi Emo” loud enough to wake me.',
        wake: false,
      });
    } finally {
      setMicListening(false);
    }
  }, [
    applyEasterEggResult,
    busy,
    micListening,
    startChatting,
    started,
    uid,
  ]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <EmoAiHeader
          onInfoPress={() =>
            Alert.alert(
              'Emo AI',
              'Your meal companion — here to hang out while you eat. Not customer support.',
            )
          }
        />
        <EmoAiHero
          typing={typing && !streamingText}
          streaming={Boolean(streamingText)}
          streamingTick={streamingText.length}
          lastUserMessage={lastUserMessage}
          wakeNonce={wakeNonce}
        />

        {!ready ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#A855F7" />
          </View>
        ) : !started ? (
          <EmoAiEmptyState onStart={() => void startChatting()} />
        ) : (
          <>
            <View style={styles.chat}>
              <EmoAiMessageList
                messages={messages}
                streamingText={streamingText}
                typing={typing && !streamingText}
              />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <EmoAiQuickReplies
              disabled={busy}
              onSelect={(t) => void sendMessage(t)}
            />
            <EmoAiComposer
              disabled={busy}
              micListening={micListening}
              onMicPress={() => void onMicPress()}
              onSend={(t) => void sendMessage(t)}
            />
          </>
        )}

        <View style={{ height: tabBarReserve }} pointerEvents="none" />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: EMO_AI_BG,
  },
  flex: { flex: 1 },
  chat: { flex: 1, minHeight: 0 },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: '#FCA5A5',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
});
